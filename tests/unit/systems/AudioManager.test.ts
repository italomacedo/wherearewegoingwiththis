import {
  AudioManager,
  clampVolume,
  mixerFromSettings,
  effectiveVolume,
  canPlayMore,
  DEFAULT_SFX_INSTANCE_CAP,
  engineTargetHz,
  ENGINE_IDLE_HZ,
  ENGINE_MOVE_HZ,
  type MixerState,
} from '../../../src/systems/AudioManager';
import { EventBus } from '../../../src/core/EventBus';
import { SettingsService, DEFAULT_SETTINGS } from '../../../src/systems/SettingsService';

describe('AudioManager — pure mixer math', () => {
  afterEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  it('clampVolume clamps to 0–1 and rejects NaN/Infinity', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(NaN)).toBe(0);
    expect(clampVolume(Infinity)).toBe(0);
  });

  it('mixerFromSettings maps settings to buses (master always enabled)', () => {
    const m = mixerFromSettings(DEFAULT_SETTINGS);
    expect(m.master).toEqual({ volume: 1, enabled: true });
    expect(m.music).toEqual({ volume: 0.6, enabled: true });
    expect(m.sfx).toEqual({ volume: 0.8, enabled: true });
    expect(m.voice).toEqual({ volume: 1, enabled: true });
  });

  it('voice/music/sfx enabled track their toggle settings', () => {
    const m = mixerFromSettings({
      ...DEFAULT_SETTINGS,
      musicEnabled: false,
      sfxEnabled: false,
      ttsEnabled: false,
    });
    expect(m.music.enabled).toBe(false);
    expect(m.sfx.enabled).toBe(false);
    expect(m.voice.enabled).toBe(false);
    // volumes are preserved even while muted
    expect(m.music.volume).toBe(0.6);
  });

  it('effectiveVolume multiplies master × bus, zeroing on mute', () => {
    const m: MixerState = {
      master: { volume: 0.5, enabled: true },
      music: { volume: 0.8, enabled: true },
      sfx: { volume: 1, enabled: false },
      voice: { volume: 0.5, enabled: true },
    };
    expect(effectiveVolume(m, 'master')).toBe(0.5);
    expect(effectiveVolume(m, 'music')).toBeCloseTo(0.4, 6);
    expect(effectiveVolume(m, 'sfx')).toBe(0); // bus muted
    expect(effectiveVolume(m, 'voice')).toBe(0.25);
  });

  it('effectiveVolume is zero for every bus when master is muted', () => {
    const m: MixerState = {
      master: { volume: 1, enabled: false },
      music: { volume: 1, enabled: true },
      sfx: { volume: 1, enabled: true },
      voice: { volume: 1, enabled: true },
    };
    expect(effectiveVolume(m, 'master')).toBe(0);
    expect(effectiveVolume(m, 'music')).toBe(0);
    expect(effectiveVolume(m, 'voice')).toBe(0);
  });

  it('canPlayMore respects the cap (≤0 = unlimited)', () => {
    expect(canPlayMore(0, 4)).toBe(true);
    expect(canPlayMore(3, 4)).toBe(true);
    expect(canPlayMore(4, 4)).toBe(false);
    expect(canPlayMore(99, 0)).toBe(true); // unlimited
    expect(DEFAULT_SFX_INSTANCE_CAP).toBeGreaterThan(0);
  });

  it('engineTargetHz: 180 Hz idle, 220 Hz moving', () => {
    expect(ENGINE_IDLE_HZ).toBe(180);
    expect(ENGINE_MOVE_HZ).toBe(220);
    expect(engineTargetHz(false)).toBe(180);
    expect(engineTargetHz(true)).toBe(220);
  });
});

describe('AudioManager — instance + settings wiring', () => {
  afterEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  it('builds the mixer from current settings at construction', () => {
    SettingsService.set('masterVolume', 0.4);
    const am = new AudioManager();
    expect(am.getMixer().master.volume).toBe(0.4);
    expect(am.effective('master')).toBe(0.4);
  });

  it('refreshFromSettings re-reads the mixer', () => {
    const am = new AudioManager();
    expect(am.effective('master')).toBe(1);
    SettingsService.set('masterVolume', 0);
    am.refreshFromSettings();
    expect(am.effective('master')).toBe(0);
  });

  it('subscribes to settings:changed and refreshes; dispose unsubscribes', () => {
    const bus = new EventBus();
    const am = new AudioManager(bus);
    SettingsService.set('sfxVolume', 0);
    bus.emit('settings:changed', { key: 'sfxVolume', value: 0 });
    expect(am.effective('sfx')).toBe(0);

    am.dispose();
    SettingsService.set('sfxVolume', 1);
    bus.emit('settings:changed', { key: 'sfxVolume', value: 1 });
    // after dispose the handler is gone — mixer stays at the disposed snapshot
    expect(am.effective('sfx')).toBe(0);
    expect(bus.listenerCount('settings:changed')).toBe(0);
  });

  it('subscribes to audio:sfx; emitting a cue is safe without a scene; dispose clears it', () => {
    const bus = new EventBus();
    const am = new AudioManager(bus);
    expect(bus.listenerCount('audio:sfx')).toBe(1);
    // No scene set → playCue is a safe no-op (must not throw).
    expect(() => bus.emit('audio:sfx', { cue: 'gunshot' })).not.toThrow();
    expect(() => bus.emit('audio:sfx', { cue: 'unknown_cue' })).not.toThrow();
    am.dispose();
    expect(bus.listenerCount('audio:sfx')).toBe(0);
  });

  it('subscribes to scene:loaded; emitting a scene swaps/stops music safely; dispose clears it', () => {
    const bus = new EventBus();
    const am = new AudioManager(bus);
    expect(bus.listenerCount('scene:loaded')).toBe(1);
    // No DOM → playMusic/stopMusic are safe no-ops (must not throw).
    expect(() => bus.emit('scene:loaded', { sceneName: 'main-menu' })).not.toThrow(); // → music track
    expect(() => bus.emit('scene:loaded', { sceneName: 'splash' })).not.toThrow();    // → stop
    am.dispose();
    expect(bus.listenerCount('scene:loaded')).toBe(0);
  });
});

// ─── Music lifecycle: no orphaned beds across rapid track changes (browser path) ──
describe('AudioManager — music lifecycle', () => {
  class FakeAudio {
    static created: FakeAudio[] = [];
    src: string; loop = false; volume = 1; paused = true;
    constructor(src: string) { this.src = src; FakeAudio.created.push(this); }
    play(): Promise<void> { this.paused = false; return Promise.resolve(); }
    pause(): void { this.paused = true; }
  }
  const g = globalThis as unknown as { document?: unknown; Audio?: unknown };

  beforeEach(() => {
    FakeAudio.created = [];
    g.document = {};            // make `typeof document !== 'undefined'`
    g.Audio = FakeAudio;        // make `typeof Audio !== 'undefined'`
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    delete g.document; delete g.Audio;
    SettingsService.reset(); SettingsService.clearMemoryStore();
  });

  const playing = () => FakeAudio.created.filter((a) => !a.paused);

  it('interrupted fades never orphan a bed (combat→gameover→menu leaves ONLY menu playing)', () => {
    const am = new AudioManager();
    am.playMusic('combat');
    am.playMusic('gameover'); // interrupts the combat fade-in
    am.playMusic('menu');     // interrupts the gameover fade-in
    jest.advanceTimersByTime(1500); // > MUSIC_FADE_MS — let all fades finish
    expect(playing()).toHaveLength(1);
    expect(playing()[0].src).toContain('menu');
  });

  it('stopMusic pauses the current bed AND everything still fading out', () => {
    const am = new AudioManager();
    am.playMusic('world');
    am.playMusic('combat'); // world now in the fade-out set
    am.stopMusic();
    expect(FakeAudio.created.every((a) => a.paused)).toBe(true);
  });

  it('replaying the same track is a no-op (no duplicate element)', () => {
    const am = new AudioManager();
    am.playMusic('world');
    am.playMusic('world');
    expect(FakeAudio.created).toHaveLength(1);
  });
});
