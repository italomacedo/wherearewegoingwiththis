import {
  OUTFITS, DEFAULT_OUTFIT, LOCO_CLIPS,
  outfitsForGender, outfitByKey, genderOfOutfit, tintRoleForMaterial,
} from '../../../src/assets/AvatarMeshCatalog';

describe('AvatarMeshCatalog — Quaternius Ultimate Modular outfits (pure)', () => {
  it('every outfit has key, gender, label and a GLB path', () => {
    for (const o of OUTFITS) {
      expect(o.key.length).toBeGreaterThan(0);
      expect(['male', 'female']).toContain(o.gender);
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.path).toMatch(/^characters\/quaternius\/(men|women)\/.+\.glb$/);
    }
  });

  it('outfit keys are unique', () => {
    const keys = OUTFITS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('DEFAULT_OUTFIT exists in the catalog', () => {
    expect(outfitByKey(DEFAULT_OUTFIT)).toBeDefined();
  });

  it('outfitsForGender filters by gender and includes known cyberpunk outfits', () => {
    const male = outfitsForGender('male').map((o) => o.key);
    expect(male).toEqual(expect.arrayContaining(['punk', 'swat', 'suit', 'casual_hoodie']));
    expect(outfitsForGender('male').every((o) => o.gender === 'male')).toBe(true);
    const female = outfitsForGender('female').map((o) => o.key);
    expect(female).toEqual(expect.arrayContaining(['w_scifi', 'w_soldier', 'w_punk']));
    expect(outfitsForGender('female').every((o) => o.gender === 'female')).toBe(true);
  });

  it('outfitByKey / genderOfOutfit resolve', () => {
    expect(outfitByKey('punk')?.gender).toBe('male');
    expect(outfitByKey('nope')).toBeUndefined();
    expect(genderOfOutfit('punk')).toBe('male');
    expect(genderOfOutfit('unknown')).toBe('male'); // safe default
  });

  it('LOCO_CLIPS maps states to the exact embedded clip names', () => {
    expect(LOCO_CLIPS).toEqual({ idle: 'Idle', walk: 'Walk', run: 'Run', interact: 'Interact' });
  });

  describe('tintRoleForMaterial', () => {
    it('maps semantic material names to colour roles', () => {
      expect(tintRoleForMaterial('Skin')).toBe('skin');
      expect(tintRoleForMaterial('Eye')).toBe('eye');
      expect(tintRoleForMaterial('Eyebrows')).toBe('hair');
      expect(tintRoleForMaterial('Hair_Black')).toBe('hair'); // women's hair material
    });
    it('leaves clothing materials untinted (null)', () => {
      expect(tintRoleForMaterial('White')).toBeNull();
      expect(tintRoleForMaterial('LightBlue')).toBeNull();
    });
  });
});
