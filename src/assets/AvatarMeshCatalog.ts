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

export type LocoClipState = keyof typeof LOCO_CLIPS;

/**
 * Combat state → exact embedded clip name (same Quaternius rig as the loco clips,
 * so zero retargeting). These are kept (renamed to the lowercase key) by
 * `assembleGltf` alongside the loco clips and played one-shot during combat.
 */
export const COMBAT_CLIPS: Record<'punch' | 'kick' | 'shoot' | 'aim' | 'hit' | 'death' | 'slash', string> = {
  punch: 'Punch_Right',
  kick: 'Kick_Right',
  shoot: 'Gun_Shoot',
  aim: 'Idle_Gun_Pointing',
  hit: 'HitRecieve',
  death: 'Death',
  slash: 'Sword_Slash', // armed melee swing (Phase 10) — verified in men/ + women/ GLBs
};

export type CombatClipState = keyof typeof COMBAT_CLIPS;

/**
 * Embedded clips kept on the rig PURELY as static-pose sources (frozen at a frame
 * via `PlayerController.playPose(clip, frame)`), not played as motion. Without an
 * entry here the assembler discards the clip (only LOCO/COMBAT are kept). Value =
 * exact embedded clip name; key = the renamed in-game name. Frames are catalogued
 * in `tools/README.md` (e.g. `roll`@65 = sit-on-ground, `roll`@70 = passenger).
 */
export const POSE_CLIPS = {
  roll: 'Roll',
} as const;

export type PoseClipState = keyof typeof POSE_CLIPS;

/** The clip an attacker plays for a given attack kind (melee → punch, ranged → shoot). */
export function combatClipFor(attackKind: 'melee' | 'ranged'): CombatClipState {
  return attackKind === 'melee' ? 'punch' : 'shoot';
}

/**
 * The attack clip for a strike, accounting for whether the fighter is armed:
 *  - ranged → shoot
 *  - armed melee (a real weapon in hand) → its `override` clip, else a sword slash
 *  - bare-fisted melee → punch
 * Pure; the caller supplies `armedMelee` (item-layer knowledge) and any per-weapon
 * clip override, keeping this catalog free of an ItemCatalog dependency.
 */
export function attackClipFor(
  attackKind: 'melee' | 'ranged',
  armedMelee = false,
  override?: CombatClipState,
): CombatClipState {
  if (attackKind === 'ranged') return 'shoot';
  if (armedMelee) return override ?? 'slash';
  return 'punch';
}

/**
 * Approximate ground speed (units/sec) each Quaternius Walk/Run clip was authored
 * to — i.e. how fast the feet cycle in the clip. The hero translates at
 * walkSpeed=4 / runSpeed=8, so when those don't match the clip's authored cadence
 * the feet slide. We scale `AnimationGroup.speedRatio` by `actualSpeed/clipGroundSpeed`
 * to keep the feet planted. CALIBRATE in Electron (Lesson: measure, don't eyeball).
 */
export const LOCO_CLIP_GROUND_SPEED: Record<'walk' | 'run', number> = {
  walk: 1.4,
  run: 4.2,
};

/** Clamp bounds for the locomotion speed ratio (avoid a frozen/blurred clip). */
export const LOCO_SPEED_RATIO_MIN = 0.25;
export const LOCO_SPEED_RATIO_MAX = 4;

/**
 * Pure: the `AnimationGroup.speedRatio` that matches a locomotion clip's cadence to
 * the hero's actual ground speed (units/sec). idle/interact always play at their
 * authored rate (1). Clamped so a degenerate speed can't freeze or over-spin the clip.
 */
export function computeLocoSpeedRatio(state: LocoClipState, groundSpeed: number): number {
  if (state !== 'walk' && state !== 'run') return 1;
  const ref = LOCO_CLIP_GROUND_SPEED[state];
  if (!(ref > 0) || !(groundSpeed > 0)) return 1;
  const ratio = groundSpeed / ref;
  return Math.min(LOCO_SPEED_RATIO_MAX, Math.max(LOCO_SPEED_RATIO_MIN, ratio));
}

export function outfitsForGender(gender: Gender): Outfit[] {
  return OUTFITS.filter((o) => o.gender === gender);
}

/**
 * Modular regions an outfit GLB does NOT provide (verified from the GLB node list).
 * `farmer` ships no `Farmer_Legs` mesh (only `_Feet`), so as a bottom donor its legs
 * render invisible — exclude it from the bottom picker. Keyed by outfit key.
 */
export const OUTFIT_MISSING_PARTS: Readonly<Record<string, ReadonlyArray<'head' | 'top' | 'bottom'>>> = Object.freeze({
  farmer: ['bottom'],
});

/** Whether an outfit provides a given modular region (head/top/bottom). */
export function outfitProvidesPart(key: string, region: 'head' | 'top' | 'bottom'): boolean {
  return !(OUTFIT_MISSING_PARTS[key] ?? []).includes(region);
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

// ─── Modular composition (Fase 12) ──────────────────────────────────────────────

/**
 * Region of a Quaternius character mesh, by its node name. Every outfit GLB ships
 * 4 region meshes `{Name}_Head/_Body/_Legs/_Feet` (+ optional weapon/accessory),
 * all skinned to the same shared rig — so a modular avatar borrows `Head` from one
 * outfit, `Body` (top) from another and `Legs`+`Feet` (lower) from a third.
 */
export type MeshRegion = 'head' | 'top' | 'lower' | 'weapon' | 'accessory';

/** Colour role a material maps to once region is known (clothing → top/bottom). */
export type TintRole = 'skin' | 'eye' | 'hair' | 'top' | 'bottom';

/**
 * Classify a mesh node by region from its name suffix (case-insensitive):
 * `_Head`→head, `_Body`→top, `_Legs`/`_Feet`→lower; `Pistol`/`Sword`/…→weapon;
 * `Backpack`→accessory. Skeleton/root nodes (no region suffix) → null.
 */
export function partRegionOf(meshName: string): MeshRegion | null {
  // Token-boundary match so Babylon's `<node>_primitiveN` split meshes (multi-
  // material nodes) still classify by their node name.
  const n = meshName.toLowerCase();
  if (/(^|_)head(_|$)/.test(n)) return 'head';
  if (/(^|_)body(_|$)/.test(n)) return 'top';
  if (/(^|_)(legs|feet)(_|$)/.test(n)) return 'lower';
  if (/(pistol|revolver|shotgun|rifle|sword|gun|weapon)/.test(n)) return 'weapon';
  if (/(backpack|bag)/.test(n)) return 'accessory';
  return null;
}

/** Meshes that are removed on load (weapons in hand; carried accessories). */
export function isStrippableMesh(meshName: string): boolean {
  const r = partRegionOf(meshName);
  return r === 'weapon' || r === 'accessory';
}

/**
 * Themed molds whose hair/mohawk uses named colour materials instead of a generic
 * `Hair`/`Eyebrows` material — so a name-based tint silently misses them. Mapping
 * these to the hair role lets the hair-colour slider recolour them too. Keyed by
 * outfit key (note the women's `w_` prefix). Owner-approved override (Fase 12).
 */
export const HAIR_MATERIAL_OVERRIDES: Record<string, string[]> = {
  punk: ['Red', 'Red_Dark'],
  w_punk: ['Hair_Brown', 'Brown'],
};

/**
 * The colour role for a material, accounting for which region mesh carries it and
 * any per-outfit hair override. Resolution order:
 *   1. semantic by name (Skin/Eye/Hair/Eyebrows) — exposed skin on a Body/Legs mesh
 *      therefore stays skin, never clothing;
 *   2. per-outfit hair override (themed mohawk materials → hair);
 *   3. clothing by region: a `top` mesh → 'top', a `lower` mesh → 'bottom'.
 * Anything else (head accessories, weapons, unknown) keeps its authored colour (null).
 */
export function tintRoleForMaterialInRegion(
  materialName: string,
  region: MeshRegion | null,
  outfitKey?: string,
): TintRole | null {
  const base = tintRoleForMaterial(materialName);
  if (base) return base;
  if (outfitKey && (HAIR_MATERIAL_OVERRIDES[outfitKey] ?? []).includes(materialName)) return 'hair';
  if (region === 'top') return 'top';
  if (region === 'lower') return 'bottom';
  return null;
}

/** One source GLB to load for a modular avatar + which region meshes to keep from it. */
export interface ModularLoadItem {
  outfitKey: string;
  /** GLB path relative to /assets/. */
  path: string;
  /** Region meshes to keep from this container. */
  regions: MeshRegion[];
  /** Keep this container's skeleton + animation clips (the others' are discarded). */
  isSkeletonDonor: boolean;
}

/**
 * Plan the (deduplicated) set of source GLBs to load for a modular composition.
 * The `top` outfit donates the shared skeleton + animation clips (`isSkeletonDonor`);
 * `head`→head mesh, `top`→body (top) mesh, `bottom`→legs+feet (lower) meshes. When
 * picks repeat the same outfit, they collapse to one load carrying multiple regions
 * (so all-equal picks = a single GLB load, identical to the legacy whole-outfit path).
 * Unknown keys fall back to the default outfit's GLB. Pure + testable.
 */
export function planModularLoad(
  parts: { head: string; top: string; bottom: string },
): ModularLoadItem[] {
  const order: Array<[string, MeshRegion]> = [
    [parts.top, 'top'],     // donor first
    [parts.head, 'head'],
    [parts.bottom, 'lower'],
  ];
  const byKey = new Map<string, ModularLoadItem>();
  const items: ModularLoadItem[] = [];
  for (const [key, region] of order) {
    let item = byKey.get(key);
    if (!item) {
      const path = (outfitByKey(key) ?? outfitByKey(DEFAULT_OUTFIT)!).path;
      item = { outfitKey: key, path, regions: [], isSkeletonDonor: key === parts.top };
      byKey.set(key, item);
      items.push(item);
    }
    if (!item.regions.includes(region)) item.regions.push(region);
  }
  return items;
}
