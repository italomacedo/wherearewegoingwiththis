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
  // Gapless ordered playback via Web Audio: each sentence chunk is decoded then
  // SCHEDULED back-to-back by seq on one AudioContext. This avoids the
  // HTMLAudioElement pitfalls (per-clip play() rejections that silently dropped
  // sentences) and guarantees strict sentence order.
  private audioCtx: AudioContext | null = null;
  private decoded = new Map<number, AudioBuffer | null>(); // null = decode failed (skip, don't stall)
  private scheduleSeq = 0;          // next seq allowed to schedule (preserves order)
  private scheduleCursor = 0;       // AudioContext time the next chunk starts at
  private liveSources = new Set<AudioBufferSourceNode>();

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

  /** Stop all scheduled clips + clear the queue (a new utterance supersedes). */
  /* istanbul ignore next — browser-only */
  private resetPlayback(): void {
    /* istanbul ignore next */
    if (this.liveSources.size || this.decoded.size) { /* eslint-disable-next-line no-console */ console.warn(`[TTS] reset — stop ${this.liveSources.size} playing, drop ${this.decoded.size} queued`); }
    this.liveSources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    this.liveSources.clear();
    this.decoded.clear();
    this.scheduleSeq = 0;
    this.scheduleCursor = this.audioCtx ? this.audioCtx.currentTime : 0;
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

  /* istanbul ignore next — browser-only: decode a worker chunk, schedule in seq order */
  private onWorkerMessage(data: WorkerOut): void {
    /* eslint-disable no-console */
    if ('type' in data) { console.warn('[TTS]', data.msg); return; }
    if ('error' in data) { console.warn('[TTS] synth failed:', data.error); return; }
    if (data.id !== this.token) return; // superseded by a newer utterance
    if ('done' in data) return;         // stream finished; the schedule drains on its own
    void this.decodeChunk(data.id, data.seq, data.wav);
    /* eslint-enable no-console */
  }

  /** Lazily create (and resume) the shared AudioContext. */
  /* istanbul ignore next — browser-only Web Audio */
  private ensureAudioCtx(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.audioCtx = new Ctor();
    void this.audioCtx.resume?.();
    return this.audioCtx;
  }

  /** Decode one WAV chunk, then drain the schedule in strict seq order. */
  /* istanbul ignore next — browser-only Web Audio */
  private async decodeChunk(id: number, seq: number, wav: ArrayBuffer): Promise<void> {
    /* eslint-disable no-console */
    const ctx = this.ensureAudioCtx();
    if (!ctx) return;
    let buf: AudioBuffer | null = null;
    try {
      buf = await ctx.decodeAudioData(wav);
    } catch (err) {
      console.warn('[TTS] decode failed seq', seq, err); // tombstone (null) so the queue doesn't stall
    }
    if (id !== this.token) { console.warn('[TTS] drop seq', seq, '(superseded while decoding)'); return; }
    console.warn('[TTS] decoded seq', seq, buf ? `${buf.duration.toFixed(2)}s` : 'FAILED');
    this.decoded.set(seq, buf);
    this.drainSchedule();
    /* eslint-enable no-console */
  }

  /** Schedule every contiguous decoded chunk from scheduleSeq onward, gapless. */
  /* istanbul ignore next — browser-only Web Audio */
  private drainSchedule(): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    while (this.decoded.has(this.scheduleSeq)) {
      const buf = this.decoded.get(this.scheduleSeq) ?? null;
      this.decoded.delete(this.scheduleSeq);
      this.scheduleSeq++;
      if (!buf) continue; // failed-decode tombstone: skip but keep order
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = this.voiceGain(); // 0 when muted — still scheduled, just silent
      src.connect(gain).connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, this.scheduleCursor);
      src.start(startAt);
      this.scheduleCursor = startAt + buf.duration;
      this.liveSources.add(src);
      src.onended = (): void => { this.liveSources.delete(src); };
      /* eslint-disable-next-line no-console */
      console.warn(`[TTS] schedule seq ${this.scheduleSeq - 1} @ ${startAt.toFixed(2)} (now ${ctx.currentTime.toFixed(2)})`);
    }
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
