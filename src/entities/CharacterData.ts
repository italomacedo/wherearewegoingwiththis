// ─────────────────────────────────────────────────────────────────────────────
// Character appearance model
//
// The avatar is described by a data-driven, extensible model:
//   - `slots`   — mesh-swap parts (clothing, hair, brows, beard, eyes, teeth…)
//   - `morphs`  — facial morph-target slider values (0..1), applied via the
//                 base mesh's MorphTargetManager when a real GLB is loaded
//   - `colors`  — hex tints per region (skin, hair, eyebrow, eye, beard, makeup)
//   - `skinTexture` — one of four PBR skin textures
//
// Adding a new slot/morph/color is a registry entry below — not new code in the
// assembler or the character creator. All the *rules* (exclusion, layering,
// clamping, migration) are pure functions so they're fully unit-testable under
// NullEngine without any GL/DOM.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Slots ───────────────────────────────────────────────────────────────────

export type SlotId =
  // face features (mesh)
  | 'eyes' | 'teeth'
  // hair group (mesh + tint)
  | 'hair' | 'eyebrows' | 'beard'
  // makeup (texture overlay on the face material — no mesh)
  | 'makeup'
  // clothing layers
  | 't_shirt' | 'shirt' | 'long_sleeve' | 'jacket' | 'coat' | 'kutte'
  | 'belt' | 'pants' | 'skirt' | 'shorts'
  // footwear
  | 'socks' | 'shoes' | 'boots' | 'sneakers';

export type SlotCategory =
  | 'face_feature' | 'hair_group' | 'makeup' | 'clothing' | 'footwear';

export type ColorKey = 'skin' | 'hair' | 'eyebrow' | 'eye' | 'beard' | 'makeup';

export type SkinTextureId = 'skin_01' | 'skin_02' | 'skin_03' | 'skin_04';

export interface SlotDef {
  id: SlotId;
  category: SlotCategory;
  /** Higher = rendered on top (attachment / layering order). */
  layer: number;
  /** Mutually-exclusive group — setting one clears its siblings. */
  exclusiveGroup?: string;
  /** Dot path into CharacterAssets, e.g. 'clothes.jacket'. */
  manifestKey: string;
  /** Which color tint (if any) applies to this slot's material. */
  colorKey?: ColorKey;
}

export const SLOT_REGISTRY: Record<SlotId, SlotDef> = {
  eyes:        { id: 'eyes',        category: 'face_feature', layer: 1,  manifestKey: 'eyes',     colorKey: 'eye' },
  teeth:       { id: 'teeth',       category: 'face_feature', layer: 1,  manifestKey: 'teeth' },
  eyebrows:    { id: 'eyebrows',    category: 'hair_group',   layer: 2,  manifestKey: 'eyebrows', colorKey: 'eyebrow' },
  beard:       { id: 'beard',       category: 'hair_group',   layer: 2,  manifestKey: 'beard',    colorKey: 'beard' },
  makeup:      { id: 'makeup',      category: 'makeup',       layer: 2,  manifestKey: 'makeup',   colorKey: 'makeup' },
  hair:        { id: 'hair',        category: 'hair_group',   layer: 3,  manifestKey: 'hair',     colorKey: 'hair' },
  socks:       { id: 'socks',       category: 'clothing',     layer: 5,  manifestKey: 'footwear.socks' },
  t_shirt:     { id: 't_shirt',     category: 'clothing',     layer: 10, exclusiveGroup: 'base_top', manifestKey: 'clothes.t_shirt' },
  shirt:       { id: 'shirt',       category: 'clothing',     layer: 10, exclusiveGroup: 'base_top', manifestKey: 'clothes.shirt' },
  long_sleeve: { id: 'long_sleeve', category: 'clothing',     layer: 10, exclusiveGroup: 'base_top', manifestKey: 'clothes.long_sleeve' },
  pants:       { id: 'pants',       category: 'clothing',     layer: 12, exclusiveGroup: 'bottoms',  manifestKey: 'clothes.pants' },
  skirt:       { id: 'skirt',       category: 'clothing',     layer: 12, exclusiveGroup: 'bottoms',  manifestKey: 'clothes.skirt' },
  shorts:      { id: 'shorts',      category: 'clothing',     layer: 12, exclusiveGroup: 'bottoms',  manifestKey: 'clothes.shorts' },
  shoes:       { id: 'shoes',       category: 'footwear',     layer: 14, exclusiveGroup: 'footwear', manifestKey: 'footwear.shoes' },
  boots:       { id: 'boots',       category: 'footwear',     layer: 14, exclusiveGroup: 'footwear', manifestKey: 'footwear.boots' },
  sneakers:    { id: 'sneakers',    category: 'footwear',     layer: 14, exclusiveGroup: 'footwear', manifestKey: 'footwear.sneakers' },
  belt:        { id: 'belt',        category: 'clothing',     layer: 15, manifestKey: 'clothes.belt' },
  jacket:      { id: 'jacket',      category: 'clothing',     layer: 20, manifestKey: 'clothes.jacket' },
  coat:        { id: 'coat',        category: 'clothing',     layer: 25, manifestKey: 'clothes.coat' },
  kutte:       { id: 'kutte',       category: 'clothing',     layer: 30, manifestKey: 'clothes.kutte' },
};

/** Slots that, when one is set, clear their group siblings. */
export const EXCLUSIVE_GROUPS: Record<string, SlotId[]> = {
  base_top: ['t_shirt', 'shirt', 'long_sleeve'],
  bottoms:  ['pants', 'skirt', 'shorts'],
  footwear: ['shoes', 'boots', 'sneakers'],
};

// ─── Morph targets (facial sliders) ────────────────────────────────────────────

export type MorphId = string;

export type MorphGroup =
  | 'nose' | 'cheeks' | 'ears' | 'lips' | 'mouth'
  | 'jaw' | 'eyes' | 'teeth' | 'brow' | 'face';

export interface MorphDef {
  id: MorphId;
  label: string;
  group: MorphGroup;
  /** Default slider value, 0..1. 0.5 = neutral for bidirectional morphs. */
  defaultValue: number;
}

const M = (id: string, label: string, group: MorphGroup, defaultValue = 0.5): MorphDef =>
  ({ id, label, group, defaultValue });

export const MORPH_REGISTRY: Record<MorphId, MorphDef> = Object.fromEntries(
  [
    // nose
    M('nose_width', 'Nose Width', 'nose'),
    M('nose_length', 'Nose Length', 'nose'),
    M('nose_bridge', 'Nose Bridge', 'nose'),
    M('nose_tip', 'Nose Tip', 'nose'),
    M('nose_angle', 'Nose Angle', 'nose'),
    M('nostril_width', 'Nostril Width', 'nose'),
    M('nostril_flare', 'Nostril Flare', 'nose'),
    // cheeks
    M('cheek_fullness', 'Cheek Fullness', 'cheeks'),
    M('cheekbone_height', 'Cheekbone Height', 'cheeks'),
    M('cheekbone_width', 'Cheekbone Width', 'cheeks'),
    // ears
    M('ear_size', 'Ear Size', 'ears'),
    M('ear_angle', 'Ear Angle', 'ears'),
    M('ear_lobe', 'Ear Lobe', 'ears'),
    // lips
    M('lips_fullness', 'Lips Fullness', 'lips'),
    M('lips_width', 'Lips Width', 'lips'),
    M('lip_upper', 'Upper Lip', 'lips'),
    M('lip_lower', 'Lower Lip', 'lips'),
    // mouth
    M('mouth_width', 'Mouth Width', 'mouth'),
    M('mouth_protrude', 'Mouth Protrusion', 'mouth'),
    // jaw / chin
    M('jaw_width', 'Jaw Width', 'jaw'),
    M('jaw_round', 'Jaw Roundness', 'jaw'),
    M('chin_length', 'Chin Length', 'jaw'),
    M('chin_width', 'Chin Width', 'jaw'),
    M('chin_jut', 'Chin Jut', 'jaw'),
    // eyes
    M('eye_size', 'Eye Size', 'eyes'),
    M('eye_spacing', 'Eye Spacing', 'eyes'),
    M('eye_angle', 'Eye Angle', 'eyes'),
    M('eye_depth', 'Eye Depth', 'eyes'),
    // teeth
    M('teeth_size', 'Teeth Size', 'teeth'),
    // brow
    M('brow_height', 'Brow Height', 'brow'),
    M('brow_thickness', 'Brow Thickness', 'brow'),
    // overall face
    M('face_round', 'Face Roundness', 'face'),
    M('face_oval', 'Face Length', 'face'),
    M('head_size', 'Head Size', 'face'),
    M('forehead_height', 'Forehead Height', 'face'),
    M('temple_width', 'Temple Width', 'face'),
  ].map((d) => [d.id, d]),
);

/** Clamp a morph slider value to the valid 0..1 range. */
export function clampMorph(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

// ─── Appearance shape ──────────────────────────────────────────────────────────

export interface CharacterAppearance {
  bodyBase: string;
  slots: Partial<Record<SlotId, string | null>>;
  morphs: Partial<Record<MorphId, number>>;
  colors: Partial<Record<ColorKey, string>>;
  skinTexture: SkinTextureId;
  accessories: string[];
  implants: string[];
}

export interface CharacterData {
  name: string;
  appearance: CharacterAppearance;
}

export const DEFAULT_COLORS: Record<ColorKey, string> = {
  skin: '#8B6355',
  hair: '#1A1A1A',
  eyebrow: '#1A1A1A',
  eye: '#3A2A1A',
  beard: '#1A1A1A',
  makeup: '#A03050',
};

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  bodyBase: 'body_female_black',
  slots: { hair: 'hair_short_01', eyes: 'eyes_default' },
  morphs: {},
  colors: { ...DEFAULT_COLORS },
  skinTexture: 'skin_01',
  accessories: [],
  implants: [],
};

export const BODY_BASES = [
  'body_female_asian',
  'body_female_black',
  'body_female_latina',
  'body_female_white',
  'body_male_asian',
  'body_male_black',
  'body_male_latino',
  'body_male_white',
] as const;

export type BodyBaseKey = (typeof BODY_BASES)[number];

// ─── Pure rules ─────────────────────────────────────────────────────────────────

/**
 * Returns a new `slots` map with `slotId` set to `value`. Setting a non-null
 * value clears any mutually-exclusive siblings (e.g. choosing `boots` removes
 * `shoes`/`sneakers`). Setting `null` removes the slot entirely.
 */
export function applySlot(
  slots: Partial<Record<SlotId, string | null>>,
  slotId: SlotId,
  value: string | null,
): Partial<Record<SlotId, string | null>> {
  const next: Partial<Record<SlotId, string | null>> = { ...slots };
  const def = SLOT_REGISTRY[slotId];

  if (value !== null && def?.exclusiveGroup) {
    for (const sibling of EXCLUSIVE_GROUPS[def.exclusiveGroup] ?? []) {
      if (sibling !== slotId) delete next[sibling];
    }
  }

  if (value === null) delete next[slotId];
  else next[slotId] = value;

  return next;
}

export interface ResolvedLayer {
  slot: SlotId;
  def: SlotDef;
  value: string;
}

/**
 * Ordered list of mesh-producing slots (lowest layer first). Excludes makeup
 * (a texture overlay, not a mesh) and any null/unknown slots.
 */
export function resolveLayers(appearance: CharacterAppearance): ResolvedLayer[] {
  return (Object.keys(appearance.slots) as SlotId[])
    .map((slot) => ({ slot, def: SLOT_REGISTRY[slot], value: appearance.slots[slot] }))
    .filter(
      (e): e is ResolvedLayer =>
        !!e.def && e.def.category !== 'makeup' && typeof e.value === 'string' && e.value.length > 0,
    )
    .sort((a, b) => a.def.layer - b.def.layer);
}

// ─── Accessors (callers never reach into raw fields) ────────────────────────────

export function getSkinTone(a: CharacterAppearance): string {
  return a.colors.skin ?? DEFAULT_COLORS.skin;
}
export function getHair(a: CharacterAppearance): string | null {
  return a.slots.hair ?? null;
}
export function getHairColor(a: CharacterAppearance): string {
  return a.colors.hair ?? DEFAULT_COLORS.hair;
}
export function getBaseTop(a: CharacterAppearance): string | null {
  return a.slots.shirt ?? a.slots.t_shirt ?? a.slots.long_sleeve ?? null;
}
export function getOuterwear(a: CharacterAppearance): string | null {
  return a.slots.jacket ?? a.slots.coat ?? a.slots.kutte ?? null;
}
export function getBottom(a: CharacterAppearance): string | null {
  return a.slots.pants ?? a.slots.skirt ?? a.slots.shorts ?? null;
}
export function getFootwear(a: CharacterAppearance): string | null {
  return a.slots.shoes ?? a.slots.boots ?? a.slots.sneakers ?? null;
}

/** Deep clone — appearance contains nested objects/arrays. */
export function cloneAppearance(a: CharacterAppearance): CharacterAppearance {
  return {
    bodyBase: a.bodyBase,
    slots: { ...a.slots },
    morphs: { ...a.morphs },
    colors: { ...a.colors },
    skinTexture: a.skinTexture,
    accessories: [...a.accessories],
    implants: [...a.implants],
  };
}

// ─── Migration (legacy flat shape → new model) ──────────────────────────────────

interface LegacyAppearance {
  bodyBase?: string;
  skinTone?: string;
  hair?: string | null;
  hairColor?: string;
  eyeStyle?: string;
  top?: string | null;
  bottom?: string | null;
  shoes?: string | null;
  accessories?: string[];
  implants?: string[];
}

/**
 * Idempotently upgrades any persisted appearance to the current model. Handles
 * the legacy flat shape (top/bottom/shoes/hair/eyeStyle/skinTone/hairColor) and
 * backfills newly-added keys on already-migrated data. Mirrors the defensive
 * style of `SaveService.migrate`.
 */
export function migrateAppearance(raw: unknown): CharacterAppearance {
  if (!raw || typeof raw !== 'object') return cloneAppearance(DEFAULT_APPEARANCE);

  const r = raw as Partial<CharacterAppearance> & LegacyAppearance;

  // Already new shape → backfill defaults only.
  if ('slots' in r && 'colors' in r && 'morphs' in r) {
    return {
      bodyBase: r.bodyBase ?? DEFAULT_APPEARANCE.bodyBase,
      slots: { ...(r.slots ?? {}) },
      morphs: { ...(r.morphs ?? {}) },
      colors: { ...DEFAULT_COLORS, ...(r.colors ?? {}) },
      skinTexture: (r.skinTexture as SkinTextureId) ?? 'skin_01',
      accessories: Array.isArray(r.accessories) ? [...r.accessories] : [],
      implants: Array.isArray(r.implants) ? [...r.implants] : [],
    };
  }

  // Legacy flat shape → map onto slots/colors.
  const slots: Partial<Record<SlotId, string | null>> = {};
  if (r.hair) slots.hair = r.hair;
  if (r.eyeStyle) slots.eyes = r.eyeStyle;
  if (r.top) slots.shirt = r.top;
  if (r.bottom) slots.pants = r.bottom;
  if (r.shoes) slots.boots = r.shoes;

  const colors: Partial<Record<ColorKey, string>> = { ...DEFAULT_COLORS };
  if (r.skinTone) colors.skin = r.skinTone;
  if (r.hairColor) colors.hair = r.hairColor;

  return {
    bodyBase: r.bodyBase ?? DEFAULT_APPEARANCE.bodyBase,
    slots,
    morphs: {},
    colors,
    skinTexture: 'skin_01',
    accessories: Array.isArray(r.accessories) ? [...r.accessories] : [],
    implants: Array.isArray(r.implants) ? [...r.implants] : [],
  };
}
