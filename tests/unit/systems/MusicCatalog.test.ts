import {
  MUSIC_TRACKS,
  musicSpec,
  musicForScene,
  fadeStep,
  MUSIC_FADE_MS,
  type MusicTrack,
} from '../../../src/systems/MusicCatalog';

describe('MusicCatalog', () => {
  it('every track has a path under /assets/audio/music', () => {
    const ids: MusicTrack[] = ['theme', 'world', 'combat'];
    for (const id of ids) {
      expect(MUSIC_TRACKS[id].path).toMatch(/^\/assets\/audio\/music\/.+\.ogg$/);
    }
  });

  it('musicSpec resolves known tracks and rejects unknown', () => {
    expect(musicSpec('combat')?.path).toContain('combat.ogg');
    expect(musicSpec('theme')?.path).toContain('theme.ogg');
    expect(musicSpec('nope')).toBeNull();
  });

  describe('musicForScene', () => {
    it('plays the theme over the opening branding sequence', () => {
      expect(musicForScene('splash')).toBe('theme');
      expect(musicForScene('studio')).toBe('theme');
      expect(musicForScene('publisher')).toBe('theme');
    });
    it('plays the street ambience bed in the world', () => {
      expect(musicForScene('game-world')).toBe('world');
    });
    it('is silent on menu / load / options / creator / unknown', () => {
      expect(musicForScene('main-menu')).toBeNull();
      expect(musicForScene('load-game')).toBeNull();
      expect(musicForScene('options')).toBeNull();
      expect(musicForScene('character-creator')).toBeNull();
      expect(musicForScene('whatever')).toBeNull();
    });
  });

  describe('fadeStep', () => {
    it('advances toward the target without overshooting', () => {
      // 50ms of a 1000ms fade = +0.05 toward target
      expect(fadeStep(0, 1, 50, 1000)).toBeCloseTo(0.05, 6);
      expect(fadeStep(0.98, 1, 50, 1000)).toBe(1); // clamp up
      expect(fadeStep(0.02, 0, 50, 1000)).toBe(0); // clamp down
    });
    it('fades downward toward 0', () => {
      expect(fadeStep(1, 0, 100, 1000)).toBeCloseTo(0.9, 6);
    });
    it('zero/negative duration snaps to the target', () => {
      expect(fadeStep(0.3, 1, 50, 0)).toBe(1);
    });
    it('MUSIC_FADE_MS is a positive crossfade duration', () => {
      expect(MUSIC_FADE_MS).toBeGreaterThan(0);
    });
  });
});
