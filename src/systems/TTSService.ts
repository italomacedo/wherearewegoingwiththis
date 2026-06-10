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

/** A world-space point (or direction). */
export interface Vec3 { x: number; y: number; z: number; }

// Spatial-audio attenuation for NPC voices (Web Audio PannerNode, inverse model).
// Exposed so the owner can recalibrate the falloff without touching the graph code.
export const PANNER_REF_DISTANCE = 3;   // full volume within this many metres
export const PANNER_MAX_DISTANCE = 40;  // attenuation clamps beyond this
export const PANNER_ROLLOFF = 1;        // how fast volume drops with distance

/**
 * Babylon is left-handed (Y-up, +Z forward); Web Audio is right-handed. Convert
 * any point/direction between them by negating Z. Applied consistently to both
 * the listener frame and the panner position so left/right stays coherent. Pure.
 */
export function toAudioFrame(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: -v.z };
}

/**
 * Decide whether a line plays spatially (from a world source) or globally.
 * Spatial only when a finite source position is supplied (an NPC); narrator
 * lines pass `null`/undefined → centred. Pure.
 */
export function spatialParamsFor(pos: Vec3 | null | undefined): { panned: boolean } {
  return {
    panned: !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z),
  };
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
  // All voice audio passes through this analyser before the destination, so the
  // cockpit can draw a live waveform of whoever is speaking (Roxane, on the
  // dashboard). Created lazily with the AudioContext.
  private analyser: AnalyserNode | null = null;
  // World-space source of the current utterance (already in the Web Audio frame),
  // or null for a global/narrator voice. Set per utterance in speak(); read when
  // each chunk is scheduled so the whole line shares one source position.
  private currentPan: Vec3 | null = null;

  /**
   * Speak an NPC's line in its assigned voice (emotes stripped). When `pos`
   * (the speaker's world position) is given, the line plays spatially from that
   * point; omit it for a centred voice. Fail-open.
   */
  speakSubject(subject: { id?: string; gender: Gender }, line: string, pos?: Vec3): void {
    this.speak(voiceForSubject(subject), line, pos);
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

  /** True while at least one voice chunk is scheduled/playing. Browser-only. */
  /* istanbul ignore next — browser-only Web Audio */
  isSpeaking(): boolean {
    return this.liveSources.size > 0;
  }

  /**
   * Fill `out` with the current voice spectrum (bytes 0..255) for the cockpit
   * waveform. No-op (leaves zeros) when no analyser exists yet. Browser-only.
   */
  /* istanbul ignore next — browser-only Web Audio */
  sampleFrequencies(out: Uint8Array): void {
    // The DOM lib types the buffer as Uint8Array<ArrayBuffer>; our scratch buffer
    // is a plain Uint8Array — cast (the runtime contract is identical).
    if (this.analyser) this.analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    else out.fill(0);
  }

  /** Stop all scheduled clips + clear the queue (a new utterance supersedes). */
  /* istanbul ignore next — browser-only */
  private resetPlayback(): void {
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
  speak(voice: string, line: string, pos?: Vec3): void {
    const text = ttsSpeechText(line);
    if (!shouldSpeak(line, SettingsService.get('ttsEnabled'))) return;
    // Capture the source position for this whole utterance (NPCs stay put while
    // talking; the moving listener is what tracks the camera each frame).
    this.currentPan = spatialParamsFor(pos).panned ? toAudioFrame(pos as Vec3) : null;
    /* istanbul ignore next — browser-only (no Worker in Jest/Node) */
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    /* istanbul ignore next — browser-only dispatch */
    void this.dispatch(voice, text);
  }

  /**
   * Drive the Web Audio listener from the camera (position + orientation) so NPC
   * voices are heard relative to the player's view. Called every frame by the
   * scene; no-op until the AudioContext exists (first utterance). Browser-only.
   */
  /* istanbul ignore next — browser-only Web Audio */
  updateListener(pos: Vec3, forward: Vec3, up: Vec3): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    const l = ctx.listener;
    const p = toAudioFrame(pos);
    const f = toAudioFrame(forward);
    const u = toAudioFrame(up);
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
      l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
    } else {
      // Older Web Audio: the deprecated combined setters.
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
      (l as unknown as { setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void })
        .setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
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
    // One analyser between the voice chain and the speakers; the cockpit taps it
    // for Roxane's waveform. Small FFT — we only need a few dozen bars.
    try {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.analyser.connect(this.audioCtx.destination);
    } catch { this.analyser = null; }
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
    if (id !== this.token) return; // superseded while decoding
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
      // Route through the analyser (→ destination) so the cockpit waveform reacts
      // to the real voice audio; fall back to the destination if it failed to init.
      const sink: AudioNode = this.analyser ?? ctx.destination;
      const pan = this.currentPan;
      if (pan) {
        // NPC voice: place it in the world. The panner sits before the analyser
        // so the cockpit waveform still reflects the (distance-attenuated) voice.
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = PANNER_REF_DISTANCE;
        panner.maxDistance = PANNER_MAX_DISTANCE;
        panner.rolloffFactor = PANNER_ROLLOFF;
        this.setPannerPos(panner, pan);
        src.connect(gain).connect(panner).connect(sink);
      } else {
        src.connect(gain).connect(sink); // global/narrator voice — centred
      }
      const startAt = Math.max(ctx.currentTime, this.scheduleCursor);
      src.start(startAt);
      this.scheduleCursor = startAt + buf.duration;
      this.liveSources.add(src);
      src.onended = (): void => { this.liveSources.delete(src); };
    }
  }

  /* istanbul ignore next — browser-only Web Audio: set a panner's world position */
  private setPannerPos(panner: PannerNode, p: Vec3): void {
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else {
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
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
