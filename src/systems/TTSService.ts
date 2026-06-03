import { ServiceLocator } from '@core/ServiceLocator';
import { SettingsService } from './SettingsService';
import { AudioManager } from './AudioManager';
import { voiceForSubject, narratorVoice } from './VoiceAssigner';
import type { Gender } from '@entities/CharacterData';

/**
 * Local neural text-to-speech (Kokoro via `kokoro-js`, Apache-2.0). Each NPC
 * speaks its lines in its own voice; a narrator voices select cinematic beats.
 *
 * The model runs 100% in the renderer (transformers.js / onnxruntime-web, WASM)
 * — no Python, no subprocess. The model is loaded lazily the first time TTS is
 * needed and only when `ttsEnabled` is on; every failure path is **fail-open**
 * (a silent no-op) so audio never blocks the game.
 *
 * Pure helpers (text extraction + the speak gate) are unit-tested; the model
 * load + synthesis + playback are browser-only and `istanbul ignore`d.
 */

/** Hugging Face model id for the Kokoro 82M ONNX build. */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Quantization to load (q8 ≈ 80 MB, good quality/size trade for local TTS). */
export const KOKORO_DTYPE = 'q8';

/**
 * Reduce an NPC line to the spoken words only: drop `*emote*` stage directions
 * and collapse whitespace. Pure. Empty when the line is all emotes.
 */
export function ttsSpeechText(line: string): string {
  return line
    .replace(/\*[^*]+\*/g, ' ')   // strip *emotes*
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a line should be spoken at all: TTS enabled, non-empty after
 * stripping emotes. Pure (settings injected as a flag).
 */
export function shouldSpeak(line: string, ttsEnabled: boolean): boolean {
  return ttsEnabled && ttsSpeechText(line).length > 0;
}

/** Minimal structural type for the kokoro-js instance we use (avoids a hard dep in types). */
interface KokoroLike {
  generate(text: string, opts: { voice: string }): Promise<{ toBlob(): Blob }>;
}

export class TTSService {
  private tts: KokoroLike | null = null;
  private loading: Promise<KokoroLike | null> | null = null;
  private failed = false;
  /** Increments per utterance so a stale async generation never plays over a newer one. */
  private token = 0;
  private current: HTMLAudioElement | null = null;

  /** Speak an NPC's line in its assigned voice (emotes stripped). Fail-open. */
  speakSubject(subject: { id?: string; gender: Gender }, line: string): void {
    this.speak(voiceForSubject(subject), line);
  }

  /** Speak a cinematic narration line in the narrator voice. Fail-open. */
  speakNarrator(line: string): void {
    this.speak(narratorVoice(), line);
  }

  /** Stop any in-flight utterance (e.g. dialog closed / new speaker). */
  cancel(): void {
    this.token++;
    /* istanbul ignore next — browser-only */
    if (this.current) { try { this.current.pause(); } catch { /* noop */ } this.current = null; }
  }

  /**
   * Core speak: gate on settings, then (browser-only) lazy-load Kokoro and play
   * the synthesized clip on the voice bus. Pure-side returns early; the heavy
   * path is istanbul-ignored and fail-open.
   */
  speak(voice: string, line: string): void {
    const text = ttsSpeechText(line);
    if (!shouldSpeak(line, SettingsService.get('ttsEnabled'))) return;
    /* istanbul ignore next — browser-only synthesis/playback */
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
    /* istanbul ignore next — browser-only synthesis/playback */
    void this.synthesizeAndPlay(voice, text);
  }

  /* istanbul ignore next — browser-only: lazy model load + synth + playback */
  private async synthesizeAndPlay(voice: string, text: string): Promise<void> {
    const myToken = ++this.token;
    /* eslint-disable no-console */
    try {
      console.warn(`[TTS] speak voice=${voice} "${text.slice(0, 48)}"`);
      const model = await this.ensureModel();
      if (!model || myToken !== this.token) return; // failed, or superseded
      const audio = await this.generate(model, voice, text);
      if (!audio || myToken !== this.token) return;
      const gain = this.voiceGain();
      if (gain <= 0) { console.warn('[TTS] voice bus muted/zero — check Options › Sound (Voice volume + TTS on, master not muted)'); return; }
      const url = URL.createObjectURL(audio.toBlob());
      const el = new Audio(url);
      el.volume = gain;
      this.current = el;
      const cleanup = (): void => { URL.revokeObjectURL(url); };
      el.addEventListener('ended', cleanup, { once: true });
      el.addEventListener('error', cleanup, { once: true });
      void el.play().catch(() => cleanup());
    } catch (err) {
      this.failed = true; // fail-open: never throw into the game loop
      console.warn('[TTS] synth/playback failed:', err);
    }
    /* eslint-enable no-console */
  }

  /* istanbul ignore next — browser-only model load (network/disk) */
  private async ensureModel(): Promise<KokoroLike | null> {
    if (this.tts) return this.tts;
    if (this.failed) return null;
    if (!this.loading) {
      this.loading = (async (): Promise<KokoroLike | null> => {
        /* eslint-disable no-console */
        try {
          // Use a vendored offline model under /models ONLY if it's actually
          // present — otherwise the dev server answers /models/... with
          // index.html (200, text/html), which transformers.js would mistake
          // for the model. Probe config.json; fall back to the HF hub on first
          // run (then the browser caches it).
          let useLocal = false;
          try {
            const probe = await fetch(`/models/${KOKORO_MODEL_ID}/config.json`);
            const ct = probe.headers.get('content-type') ?? '';
            useLocal = probe.ok && ct.includes('json');
          } catch { /* offline probe failed → remote */ }
          try {
            const tf = await import('@huggingface/transformers');
            const env = (tf as { env?: { allowLocalModels?: boolean; localModelPath?: string } }).env;
            if (env) { env.allowLocalModels = useLocal; if (useLocal) env.localModelPath = '/models/'; }
          } catch { /* remote-only is fine */ }
          console.warn(`[TTS] loading Kokoro model (${useLocal ? 'vendored /models' : 'Hugging Face hub'}, ${KOKORO_DTYPE}/wasm) — first run downloads ~80MB…`);
          // @ts-ignore — kokoro-js resolves under the build tsconfig; ts-jest's
          // resolver can't read its `exports` types map (this path is browser-only).
          const { KokoroTTS } = await import('kokoro-js');
          const model = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
            dtype: KOKORO_DTYPE as 'q8',
            device: 'wasm',
            progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
              if (p?.status === 'progress' && typeof p.progress === 'number') {
                console.warn(`[TTS] downloading ${p.file ?? ''} ${Math.round(p.progress)}%`);
              }
            },
          });
          this.tts = model as unknown as KokoroLike;
          console.warn('[TTS] Kokoro model ready');
          return this.tts;
        } catch (err) {
          this.failed = true;
          console.warn('[TTS] model load failed (voice disabled this session):', err);
          return null;
        }
        /* eslint-enable no-console */
      })();
    }
    return this.loading;
  }

  /* istanbul ignore next — browser-only synthesis */
  private async generate(model: KokoroLike, voice: string, text: string): Promise<{ toBlob(): Blob } | null> {
    try { return await model.generate(text, { voice }); }
    catch { return null; }
  }

  /* istanbul ignore next — browser-only: read the live voice-bus gain */
  private voiceGain(): number {
    const audio = ServiceLocator.tryGet<AudioManager>('audio');
    return audio ? audio.effective('voice') : 0;
  }

  dispose(): void {
    this.cancel();
  }
}
