/**
 * Avatar catalog — Quaternius "Ultimate Modular" characters (CC0). See ADR-0014
 * Addendum 4.
 *
 * Model: each outfit is a complete, rigged, *self-animated* character GLB
 * (Body/Legs/Feet/Head parts + 24 embedded clips incl. Idle/Walk/Run/Interact).
 * Picking an outfit = loading that GLB; no separate animation library or hair —
 * the look is cohesive by design. Materials are semantic & shared (`Skin`, `Eye`,
 * `Eyebrows` + per-outfit clothing colours), so skin/eye/hair tint cleanly.
 *
 * Everything here is pure data + pure helpers (no scene), fully unit-testable.
 */

export type Gender = 'male' | 'female';

export interface Outfit {
  key: string;
  gender: Gender;
  label: string;
  /** GLB path relative to /assets/. */
  path: string;
}

const men = (key: string, label: string): Outfit =>
  ({ key, gender: 'male', label, path: `characters/quaternius/men/${key}.glb` });
const women = (key: string, label: string): Outfit =>
  ({ key: `w_${key}`, gender: 'female', label, path: `characters/quaternius/women/${key}.glb` });

/**
 * Available outfits. Cyberpunk-leaning ones first per gender. Women are added as
 * their pack lands (same structure). Keys match the converted GLB filenames.
 */
export const OUTFITS: readonly Outfit[] = [
  men('casual_hoodie', 'Hoodie'),
  men('punk', 'Punk'),
  men('swat', 'SWAT'),
  men('suit', 'Suit'),
  men('spacesuit', 'Spacesuit'),
  men('worker', 'Worker'),
  men('casual_2', 'Casual'),
  men('adventurer', 'Adventurer'),
  men('beach', 'Beach'),
  men('farmer', 'Farmer'),
  men('king', 'King'),
  // Women (cyberpunk-leaning first).
  women('scifi', 'Sci-Fi'),
  women('soldier', 'Soldier'),
  women('punk', 'Punk'),
  women('suit', 'Suit'),
  women('casual', 'Casual'),
  women('formal', 'Formal'),
  women('worker', 'Worker'),
  women('adventurer', 'Adventurer'),
  women('medieval', 'Medieval'),
  women('witch', 'Witch'),
];

/** Default outfit (a neutral, cyberpunk-friendly look). */
export const DEFAULT_OUTFIT = 'casual_hoodie';

/** Locomotion state → exact embedded clip name (Quaternius Ultimate Modular). */
export const LOCO_CLIPS: Record<'idle' | 'walk' | 'run' | 'interact', string> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  interact: 'Interact',
};

export function outfitsForGender(gender: Gender): Outfit[] {
  return OUTFITS.filter((o) => o.gender === gender);
}

export function outfitByKey(key: string): Outfit | undefined {
  return OUTFITS.find((o) => o.key === key);
}

/** Gender of an outfit key (defaults to male if unknown). */
export function genderOfOutfit(key: string): Gender {
  return outfitByKey(key)?.gender ?? 'male';
}

/**
 * Which `colors` key tints a material, by its semantic name. Clothing materials
 * (White/Black/Red/…) keep their authored per-outfit colour (returns null).
 */
export function tintRoleForMaterial(materialName: string): 'skin' | 'eye' | 'hair' | null {
  if (materialName === 'Skin') return 'skin';
  if (materialName === 'Eye') return 'eye';
  // Men use 'Eyebrows'; women use 'Hair_Black' etc. for the hair material.
  if (/^eyebrow/i.test(materialName) || /^hair/i.test(materialName)) return 'hair';
  return null;
}
