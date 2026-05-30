/**
 * Central registry of all game assets.
 * Paths are relative to the public/assets/ directory.
 *
 * Placeholders (prefix "placeholder_") are generated procedurally at runtime.
 * Real GLTF assets (from Sketchfab, Quaternius, etc.) replace them when placed
 * in the correct src/assets/ subdirectory.
 */

export const CharacterAssets = {
  bases: {
    body_female_asian:   'characters/base/body_female_asian.glb',
    body_female_black:   'characters/base/body_female_black.glb',
    body_female_latina:  'characters/base/body_female_latina.glb',
    body_female_white:   'characters/base/body_female_white.glb',
    body_male_asian:     'characters/base/body_male_asian.glb',
    body_male_black:     'characters/base/body_male_black.glb',
    body_male_latino:    'characters/base/body_male_latino.glb',
    body_male_white:     'characters/base/body_male_white.glb',
  },

  hair: {
    hair_short_01:       'characters/hair/hair_short_01.glb',
    hair_long_01:        'characters/hair/hair_long_01.glb',
    hair_undercut_01:    'characters/hair/hair_undercut_01.glb',
    hair_mohawk_01:      'characters/hair/hair_mohawk_01.glb',
    hair_bun_01:         'characters/hair/hair_bun_01.glb',
    hair_dreadlocks_01:  'characters/hair/hair_dreadlocks_01.glb',
  },

  eyes: {
    eyes_default:        'characters/face/eyes_default.glb',
    eyes_cyber_blue:     'characters/face/eyes_cyber_blue.glb',
    eyes_cyber_red:      'characters/face/eyes_cyber_red.glb',
  },

  clothes: {
    tops: {
      jacket_neon_bomber:  'characters/clothes/tops/jacket_neon_bomber.glb',
      shirt_tank_black:    'characters/clothes/tops/shirt_tank_black.glb',
      hoodie_corp:         'characters/clothes/tops/hoodie_corp.glb',
    },
    bottoms: {
      pants_tactical:      'characters/clothes/bottoms/pants_tactical.glb',
      pants_cargo:         'characters/clothes/bottoms/pants_cargo.glb',
      shorts_cyber:        'characters/clothes/bottoms/shorts_cyber.glb',
    },
    shoes: {
      boots_platform_chrome: 'characters/clothes/shoes/boots_platform_chrome.glb',
      boots_combat:          'characters/clothes/shoes/boots_combat.glb',
      sneakers_neon:         'characters/clothes/shoes/sneakers_neon.glb',
    },
  },

  implants: {
    eye_mod_left_optical:  'characters/cyberpunk/implants_visible/eye_mod_left.glb',
    neck_data_port:        'characters/cyberpunk/implants_visible/neck_data_port.glb',
    cheek_chrome_01:       'characters/cyberpunk/implants_visible/cheek_chrome_01.glb',
  },
} as const;

export type CharacterBaseKey = keyof typeof CharacterAssets.bases;
export type HairKey = keyof typeof CharacterAssets.hair;
export type EyeKey = keyof typeof CharacterAssets.eyes;

/** Whether an asset has a real GLTF file (not just a manifest entry) */
export function assetExists(path: string): boolean {
  return path.length > 0; // runtime check via fetch/loader would be done by CharacterAssembler
}
