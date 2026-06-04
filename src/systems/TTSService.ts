import { ServiceLocator } from '@core/ServiceLocator';
import { SettingsService } from './SettingsService';
import { AudioManager } from './AudioManager';
import { voiceForSubject, narratorVoice } from './VoiceAssigner';
import { KOKORO_MODEL_ID, KOKORO_DTYPE } from './TTSConfig';
import type { Gender } from '@entities/CharacterData';

/**
 * Local neural text-to-speech (Kokoro via `kokoro-js`, Apache-2.0). Each NPC
 * speaks its lines in its own voice; a narrator voices select cinematic beats.
 *
 * The model runs 100% in the renderer (transformers.js / onnxruntime-web) but
 * inside a **Web Worker** (`ttsWorker`), so the heavy synthesis never blocks the
 * render thread — the game stays responsive while a line is generated. Loaded
 * lazily on first use and only when `ttsEnabled`; every failure path is
 * **fail-open** (a silent no-op).
 *
 * Pure helpers (text extraction + the speak gate) are unit-tested; the worker
 * dispatch + playback are browser-only and `istanbul ignore`d.
 */

// Re-exported for tests / callers (the worker reads them from TTSConfig).
export { KOKORO_MODEL_ID, KOKORO_DTYPE };

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

/** Worker → main message shapes. */
type WorkerOut =
  | { id: number; wav: ArrayBuffer }
  | { id: number; error: string }
  | { type: 'log'; msg: string };

export class TTSService {
  private worker: Worker | null = null;
  private failed = false;
  /** Increments per utterance so a stale worker result never plays over a newer one. */
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
   * Core speak: gate on settings, then (browser-only) dispatch the text to the
   * TTS worker. Pure-side returns early; the worker/playback path is
   * istanbul-ignored and fail-open.
   */
  speak(voice: string, line: string): void {
    const text = ttsSpeechText(line);
    if (!shouldSpeak(line, SettingsService.get('ttsEnabled'))) return;
    /* istanbul ignore next — browser-only (no Worker in Jest/Node) */
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    /* istanbul ignore next — browser-only dispatch */
    void this.dispatch(voice, text);
  }

  /* istanbul ignore next — browser-only: lazy worker init + post */
  private async dispatch(voice: string, text: string): Promise<void> {
    if (this.failed) return;
    const id = ++this.token;
    /* eslint-disable no-console */
    try {
      if (!this.worker) {
        const { createTtsWorker } = await import('./ttsWorkerClient');
        const w = createTtsWorker();
        w.onmessage = (e: MessageEvent<WorkerOut>) => this.onWorkerMessage(e.data);
        w.onerror = (e: ErrorEvent) => { console.warn('[TTS] worker error:', e.message); };
        this.worker = w;
      }
      console.warn(`[TTS] speak voice=${voice} "${text.slice(0, 48)}"`);
      this.worker.postMessage({ id, voice, text });
    } catch (err) {
      this.failed = true;
      console.warn('[TTS] worker init failed (voice disabled this session):', err);
    }
    /* eslint-enable no-console */
  }

  /* istanbul ignore next — browser-only: handle a worker result, play on the voice bus */
  private onWorkerMessage(data: WorkerOut): void {
    /* eslint-disable no-console */
    if ('type' in data) { console.warn('[TTS]', data.msg); return; }
    if ('error' in data) { console.warn('[TTS] synth failed:', data.error); return; }
    if (data.id !== this.token) return; // superseded by a newer utterance
    const gain = this.voiceGain();
    if (gain <= 0) { console.warn('[TTS] voice bus muted/zero — check Options › Sound (Voice volume + TTS on, master not muted)'); return; }
    try {
      const url = URL.createObjectURL(new Blob([data.wav], { type: 'audio/wav' }));
      const el = new Audio(url);
      el.volume = gain;
      this.current = el;
      const cleanup = (): void => { URL.revokeObjectURL(url); };
      el.addEventListener('ended', cleanup, { once: true });
      el.addEventListener('error', cleanup, { once: true });
      void el.play().catch(() => cleanup());
    } catch (err) {
      console.warn('[TTS] playback failed:', err);
    }
    /* eslint-enable no-console */
  }

  /* istanbul ignore next — browser-only: read the live voice-bus gain */
  private voiceGain(): number {
    const audio = ServiceLocator.tryGet<AudioManager>('audio');
    return audio ? audio.effective('voice') : 0;
  }

  dispose(): void {
    this.cancel();
    /* istanbul ignore next — browser-only teardown */
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
