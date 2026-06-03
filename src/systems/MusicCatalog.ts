/** Background-music tracks, one looping bed per context. */
export type MusicTrack = 'theme' | 'world' | 'combat';

export interface MusicSpec {
  /** Public URL (served from /assets/audio/music). */
  path: string;
}

const BASE = '/assets/audio/music';

/** Registered looping music beds. All on the `music` bus. */
export const MUSIC_TRACKS: Record<MusicTrack, MusicSpec> = {
  theme: { path: `${BASE}/theme.ogg` }, // opening branding sequence
  world: { path: `${BASE}/world.ogg` }, // street ambience bed
  combat: { path: `${BASE}/combat.ogg` },
};

/** Resolve a track id to its spec (or null if not registered). */
export function musicSpec(id: string): MusicSpec | null {
  return (MUSIC_TRACKS as Record<string, MusicSpec>)[id] ?? null;
}

/**
 * Background track for a scene (null = stop music). The hero's theme plays over
 * the opening branding sequence; the street ambience bed plays in the world.
 * Menu / load / options / creator are intentionally silent (owner's call).
 * Combat is driven explicitly by the scene, not here. Pure.
 */
export function musicForScene(scene: string): MusicTrack | null {
  switch (scene) {
    case 'splash':
    case 'studio':
    case 'publisher':
      return 'theme';
    case 'game-world':
      return 'world';
    default:
      return null; // main-menu / load / options / character-creator → silent
  }
}

/** Crossfade duration (ms) between music beds. */
export const MUSIC_FADE_MS = 1200;

/**
 * One linear fade step toward `target` over `durationMs`, advancing by `dtMs`.
 * Clamps so it never overshoots. Pure (drives both the fade-in and fade-out).
 */
export function fadeStep(current: number, target: number, dtMs: number, durationMs: number): number {
  if (durationMs <= 0) return target;
  const delta = dtMs / durationMs; // fraction of the full 0..1 range per step
  if (target > current) return Math.min(target, current + delta);
  return Math.max(target, current - delta);
}
