import type { Scene } from '@babylonjs/core';
import type { EventBus } from '@core/EventBus';
import { SettingsService, type GameSettings } from './SettingsService';
import { sfxSpec } from './SfxCatalog';
import { musicSpec, musicForScene, fadeStep, MUSIC_FADE_MS } from './MusicCatalog';

/**
 * Audio mixing buses. `master` scales every other bus; `music`/`sfx`/`voice`
 * each carry their own volume + mute toggle (the `voice` mute is the TTS switch).
 */
export type AudioBus = 'master' | 'music' | 'sfx' | 'voice';

export interface BusState {
  /** Raw 0–1 volume. */
  volume: number;
  /** Mute toggle (volume is preserved while muted). */
  enabled: boolean;
}

export interface MixerState {
  master: BusState;
  music: BusState;
  sfx: BusState;
  voice: BusState;
}

/** Clamp any number into the 0–1 volume range (NaN/Infinity → 0). */
export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Build the mixer state purely from persisted settings. */
export function mixerFromSettings(s: GameSettings): MixerState {
  return {
    master: { volume: clampVolume(s.masterVolume), enabled: true },
    music: { volume: clampVolume(s.musicVolume), enabled: s.musicEnabled },
    sfx: { volume: clampVolume(s.sfxVolume), enabled: s.sfxEnabled },
    voice: { volume: clampVolume(s.npcVoiceVolume), enabled: s.ttsEnabled },
  };
}

/**
 * Effective playback gain for a bus: `master.volume * bus.volume`, zeroed when
 * either the master or the bus is muted. The `master` bus is its own volume.
 */
export function effectiveVolume(state: MixerState, bus: AudioBus): number {
  if (bus === 'master') return state.master.enabled ? state.master.volume : 0;
  const b = state[bus];
  if (!state.master.enabled || !b.enabled) return 0;
  return clampVolume(state.master.volume * b.volume);
}

/** Whether another instance of a cue may start, given a per-cue ceiling (cap ≤ 0 = unlimited). */
export function canPlayMore(active: number, cap: number): boolean {
  return cap <= 0 ? true : active < cap;
}

/** Default ceiling of simultaneous instances per SFX cue (prevents audio pile-ups). */
export const DEFAULT_SFX_INSTANCE_CAP = 4;

/** Procedural nave engine tone (sine): idle pitch, moving pitch, and base gain. */
export const ENGINE_IDLE_HZ = 180;
export const ENGINE_MOVE_HZ = 220;
export const ENGINE_TONE_GAIN = 0.12; // keep the drone subtle relative to other SFX
/** Glide time-constant (s) for the pitch ramp between idle and moving. */
export const ENGINE_GLIDE_TAU = 0.18;

/** Target engine pitch (Hz) for the current throttle state. Pure. */
export function engineTargetHz(moving: boolean): number {
  return moving ? ENGINE_MOVE_HZ : ENGINE_IDLE_HZ;
}

/**
 * Owns the audio mixer state and (in the browser) the live Babylon sounds.
 * The mixer math is pure + fully tested; the playback layer is browser-only
 * and `istanbul ignore`d. Registered in the ServiceLocator under `'audio'`.
 */
export class AudioManager {
  private mixer: MixerState;
  /** Active SFX instance count per cue id (for the instance cap). */
  private active = new Map<string, number>();
  /** Currently-playing looping audio elements, keyed by cue id. */
  private loops = new Map<string, HTMLAudioElement>();
  private unsubscribes: Array<() => void> = [];
  /** Procedural nave-engine tone nodes (Web Audio), live only while piloting. */
  private engineCtx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  /** Looping background-music element + the track id it's playing (music bus). */
  private musicEl: HTMLAudioElement | null = null;
  private musicTrack: string | null = null;
  /** Every displaced track still fading out — ALL get paused when silent (or on
   * stop). Tracking the full set (not just one) is what stops a rapid sequence of
   * track changes from orphaning an element that loops forever. */
  private fadingOut: HTMLAudioElement[] = [];
  private musicFadeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(eventBus?: EventBus) {
    this.mixer = mixerFromSettings(SettingsService.load());
    if (eventBus) {
      this.unsubscribes.push(eventBus.on('settings:changed', () => this.refreshFromSettings()));
      this.unsubscribes.push(eventBus.on('audio:sfx', ({ cue }) => this.playCue(cue)));
      // Swap the background music to match each loaded scene (null = stop).
      this.unsubscribes.push(eventBus.on('scene:loaded', ({ sceneName }) => {
        const track = musicForScene(sceneName);
        if (track) this.playMusic(track);
        else this.stopMusic();
      }));
    }
  }

  /** Current mixer snapshot (read-only use). */
  getMixer(): MixerState {
    return this.mixer;
  }

  /** Effective gain for a bus under the current mixer. */
  effective(bus: AudioBus): number {
    return effectiveVolume(this.mixer, bus);
  }

  /** Re-read settings into the mixer and re-apply to any live sounds. */
  refreshFromSettings(): void {
    this.mixer = mixerFromSettings(SettingsService.load());
    /* istanbul ignore next — browser-only re-apply */
    this.applyToLiveSounds();
  }

  /** Kept for future spatial audio; the HTMLAudio playback layer doesn't need it. */
  /* istanbul ignore next — no-op setter */
  setScene(_scene: Scene): void {
    /* reserved */
  }

  /* istanbul ignore next — browser-only: re-apply bus volume to live loops + engine + music */
  private applyToLiveSounds(): void {
    this.loops.forEach((el, cueId) => {
      const spec = sfxSpec(cueId);
      el.volume = clampVolume(this.effective(spec?.bus ?? 'sfx'));
    });
    if (this.engineGain) this.engineGain.gain.value = this.engineGainValue();
    if (this.musicEl) this.musicEl.volume = clampVolume(this.effective('music'));
  }

  /**
   * Play a looping background track on the music bus, crossfading from any
   * current track. No-op if the track is already playing or unregistered.
   * Browser-only; safe no-op outside the DOM.
   */
  /* istanbul ignore next — browser-only music playback */
  playMusic(trackId: string): void {
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
    if (this.musicTrack === trackId && this.musicEl) return;
    const spec = musicSpec(trackId);
    if (!spec) return;
    // Retire the current bed into the fade-out set BEFORE swapping, so an interrupted
    // fade can never orphan it (the bug: combat→gameover→menu in quick succession left
    // the combat bed looping forever, surviving into the main menu).
    if (this.musicEl) this.fadingOut.push(this.musicEl);
    const next = new Audio(spec.path);
    next.loop = true;
    next.volume = 0;
    this.musicEl = next;
    this.musicTrack = trackId;
    void next.play().catch(() => {});
    this.runMusicFade();
  }

  /** Crossfade: ramp the target bed up to the music-bus volume; fade EVERY retired
   * bed to 0, pausing + dropping each as it reaches silence. One timer for all. */
  /* istanbul ignore next — browser-only fade loop */
  private runMusicFade(): void {
    if (this.musicFadeTimer) clearInterval(this.musicFadeTimer);
    const stepMs = 50;
    this.musicFadeTimer = setInterval(() => {
      const target = clampVolume(this.effective('music'));
      const newEl = this.musicEl;
      if (newEl) newEl.volume = fadeStep(newEl.volume, target, stepMs, MUSIC_FADE_MS);
      this.fadingOut = this.fadingOut.filter((el) => {
        el.volume = fadeStep(el.volume, 0, stepMs, MUSIC_FADE_MS);
        if (el.volume <= 1e-3) { el.pause(); return false; }
        return true;
      });
      const fadedIn = !newEl || Math.abs(newEl.volume - clampVolume(this.effective('music'))) < 1e-3;
      if (fadedIn && this.fadingOut.length === 0) {
        if (this.musicFadeTimer) { clearInterval(this.musicFadeTimer); this.musicFadeTimer = null; }
      }
    }, stepMs);
  }

  /** Stop ALL background music immediately (current + everything fading out). */
  /* istanbul ignore next — browser-only */
  stopMusic(): void {
    if (this.musicFadeTimer) { clearInterval(this.musicFadeTimer); this.musicFadeTimer = null; }
    if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
    this.fadingOut.forEach((el) => el.pause());
    this.fadingOut = [];
    this.musicTrack = null;
  }

  /** Base gain of the engine drone, scaled by the (master×sfx) bus. */
  /* istanbul ignore next — browser-only (reached only from Web Audio paths) */
  private engineGainValue(): number {
    return clampVolume(this.effective('sfx')) * ENGINE_TONE_GAIN;
  }

  /**
   * Start the procedural nave engine: a sine oscillator droning at the idle pitch.
   * Idempotent. Browser-only (Web Audio); safe no-op outside the DOM.
   */
  /* istanbul ignore next — browser-only Web Audio synthesis */
  startEngineTone(): void {
    if (typeof window === 'undefined' || this.engineOsc) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = this.engineCtx ?? new Ctor();
    this.engineCtx = ctx;
    void ctx.resume?.();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(ENGINE_IDLE_HZ, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.value = this.engineGainValue();
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  /** Glide the engine pitch toward the idle/moving target (180 ↔ 220 Hz). Browser-only. */
  /* istanbul ignore next — browser-only Web Audio */
  setEngineThrottle(moving: boolean): void {
    if (!this.engineOsc || !this.engineCtx) return;
    this.engineOsc.frequency.setTargetAtTime(engineTargetHz(moving), this.engineCtx.currentTime, ENGINE_GLIDE_TAU);
  }

  /** Stop the engine drone (keeps the AudioContext for reuse). Browser-only. */
  /* istanbul ignore next — browser-only Web Audio */
  stopEngineTone(): void {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc.disconnect();
      this.engineOsc = null;
    }
    if (this.engineGain) {
      this.engineGain.disconnect();
      this.engineGain = null;
    }
  }

  /**
   * Play a registered cue by id (looks up SfxCatalog). One-shots go through the
   * instance cap; looping cues start a persistent loop. Unknown cues are a no-op.
   * Browser-only; safe no-op outside the DOM.
   */
  /* istanbul ignore next — browser-only playback */
  playCue(cueId: string): void {
    const spec = sfxSpec(cueId);
    if (!spec) return;
    if (spec.loop) this.playLoop(cueId);
    else this.playSfx(cueId, spec.path, { cap: spec.cap, bus: spec.bus });
  }

  /**
   * Play a one-shot SFX from a URL via an HTMLAudioElement, respecting the
   * per-cue instance cap. Browser-only; safe no-op outside the DOM.
   */
  /* istanbul ignore next — browser-only playback */
  playSfx(cueId: string, url: string, opts?: { baseVolume?: number; cap?: number; bus?: AudioBus }): void {
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
    const cap = opts?.cap ?? DEFAULT_SFX_INSTANCE_CAP;
    const current = this.active.get(cueId) ?? 0;
    if (!canPlayMore(current, cap)) return;
    const base = opts?.baseVolume ?? 1;
    const el = new Audio(url);
    el.volume = clampVolume(base * this.effective(opts?.bus ?? 'sfx'));
    this.active.set(cueId, current + 1);
    const done = (): void => {
      this.active.set(cueId, Math.max(0, (this.active.get(cueId) ?? 1) - 1));
    };
    el.addEventListener('ended', done, { once: true });
    el.addEventListener('error', done, { once: true });
    void el.play().catch(() => done());
  }

  /** Start a looping cue (e.g. the nave engine) if not already playing. Browser-only. */
  /* istanbul ignore next — browser-only playback */
  playLoop(cueId: string): void {
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
    const spec = sfxSpec(cueId);
    if (!spec || this.loops.has(cueId)) return;
    const el = new Audio(spec.path);
    el.loop = true;
    el.volume = clampVolume(this.effective(spec.bus));
    this.loops.set(cueId, el);
    void el.play().catch(() => {});
  }

  /** Stop a looping cue. Browser-only. */
  /* istanbul ignore next — browser-only playback */
  stopLoop(cueId: string): void {
    const el = this.loops.get(cueId);
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    this.loops.delete(cueId);
  }

  dispose(): void {
    this.unsubscribes.forEach((u) => u());
    this.unsubscribes = [];
    /* istanbul ignore next — browser-only teardown */
    this.loops.forEach((el) => el.pause());
    this.loops.clear();
    this.active.clear();
    /* istanbul ignore next — browser-only Web Audio teardown */
    this.stopEngineTone();
    /* istanbul ignore next — browser-only music teardown */
    this.stopMusic();
  }
}
