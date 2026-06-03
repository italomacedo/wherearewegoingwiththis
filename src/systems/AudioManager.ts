import { Sound } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { EventBus } from '@core/EventBus';
import { SettingsService, type GameSettings } from './SettingsService';

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
  private scene: Scene | null = null;
  /** Active SFX instance count per cue id (for the instance cap). */
  private active = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;

  constructor(eventBus?: EventBus) {
    this.mixer = mixerFromSettings(SettingsService.load());
    if (eventBus) {
      this.unsubscribe = eventBus.on('settings:changed', () => this.refreshFromSettings());
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

  /* istanbul ignore next — requires a Babylon audio engine / DOM */
  setScene(scene: Scene): void {
    this.scene = scene;
  }

  /* istanbul ignore next — browser-only */
  private applyToLiveSounds(): void {
    if (typeof document === 'undefined' || !this.scene) return;
    for (const snd of this.scene.mainSoundTrack?.soundCollection ?? []) {
      const bus = (snd.metadata?.bus as AudioBus) ?? 'sfx';
      const base = (snd.metadata?.baseVolume as number) ?? 1;
      snd.setVolume(base * this.effective(bus));
    }
  }

  /**
   * Play a one-shot SFX cue from a URL on the sfx bus, respecting the per-cue
   * instance cap. Browser-only; safe no-op without a scene/DOM.
   */
  /* istanbul ignore next — browser-only playback */
  playSfx(cueId: string, url: string, opts?: { baseVolume?: number; cap?: number }): void {
    if (typeof document === 'undefined' || !this.scene) return;
    const cap = opts?.cap ?? DEFAULT_SFX_INSTANCE_CAP;
    const current = this.active.get(cueId) ?? 0;
    if (!canPlayMore(current, cap)) return;
    const base = opts?.baseVolume ?? 1;
    const snd = new Sound(`sfx:${cueId}`, url, this.scene, null, {
      autoplay: true,
      volume: base * this.effective('sfx'),
    });
    snd.metadata = { bus: 'sfx', baseVolume: base };
    this.active.set(cueId, current + 1);
    snd.onEndedObservable.addOnce(() => {
      this.active.set(cueId, Math.max(0, (this.active.get(cueId) ?? 1) - 1));
      snd.dispose();
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.active.clear();
    this.scene = null;
  }
}
