import {
  CharacterAssets, assetExists, resolveAssetPath, resolveBasePath,
  mapMorphName, MORPH_TARGET_NAMES,
} from '../../../src/assets/AssetManifest';

describe('AssetManifest', () => {
  it('CharacterAssets.bases contains 8 entries', () => {
    expect(Object.keys(CharacterAssets.bases).length).toBe(8);
  });

  it('has 4 skin textures (PNG)', () => {
    const skins = Object.values(CharacterAssets.skinTextures);
    expect(skins.length).toBe(4);
    skins.forEach((p) => expect(p).toMatch(/\.png$/));
  });

  it('all base paths end with .glb', () => {
    Object.values(CharacterAssets.bases).forEach((path) => expect(path).toMatch(/\.glb$/));
  });

  it('layered clothing categories exist with .glb paths', () => {
    const clothes = CharacterAssets.clothes;
    for (const key of ['t_shirt', 'shirt', 'long_sleeve', 'jacket', 'coat', 'kutte', 'belt', 'pants', 'skirt', 'shorts'] as const) {
      expect(clothes[key]).toBeDefined();
      Object.values(clothes[key]).forEach((p) => expect(p).toMatch(/\.glb$/));
    }
  });

  it('footwear categories exist (socks/shoes/boots/sneakers)', () => {
    for (const key of ['socks', 'shoes', 'boots', 'sneakers'] as const) {
      expect(Object.keys(CharacterAssets.footwear[key]).length).toBeGreaterThan(0);
    }
  });

  it('has animation clips', () => {
    for (const key of ['idle', 'walk', 'run', 'interact'] as const) {
      expect(CharacterAssets.animations[key]).toMatch(/\.glb$/);
    }
  });

  describe('resolveAssetPath', () => {
    it('resolves a nested clothing path', () => {
      expect(resolveAssetPath('clothes.jacket', 'jacket_leather'))
        .toBe('characters/clothes/tops/jacket_leather.glb');
    });

    it('resolves a footwear path', () => {
      expect(resolveAssetPath('footwear.boots', 'boots_combat'))
        .toBe('characters/clothes/footwear/boots_combat.glb');
    });

    it('resolves a top-level category (hair)', () => {
      expect(resolveAssetPath('hair', 'hair_long_01'))
        .toBe('characters/hair/hair_long_01.glb');
    });

    it('returns null for an unknown manifest key', () => {
      expect(resolveAssetPath('clothes.nope', 'x')).toBeNull();
    });

    it('returns null for an unknown asset key', () => {
      expect(resolveAssetPath('clothes.jacket', 'does_not_exist')).toBeNull();
    });
  });

  describe('resolveBasePath', () => {
    it('resolves a known base', () => {
      expect(resolveBasePath('body_male_white')).toBe('characters/base/body_male_white.glb');
    });
    it('falls back to default for unknown base', () => {
      expect(resolveBasePath('nope')).toBe(CharacterAssets.bases.body_female_black);
    });
  });

  describe('mapMorphName', () => {
    it('matches the first available alias (case-insensitive)', () => {
      // nostril_width aliases include 'nose-nostrils-width'
      expect(mapMorphName('nostril_width', ['NOSE-NOSTRILS-WIDTH', 'other']))
        .toBe('NOSE-NOSTRILS-WIDTH');
    });

    it('returns null when no alias is present', () => {
      expect(mapMorphName('nostril_width', ['totally-different'])).toBeNull();
    });

    it('returns null for an unknown morph id', () => {
      expect(mapMorphName('not_a_morph', ['anything'])).toBeNull();
    });

    it('every alias list is non-empty', () => {
      for (const aliases of Object.values(MORPH_TARGET_NAMES)) {
        expect(aliases.length).toBeGreaterThan(0);
      }
    });
  });

  it('assetExists returns true/false for non-empty/empty path', () => {
    expect(assetExists('characters/base/body_female_black.glb')).toBe(true);
    expect(assetExists('')).toBe(false);
  });
});
