/**
 * Dynamic avatar paint channels.
 *
 * Instead of the static region-wide tint (one colour for an entire `top`/`bottom`
 * mesh, hair only on a curated outfit table), this introspects the *actually
 * loaded* model: each sampled material is classified into a paint **channel** so
 * the UI can offer one colour swatch row per discovered part. Semantic materials
 * (skin/eye/hair/eyebrow/lips/teeth/jewelry) collapse to one channel each (key =
 * kind, stable across outfit swaps); every other clothing material becomes its
 * own channel keyed by region+name, giving per-material precision.
 *
 * Pure + 100% testable — no Babylon imports (the assembler samples the materials
 * and feeds plain `{materialName, region, authoredHex}` records in here).
 */
import { HAIR_MATERIAL_OVERRIDES, type MeshRegion } from './AvatarMeshCatalog';

export type ChannelKind =
  | 'skin'
  | 'eye'
  | 'eyebrow'
  | 'hair'
  | 'lips'
  | 'teeth'
  | 'jewelry'
  | 'clothing';

/** One material as sampled from a loaded avatar (name + which region carries it + its authored colour). */
export interface MaterialSample {
  materialName: string;
  region: MeshRegion | null;
  /** The material's authored base colour as a #RRGGBB hex (for the "reset to original" swatch). */
  authoredHex: string;
}

/** A paintable channel discovered on the current model. */
export interface PaintChannel {
  /** Stable key used in `CharacterAppearance.materialColors`. */
  key: string;
  /** Human label for the UI. */
  label: string;
  region: MeshRegion | null;
  kind: ChannelKind;
  /** Authored colour of the channel's first material (reset-to-original swatch). */
  defaultHex: string;
  /** Material names this channel paints. */
  materialNames: string[];
}

/** Display label for a region prefix on clothing channels. */
function regionLabel(region: MeshRegion | null): string {
  switch (region) {
    case 'top':
      return 'Top';
    case 'lower':
      return 'Lower';
    case 'head':
      return 'Head';
    default:
      return '';
  }
}

const SEMANTIC_LABELS: Record<Exclude<ChannelKind, 'clothing'>, string> = {
  skin: 'Skin',
  eye: 'Eyes',
  eyebrow: 'Eyebrows',
  hair: 'Hair',
  lips: 'Lips',
  teeth: 'Teeth',
  jewelry: 'Jewelry',
};

/**
 * Classify one material into its paint channel. Resolution order mirrors the
 * legacy `tintRoleForMaterialInRegion` but extends it with more semantic kinds
 * and a per-material clothing fallback:
 *   1. semantic by name (skin/eyebrow/eye/hair/lips/teeth/jewelry) — these win
 *      regardless of region, and use a fixed key = kind so a colour survives an
 *      outfit swap;
 *   2. per-outfit hair override (themed mohawk materials → hair);
 *   3. anything else = clothing, keyed `clothing:<region>:<materialName>` so the
 *      same material name on different regions stays distinct.
 */
export function classifyMaterial(
  materialName: string,
  region: MeshRegion | null,
  outfitKey?: string,
): { kind: ChannelKind; key: string; label: string } {
  const semantic = semanticKind(materialName, outfitKey);
  if (semantic) {
    return { kind: semantic, key: semantic, label: SEMANTIC_LABELS[semantic] };
  }
  const key = `clothing:${region ?? 'none'}:${materialName}`;
  const prefix = regionLabel(region);
  const label = prefix ? `${prefix} · ${materialName}` : materialName;
  return { kind: 'clothing', key, label };
}

/** The semantic channel kind for a material name (null = clothing/unknown). */
function semanticKind(
  materialName: string,
  outfitKey?: string,
): Exclude<ChannelKind, 'clothing'> | null {
  if (materialName === 'Skin' || /skin/i.test(materialName)) return 'skin';
  if (/^eyebrow/i.test(materialName)) return 'eyebrow';
  if (materialName === 'Eye' || /^eye(?!brow)/i.test(materialName)) return 'eye';
  if (/^hair/i.test(materialName)) return 'hair';
  if (outfitKey && (HAIR_MATERIAL_OVERRIDES[outfitKey] ?? []).includes(materialName)) return 'hair';
  if (/lip|mouth/i.test(materialName)) return 'lips';
  if (/tooth|teeth/i.test(materialName)) return 'teeth';
  if (/ring|jewel|gold|silver|metal/i.test(materialName)) return 'jewelry';
  return null;
}

/** The channel key a material resolves to (for the tint pass). */
export function channelKeyForMaterial(
  materialName: string,
  region: MeshRegion | null,
  outfitKey?: string,
): string {
  return classifyMaterial(materialName, region, outfitKey).key;
}

// Sort order: semantic kinds first (in this order), then clothing.
const KIND_ORDER: ChannelKind[] = [
  'skin',
  'eye',
  'eyebrow',
  'hair',
  'lips',
  'teeth',
  'jewelry',
  'clothing',
];
const REGION_ORDER: Array<MeshRegion | null> = ['top', 'lower', 'head', 'accessory', 'weapon', null];

/**
 * Group sampled materials into ordered paint channels (semantic channels first,
 * then clothing by region top→lower→head). Duplicate materials collapse into one
 * channel; the first sample's `authoredHex` becomes the channel's `defaultHex`.
 */
export function classifyChannels(samples: MaterialSample[], outfitKey?: string): PaintChannel[] {
  const byKey = new Map<string, PaintChannel>();
  for (const s of samples) {
    const { kind, key, label } = classifyMaterial(s.materialName, s.region, outfitKey);
    let ch = byKey.get(key);
    if (!ch) {
      ch = { key, label, region: s.region, kind, defaultHex: s.authoredHex, materialNames: [] };
      byKey.set(key, ch);
    }
    if (!ch.materialNames.includes(s.materialName)) ch.materialNames.push(s.materialName);
  }
  return [...byKey.values()].sort((a, b) => {
    const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (k !== 0) return k;
    const r = REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region);
    if (r !== 0) return r;
    return a.label.localeCompare(b.label);
  });
}
