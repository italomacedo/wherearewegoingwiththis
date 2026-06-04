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
  | { id: number; seq: number; wav: ArrayBuffer } // one synthesized sentence chunk
  | { id: number; done: true }                    // stream finished
  | { id: number; error: string }
  | { type: 'log'; msg: string };

export class TTSService {
  private worker: Worker | null = null;
  private failed = false;
  /** Increments per utterance so a stale worker result never plays over a newer one. */
  private token = 0;
  private current: HTMLAudioElement | null = null;
  // Ordered playback queue: a sentence chunk only plays when it's the NEXT seq,
  // so audio always plays in the original sentence order regardless of which
  // chunk's synthesis finishes first.
  private chunkUrls = new Map<number, string>();
  private nextSeq = 0;
  private playing = false;

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
    this.resetPlayback();
  }

  /** Drop the playback queue + stop the current clip (a new utterance supersedes). */
  /* istanbul ignore next — browser-only */
  private resetPlayback(): void {
    if (this.current) { try { this.current.pause(); } catch { /* noop */ } this.current = null; }
    this.chunkUrls.forEach((url) => URL.revokeObjectURL(url));
    this.chunkUrls.clear();
    this.nextSeq = 0;
    this.playing = false;
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
    this.resetPlayback(); // a new line supersedes whatever was queued/playing
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

  /* istanbul ignore next — browser-only: queue a worker result, play in seq order */
  private onWorkerMessage(data: WorkerOut): void {
    /* eslint-disable no-console */
    if ('type' in data) { console.warn('[TTS]', data.msg); return; }
    if ('error' in data) { console.warn('[TTS] synth failed:', data.error); return; }
    if (data.id !== this.token) return; // superseded by a newer utterance
    if ('done' in data) return;         // stream finished; queue drains on its own
    // Buffer this sentence chunk by its seq, then play in strict order.
    this.chunkUrls.set(data.seq, URL.createObjectURL(new Blob([data.wav], { type: 'audio/wav' })));
    this.playNextChunk();
  }

  /** Play the chunk whose seq == nextSeq, if present; chain to the next on end. */
  /* istanbul ignore next — browser-only playback */
  private playNextChunk(): void {
    if (this.playing) return;
    const url = this.chunkUrls.get(this.nextSeq);
    if (!url) return; // the next-in-order chunk hasn't arrived yet
    this.chunkUrls.delete(this.nextSeq);
    const gain = this.voiceGain();
    const advance = (): void => {
      URL.revokeObjectURL(url);
      this.playing = false;
      this.nextSeq++;
      this.playNextChunk();
    };
    if (gain <= 0) { // muted — drain the queue without audio so order stays intact
      console.warn('[TTS] voice bus muted/zero — check Options › Sound (Voice volume + TTS on, master not muted)');
      advance();
      return;
    }
    try {
      const el = new Audio(url);
      el.volume = gain;
      this.current = el;
      this.playing = true;
      el.addEventListener('ended', advance, { once: true });
      el.addEventListener('error', advance, { once: true });
      void el.play().catch(advance);
    } catch (err) {
      console.warn('[TTS] playback failed:', err);
      advance();
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
