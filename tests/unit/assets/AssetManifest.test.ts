import { CharacterAssets, assetExists } from '../../../src/assets/AssetManifest';

describe('AssetManifest', () => {
  it('CharacterAssets.bases contains 8 entries', () => {
    expect(Object.keys(CharacterAssets.bases).length).toBe(8);
  });

  it('CharacterAssets.hair contains entries', () => {
    expect(Object.keys(CharacterAssets.hair).length).toBeGreaterThan(0);
  });

  it('all base paths end with .glb', () => {
    Object.values(CharacterAssets.bases).forEach((path) => {
      expect(path).toMatch(/\.glb$/);
    });
  });

  it('all hair paths end with .glb', () => {
    Object.values(CharacterAssets.hair).forEach((path) => {
      expect(path).toMatch(/\.glb$/);
    });
  });

  it('all clothing paths end with .glb', () => {
    const allClothes = [
      ...Object.values(CharacterAssets.clothes.tops),
      ...Object.values(CharacterAssets.clothes.bottoms),
      ...Object.values(CharacterAssets.clothes.shoes),
    ];
    allClothes.forEach((path) => expect(path).toMatch(/\.glb$/));
  });

  it('assetExists returns true for non-empty path', () => {
    expect(assetExists('characters/base/body_female_black.glb')).toBe(true);
  });

  it('assetExists returns false for empty path', () => {
    expect(assetExists('')).toBe(false);
  });
});
