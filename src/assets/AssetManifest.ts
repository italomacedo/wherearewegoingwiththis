/**
 * Central registry of all game assets.
 * Paths are relative to the public/assets/ directory (served by Vite at /assets/).
 *
 * The project currently ships ZERO binary assets — everything renders
 * procedurally. These entries describe the paths the owner will populate
 * (a one-time MakeHuman/MPFB2 export for the base + clothing/hair GLBs +
 * skin/makeup PNGs). The CharacterAssembler falls back to placeholder geometry
 * per-part until the files exist.
 */

import { MORPH_REGISTRY, type MorphId } from '@entities/CharacterData';

export const CharacterAssets = {
  bases: {
    body_female_african:   'characters/base/body_female_african.glb',
    body_female_asian:     'characters/base/body_female_asian.glb',
    body_female_caucasian: 'characters/base/body_female_caucasian.glb',
    body_female_universal: 'characters/base/body_female_universal.glb',
    body_male_african:     'characters/base/body_male_african.glb',
    body_male_asian:       'characters/base/body_male_asian.glb',
    body_male_caucasian:   'characters/base/body_male_caucasian.glb',
    body_male_universal:   'characters/base/body_male_universal.glb',
  },

  // PBR skin textures (albedo PNGs) — tinted by colors.skin at runtime.
  skinTextures: {
    skin_01: 'characters/skin/skin_01.png',
    skin_02: 'characters/skin/skin_02.png',
    skin_03: 'characters/skin/skin_03.png',
    skin_04: 'characters/skin/skin_04.png',
  },

  hair: {
    hair_short_01:       'characters/hair/hair_short_01.glb',
    hair_long_01:        'characters/hair/hair_long_01.glb',
    hair_undercut_01:    'characters/hair/hair_undercut_01.glb',
    hair_mohawk_01:      'characters/hair/hair_mohawk_01.glb',
    hair_bun_01:         'characters/hair/hair_bun_01.glb',
    hair_dreadlocks_01:  'characters/hair/hair_dreadlocks_01.glb',
  },

  eyebrows: {
    eyebrows_natural:    'characters/face/eyebrows_natural.glb',
    eyebrows_thick:      'characters/face/eyebrows_thick.glb',
    eyebrows_thin:       'characters/face/eyebrows_thin.glb',
  },

  beard: {
    beard_stubble:       'characters/face/beard_stubble.glb',
    beard_full:          'characters/face/beard_full.glb',
    beard_goatee:        'characters/face/beard_goatee.glb',
  },

  eyes: {
    eyes_default:        'characters/face/eyes_default.glb',
    eyes_cyber_blue:     'characters/face/eyes_cyber_blue.glb',
    eyes_cyber_red:      'characters/face/eyes_cyber_red.glb',
  },

  teeth: {
    teeth_default:       'characters/face/teeth_default.glb',
  },

  // Makeup is a face-texture overlay (PNG), not a mesh.
  makeup: {
    makeup_smoky:        'characters/face/makeup_smoky.png',
    makeup_neon:         'characters/face/makeup_neon.png',
    makeup_warpaint:     'characters/face/makeup_warpaint.png',
  },

  clothes: {
    t_shirt: {
      tshirt_black:        'characters/clothes/tops/tshirt_black.glb',
      tshirt_logo:         'characters/clothes/tops/tshirt_logo.glb',
    },
    shirt: {
      shirt_tank_black:    'characters/clothes/tops/shirt_tank_black.glb',
      shirt_button:        'characters/clothes/tops/shirt_button.glb',
    },
    long_sleeve: {
      hoodie_corp:         'characters/clothes/tops/hoodie_corp.glb',
      thermal_mesh:        'characters/clothes/tops/thermal_mesh.glb',
    },
    jacket: {
      jacket_neon_bomber:  'characters/clothes/tops/jacket_neon_bomber.glb',
      jacket_leather:      'characters/clothes/tops/jacket_leather.glb',
    },
    coat: {
      coat_trench:         'characters/clothes/tops/coat_trench.glb',
      coat_duster:         'characters/clothes/tops/coat_duster.glb',
    },
    kutte: {
      kutte_club:          'characters/clothes/tops/kutte_club.glb',
    },
    belt: {
      belt_utility:        'characters/clothes/belt/belt_utility.glb',
      belt_chain:          'characters/clothes/belt/belt_chain.glb',
    },
    pants: {
      pants_tactical:      'characters/clothes/bottoms/pants_tactical.glb',
      pants_cargo:         'characters/clothes/bottoms/pants_cargo.glb',
    },
    skirt: {
      skirt_pleated:       'characters/clothes/bottoms/skirt_pleated.glb',
    },
    shorts: {
      shorts_cyber:        'characters/clothes/bottoms/shorts_cyber.glb',
    },
  },

  footwear: {
    socks: {
      socks_ankle:         'characters/clothes/footwear/socks_ankle.glb',
      socks_long:          'characters/clothes/footwear/socks_long.glb',
    },
    shoes: {
      shoes_dress:         'characters/clothes/footwear/shoes_dress.glb',
    },
    boots: {
      boots_platform_chrome: 'characters/clothes/footwear/boots_platform_chrome.glb',
      boots_combat:          'characters/clothes/footwear/boots_combat.glb',
    },
    sneakers: {
      sneakers_neon:         'characters/clothes/footwear/sneakers_neon.glb',
    },
  },

  implants: {
    eye_mod_left_optical:  'characters/cyberpunk/implants_visible/eye_mod_left.glb',
    neck_data_port:        'characters/cyberpunk/implants_visible/neck_data_port.glb',
    cheek_chrome_01:       'characters/cyberpunk/implants_visible/cheek_chrome_01.glb',
  },

  // Mixamo animation clips retargeted to the MakeHuman humanoid rig.
  animations: {
    idle:     'characters/animations/idle.glb',
    walk:     'characters/animations/walk.glb',
    run:      'characters/animations/run.glb',
    interact: 'characters/animations/interact.glb',
  },
} as const;

export type CharacterBaseKey = keyof typeof CharacterAssets.bases;
export type HairKey = keyof typeof CharacterAssets.hair;
export type EyeKey = keyof typeof CharacterAssets.eyes;
export type SkinTextureKey = keyof typeof CharacterAssets.skinTextures;
export type AnimationKey = keyof typeof CharacterAssets.animations;

/**
 * Resolves a slot's `manifestKey` (dot path into CharacterAssets, e.g.
 * 'clothes.jacket') + an asset key (e.g. 'jacket_leather') into a file path.
 * Returns null when the path or asset key doesn't exist in the manifest.
 */
export function resolveAssetPath(manifestKey: string, assetKey: string): string | null {
  let node: unknown = CharacterAssets;
  for (const segment of manifestKey.split('.')) {
    if (node && typeof node === 'object' && segment in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return null;
    }
  }
  if (node && typeof node === 'object' && assetKey in (node as Record<string, unknown>)) {
    const value = (node as Record<string, unknown>)[assetKey];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * Lists the asset keys available under a manifest category path (e.g.
 * 'clothes.jacket' → ['jacket_neon_bomber', 'jacket_leather']). Returns only
 * leaf (string-valued) entries; unknown paths yield []. Pure.
 */
export function listAssetKeys(manifestKey: string): string[] {
  let node: unknown = CharacterAssets;
  for (const segment of manifestKey.split('.')) {
    if (node && typeof node === 'object' && segment in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return [];
    }
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k]) => k);
  }
  return [];
}

/** Resolves a base-body key directly to its GLB path (falls back to default). */
export function resolveBasePath(bodyBase: string): string {
  const bases = CharacterAssets.bases as Record<string, string>;
  return bases[bodyBase] ?? CharacterAssets.bases.body_female_african;
}

/**
 * Morph-slider id → candidate glTF morph-target names. MakeHuman/MPFB2 target
 * names are NOT guaranteed stable, so each slider lists aliases; the first one
 * present in the loaded mesh wins. An unmatched slider degrades to a no-op
 * rather than crashing. The owner confirms exact names after the first export
 * (Phase 6) and tunes these aliases — a manifest-only change.
 */
export const MORPH_TARGET_NAMES: Record<MorphId, string[]> = {
  nose_width:      ['nose-scale-horiz', 'Nose Width', 'nose_width'],
  nose_length:     ['nose-scale-vert', 'Nose Length', 'nose_length'],
  nose_bridge:     ['nose-bridge', 'Nose Bridge'],
  nose_tip:        ['nose-point', 'Nose Tip'],
  nose_angle:      ['nose-angle', 'Nose Angle'],
  nostril_width:   ['nose-nostrils-width', 'Nostril Width'],
  nostril_flare:   ['nose-nostrils-flare', 'Nostril Flare'],
  cheek_fullness:  ['cheek-volume', 'Cheek Fullness'],
  cheekbone_height:['cheek-bones-height', 'Cheekbone Height'],
  cheekbone_width: ['cheek-bones-width', 'Cheekbone Width'],
  ear_size:        ['ear-scale', 'Ear Size'],
  ear_angle:       ['ear-rotation', 'Ear Angle'],
  ear_lobe:        ['ear-lobe', 'Ear Lobe'],
  lips_fullness:   ['mouth-lips-fullness', 'Lips Fullness'],
  lips_width:      ['mouth-scale-horiz', 'Lips Width'],
  lip_upper:       ['mouth-lips-upper', 'Upper Lip'],
  lip_lower:       ['mouth-lips-lower', 'Lower Lip'],
  mouth_width:     ['mouth-width', 'Mouth Width'],
  mouth_protrude:  ['mouth-protrude', 'Mouth Protrusion'],
  jaw_width:       ['jaw-scale-horiz', 'Jaw Width'],
  jaw_round:       ['jaw-round', 'Jaw Roundness'],
  chin_length:     ['chin-height', 'Chin Length'],
  chin_width:      ['chin-width', 'Chin Width'],
  chin_jut:        ['chin-prominent', 'Chin Jut'],
  eye_size:        ['eyes-scale', 'Eye Size'],
  eye_spacing:     ['eyes-dist', 'Eye Spacing'],
  eye_angle:       ['eyes-angle', 'Eye Angle'],
  eye_depth:       ['eyes-depth', 'Eye Depth'],
  teeth_size:      ['teeth-scale', 'Teeth Size'],
  brow_height:     ['brow-height', 'Brow Height'],
  brow_thickness:  ['brow-thickness', 'Brow Thickness'],
  face_round:      ['head-round', 'Face Roundness'],
  face_oval:       ['head-oval', 'Face Length'],
  head_size:       ['head-scale', 'Head Size'],
  forehead_height: ['forehead-height', 'Forehead Height'],
  temple_width:    ['head-temple-width', 'Temple Width'],
};

/**
 * Maps a morph slider id to the first of its alias names that exists among the
 * mesh's available morph-target names (case-insensitive). Returns null if none
 * match — the slider then has no effect (graceful degradation).
 */
export function mapMorphName(morphId: MorphId, availableNames: string[]): string | null {
  const aliases = MORPH_TARGET_NAMES[morphId];
  if (!aliases) return null;
  const lowerAvailable = new Map(availableNames.map((n) => [n.toLowerCase(), n]));
  for (const alias of aliases) {
    const match = lowerAvailable.get(alias.toLowerCase());
    if (match) return match;
  }
  return null;
}

export interface MorphCoverageReport {
  /** Morph slider ids that matched an available glTF target. */
  mapped: string[];
  /** Morph slider ids with no matching target name (will no-op). */
  unmappedSliders: string[];
  /** Available glTF target names not used by any slider. */
  unusedTargets: string[];
}

/**
 * Diffs the morph-slider registry against the morph-target names actually
 * present on a loaded base mesh. Used (phase 6) to confirm the MakeHuman/MPFB2
 * export's target names and tune MORPH_TARGET_NAMES aliases. Pure + testable.
 */
export function diffMorphCoverage(availableTargetNames: string[]): MorphCoverageReport {
  const mapped: string[] = [];
  const unmappedSliders: string[] = [];
  const used = new Set<string>();
  for (const morphId of Object.keys(MORPH_REGISTRY)) {
    const name = mapMorphName(morphId, availableTargetNames);
    if (name) {
      mapped.push(morphId);
      used.add(name);
    } else {
      unmappedSliders.push(morphId);
    }
  }
  return {
    mapped,
    unmappedSliders,
    unusedTargets: availableTargetNames.filter((n) => !used.has(n)),
  };
}

/** Whether an asset has a real GLTF file (not just a manifest entry) */
export function assetExists(path: string): boolean {
  return path.length > 0; // runtime check via fetch/loader would be done by CharacterAssembler
}

/** Locomotion clip keys, in the order they're loaded/retargeted. */
export const ANIMATION_KEYS = ['idle', 'walk', 'run', 'interact'] as const;

export interface SkeletonRetargetReport {
  /** Animation bone names that exist on the base skeleton (drivable). */
  matched: string[];
  /** Animation bone names with no counterpart on the base skeleton (ignored). */
  missing: string[];
}

/**
 * Diffs an animation clip's target bone names against the base skeleton's bones.
 * Retargeting separate Mixamo clips onto the MakeHuman rig only works for bones
 * present in both; this reports the mismatch so a bad export is diagnosable
 * (risk #3 — bone-name parity). Case-insensitive. Pure + testable.
 */
export function diffSkeletonBones(baseBoneNames: string[], animBoneNames: string[]): SkeletonRetargetReport {
  const baseLower = new Set(baseBoneNames.map((n) => n.toLowerCase()));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const name of animBoneNames) {
    (baseLower.has(name.toLowerCase()) ? matched : missing).push(name);
  }
  return { matched, missing };
}
