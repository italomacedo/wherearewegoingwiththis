import type { AudioBus } from './AudioManager';

/** Identifiers for every registered sound-effect cue. */
export type SfxCue =
  | 'footstep'
  | 'punch'
  | 'stab'
  | 'swing'
  | 'whiff'
  | 'gunshot'
  | 'explosion'
  | 'bodyfall'
  | 'ui_click'
  | 'ui_open'
  | 'ui_error'
  | 'eat'
  | 'growl';

export interface SfxSpec {
  /** Public URL (served from /assets/audio/sfx). */
  path: string;
  /** Mixing bus the cue plays on. */
  bus: AudioBus;
  /** Looping cue (e.g. the nave engine); played via playLoop/stopLoop. */
  loop?: boolean;
  /** Per-cue ceiling of simultaneous instances (one-shots only). */
  cap?: number;
}

const BASE = '/assets/audio/sfx';

/** The registered SFX cues → asset + bus. All CC0 except footstep/punch/stab (CC-BY). */
export const SFX_CUES: Record<SfxCue, SfxSpec> = {
  footstep: { path: `${BASE}/footstep.ogg`, bus: 'sfx', cap: 2 },
  punch: { path: `${BASE}/punch.ogg`, bus: 'sfx' },
  stab: { path: `${BASE}/stab.ogg`, bus: 'sfx' },
  swing: { path: `${BASE}/swing.ogg`, bus: 'sfx' },
  whiff: { path: `${BASE}/whiff.ogg`, bus: 'sfx' },
  gunshot: { path: `${BASE}/gunshot.ogg`, bus: 'sfx' },
  explosion: { path: `${BASE}/explosion.ogg`, bus: 'sfx' },
  bodyfall: { path: `${BASE}/bodyfall.ogg`, bus: 'sfx' },
  ui_click: { path: `${BASE}/ui_click.ogg`, bus: 'sfx', cap: 3 },
  ui_open: { path: `${BASE}/ui_open.ogg`, bus: 'sfx', cap: 3 },
  ui_error: { path: `${BASE}/ui_error.ogg`, bus: 'sfx', cap: 3 },
  eat: { path: `${BASE}/eat.ogg`, bus: 'sfx' },
  growl: { path: `${BASE}/growl.ogg`, bus: 'sfx' },
};

/** Resolve a cue id to its spec (or null if it isn't registered yet). */
export function sfxSpec(cue: string): SfxSpec | null {
  return (SFX_CUES as Record<string, SfxSpec>)[cue] ?? null;
}

/** Minimal shape of a combat beat needed to pick sounds (decoupled from CombatController). */
export interface CombatBeatLike {
  kind: string;
  attackKind?: 'melee' | 'ranged';
  attackOutcome?: 'hit' | 'miss' | 'death';
  weaponName?: string;
}

/** A weapon label that denotes bare fists (EN/pt-BR), so unarmed hits use the punch cue. */
function isFists(weaponName: string | undefined): boolean {
  return !weaponName || /fist|punho/i.test(weaponName);
}

/**
 * Map a combat beat to the SFX cues it should fire, in order:
 * - ranged: gunshot;
 * - melee MISS (fists or armed): the `whiff` swing-through-air whoosh;
 * - melee landed: armed → `swing` (blade whoosh) + `stab`; bare fists → `punch`;
 * - any kill also adds `bodyfall`.
 * Pure.
 */
export function sfxForBeat(entry: CombatBeatLike): SfxCue[] {
  const cues: SfxCue[] = [];
  const isAttack = entry.kind === 'hit' || entry.kind === 'miss' || entry.kind === 'death';
  if (!isAttack || !entry.attackKind) return cues;

  if (entry.attackKind === 'ranged') {
    cues.push('gunshot');
  } else if (entry.kind === 'miss') {
    cues.push('whiff'); // melee whiffed through the air
  } else if (isFists(entry.weaponName)) {
    cues.push('punch'); // bare fists landed: punch impact
  } else {
    cues.push('swing', 'stab'); // armed melee landed: blade whoosh + impact
  }
  if (entry.kind === 'death') cues.push('bodyfall');
  return cues;
}

/** Locomotion states that produce footstep sounds. */
export type LocoStateLike = 'idle' | 'walk' | 'run' | 'interact';

/** Seconds between footstep cues for a loco state (0 = silent). Pure. */
export function footstepInterval(state: LocoStateLike): number {
  if (state === 'walk') return 0.45;
  if (state === 'run') return 0.3;
  return 0;
}
