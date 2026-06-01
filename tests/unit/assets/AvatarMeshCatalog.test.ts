import {
  OUTFITS, DEFAULT_OUTFIT, LOCO_CLIPS,
  LOCO_CLIP_GROUND_SPEED, LOCO_SPEED_RATIO_MIN, LOCO_SPEED_RATIO_MAX, computeLocoSpeedRatio,
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

  describe('computeLocoSpeedRatio — match clip cadence to ground speed', () => {
    it('idle and interact always play at the authored rate (1)', () => {
      expect(computeLocoSpeedRatio('idle', 0)).toBe(1);
      expect(computeLocoSpeedRatio('idle', 4)).toBe(1);
      expect(computeLocoSpeedRatio('interact', 8)).toBe(1);
    });

    it('walk/run scale by actualSpeed / clipGroundSpeed', () => {
      expect(computeLocoSpeedRatio('walk', LOCO_CLIP_GROUND_SPEED.walk)).toBeCloseTo(1, 6);
      expect(computeLocoSpeedRatio('walk', 4)).toBeCloseTo(4 / LOCO_CLIP_GROUND_SPEED.walk, 6);
      expect(computeLocoSpeedRatio('run', 8)).toBeCloseTo(8 / LOCO_CLIP_GROUND_SPEED.run, 6);
    });

    it('zero/negative speed falls back to the authored rate (no frozen division)', () => {
      expect(computeLocoSpeedRatio('walk', 0)).toBe(1);
      expect(computeLocoSpeedRatio('run', -3)).toBe(1);
    });

    it('clamps to the sane ratio range', () => {
      expect(computeLocoSpeedRatio('run', 9999)).toBe(LOCO_SPEED_RATIO_MAX);
      expect(computeLocoSpeedRatio('walk', 0.0001)).toBe(LOCO_SPEED_RATIO_MIN);
    });

    it('LOCO_CLIP_GROUND_SPEED has positive reference speeds', () => {
      expect(LOCO_CLIP_GROUND_SPEED.walk).toBeGreaterThan(0);
      expect(LOCO_CLIP_GROUND_SPEED.run).toBeGreaterThan(LOCO_CLIP_GROUND_SPEED.walk);
    });
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
