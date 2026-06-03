import type { Scene } from '@babylonjs/core';
import type { EventBus } from '@core/EventBus';
import { SettingsService, type GameSettings } from './SettingsService';
import { sfxSpec } from './SfxCatalog';

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

  constructor(eventBus?: EventBus) {
    this.mixer = mixerFromSettings(SettingsService.load());
    if (eventBus) {
      this.unsubscribes.push(eventBus.on('settings:changed', () => this.refreshFromSettings()));
      this.unsubscribes.push(eventBus.on('audio:sfx', ({ cue }) => this.playCue(cue)));
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

  /* istanbul ignore next — browser-only: re-apply bus volume to live loops */
  private applyToLiveSounds(): void {
    this.loops.forEach((el, cueId) => {
      const spec = sfxSpec(cueId);
      el.volume = clampVolume(this.effective(spec?.bus ?? 'sfx'));
    });
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
    /* istanbul ignore next — browser-only loop teardown */
    this.loops.forEach((el) => el.pause());
    this.loops.clear();
    this.active.clear();
  }
}
