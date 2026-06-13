import {
  CharacterData, CharacterAppearance, DEFAULT_APPEARANCE, DEFAULT_COLORS, BODY_BASES,
  SLOT_REGISTRY, MORPH_REGISTRY, EXCLUSIVE_GROUPS,
  applySlot, resolveLayers, clampMorph, cloneAppearance, migrateAppearance,
  getSkinTone, getHair, getHairColor, getBaseTop, getOuterwear, getBottom, getFootwear,
  bodyBaseKey, parseGender, parseEthnicity, resolveAvatarParts, applyArmorOverlay, keepColorForRegion,
  setMaterialColor,
} from '../../../src/entities/CharacterData';

describe('CharacterData', () => {
  it('DEFAULT_APPEARANCE has required fields in the new shape', () => {
    expect(DEFAULT_APPEARANCE.bodyBase).toBeDefined();
    expect(DEFAULT_APPEARANCE.colors.skin).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(DEFAULT_APPEARANCE.colors.hair).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(DEFAULT_APPEARANCE.skinTexture).toBe('skin_01');
    expect(DEFAULT_APPEARANCE.slots.hair).toBe('hair_short_01');
    expect(DEFAULT_APPEARANCE.slots.eyes).toBe('eyes_default');
    expect(Array.isArray(DEFAULT_APPEARANCE.accessories)).toBe(true);
    expect(Array.isArray(DEFAULT_APPEARANCE.implants)).toBe(true);
  });

  it('BODY_BASES contains 8 variants (4 female + 4 male)', () => {
    expect(BODY_BASES.length).toBe(8);
    expect(BODY_BASES.filter((b) => b.startsWith('body_female')).length).toBe(4);
    expect(BODY_BASES.filter((b) => b.startsWith('body_male')).length).toBe(4);
  });

  it('CharacterData interface is satisfied by defaults', () => {
    const data: CharacterData = { name: 'Test', appearance: cloneAppearance(DEFAULT_APPEARANCE) };
    expect(data.name).toBe('Test');
    expect(data.appearance.bodyBase).toBe(DEFAULT_APPEARANCE.bodyBase);
  });

  describe('SLOT_REGISTRY', () => {
    it('every slot declares a manifestKey, category and layer', () => {
      for (const def of Object.values(SLOT_REGISTRY)) {
        expect(def.manifestKey.length).toBeGreaterThan(0);
        expect(def.category).toBeDefined();
        expect(typeof def.layer).toBe('number');
      }
    });

    it('exclusive groups reference real slots', () => {
      for (const members of Object.values(EXCLUSIVE_GROUPS)) {
        for (const id of members) expect(SLOT_REGISTRY[id]).toBeDefined();
      }
    });

    it('outerwear layers above base tops', () => {
      expect(SLOT_REGISTRY.kutte.layer).toBeGreaterThan(SLOT_REGISTRY.jacket.layer);
      expect(SLOT_REGISTRY.jacket.layer).toBeGreaterThan(SLOT_REGISTRY.shirt.layer);
    });
  });

  describe('MORPH_REGISTRY', () => {
    it('contains a rich set of grouped facial morphs', () => {
      expect(Object.keys(MORPH_REGISTRY).length).toBeGreaterThanOrEqual(30);
      expect(MORPH_REGISTRY.nostril_width.group).toBe('nose');
      expect(MORPH_REGISTRY.lips_fullness.group).toBe('lips');
      expect(MORPH_REGISTRY.ear_size.group).toBe('ears');
    });
  });

  describe('gender/ethnicity body-base keys', () => {
    it('composes keys (MakeHuman ethnicity vocabulary)', () => {
      expect(bodyBaseKey('female', 'african')).toBe('body_female_african');
      expect(bodyBaseKey('male', 'caucasian')).toBe('body_male_caucasian');
      expect(bodyBaseKey('female', 'asian')).toBe('body_female_asian');
      expect(bodyBaseKey('male', 'universal')).toBe('body_male_universal');
    });

    it('parses gender + ethnicity back from a key', () => {
      expect(parseGender('body_male_african')).toBe('male');
      expect(parseGender('body_female_caucasian')).toBe('female');
      expect(parseEthnicity('body_female_asian')).toBe('asian');
      expect(parseEthnicity('body_male_african')).toBe('african');
      expect(parseEthnicity('body_female_caucasian')).toBe('caucasian');
      expect(parseEthnicity('body_male_universal')).toBe('universal');
    });

    it('round-trips through bodyBaseKey', () => {
      for (const g of ['male', 'female'] as const) {
        for (const e of ['african', 'asian', 'caucasian', 'universal'] as const) {
          const key = bodyBaseKey(g, e);
          expect(parseGender(key)).toBe(g);
          expect(parseEthnicity(key)).toBe(e);
        }
      }
    });
  });

  describe('clampMorph', () => {
    it('clamps to 0..1 and handles NaN', () => {
      expect(clampMorph(-1)).toBe(0);
      expect(clampMorph(2)).toBe(1);
      expect(clampMorph(0.42)).toBeCloseTo(0.42);
      expect(clampMorph(NaN)).toBe(0);
    });
  });

  describe('applySlot', () => {
    it('sets a slot value', () => {
      const slots = applySlot({}, 'jacket', 'jacket_leather');
      expect(slots.jacket).toBe('jacket_leather');
    });

    it('clears exclusive siblings when one is chosen', () => {
      let slots = applySlot({}, 'pants', 'pants_cargo');
      slots = applySlot(slots, 'skirt', 'skirt_pleated');
      expect(slots.pants).toBeUndefined();
      expect(slots.skirt).toBe('skirt_pleated');
    });

    it('footwear variants are mutually exclusive', () => {
      let slots = applySlot({}, 'boots', 'boots_combat');
      slots = applySlot(slots, 'sneakers', 'sneakers_neon');
      expect(slots.boots).toBeUndefined();
      expect(slots.sneakers).toBe('sneakers_neon');
    });

    it('null removes the slot', () => {
      let slots = applySlot({}, 'jacket', 'jacket_leather');
      slots = applySlot(slots, 'jacket', null);
      expect(slots.jacket).toBeUndefined();
    });

    it('does not mutate the input', () => {
      const input = {};
      applySlot(input, 'jacket', 'jacket_leather');
      expect(input).toEqual({});
    });

    it('non-exclusive slots coexist (socks + boots)', () => {
      let slots = applySlot({}, 'socks', 'socks_long');
      slots = applySlot(slots, 'boots', 'boots_combat');
      expect(slots.socks).toBe('socks_long');
      expect(slots.boots).toBe('boots_combat');
    });
  });

  describe('resolveLayers', () => {
    it('returns mesh slots ordered by layer, excluding makeup and nulls', () => {
      const appearance: CharacterAppearance = {
        ...cloneAppearance(DEFAULT_APPEARANCE),
        slots: { kutte: 'kutte_club', shirt: 'shirt_button', makeup: 'makeup_neon', boots: 'boots_combat' },
      };
      const layers = resolveLayers(appearance);
      const ids = layers.map((l) => l.slot);
      expect(ids).not.toContain('makeup');
      // ascending layer order: shirt(10) < boots(14) < kutte(30)
      expect(ids).toEqual(['shirt', 'boots', 'kutte']);
    });

    it('excludes a known slot explicitly set to null', () => {
      const appearance: CharacterAppearance = {
        ...cloneAppearance(DEFAULT_APPEARANCE),
        slots: { jacket: null, shirt: 'shirt_button' },
      };
      expect(resolveLayers(appearance).map((l) => l.slot)).toEqual(['shirt']);
    });

    it('skips unknown slot ids', () => {
      const appearance: CharacterAppearance = {
        ...cloneAppearance(DEFAULT_APPEARANCE),
        slots: { bogus: 'x' } as CharacterAppearance['slots'],
      };
      expect(resolveLayers(appearance)).toEqual([]);
    });
  });

  describe('accessors', () => {
    it('read tints and resolved exclusive slots', () => {
      const appearance: CharacterAppearance = {
        ...cloneAppearance(DEFAULT_APPEARANCE),
        slots: { hair: 'hair_long_01', long_sleeve: 'hoodie_corp', jacket: 'jacket_leather', shorts: 'shorts_cyber', sneakers: 'sneakers_neon' },
        colors: { skin: '#AABBCC', hair: '#FF00FF' },
      };
      expect(getSkinTone(appearance)).toBe('#AABBCC');
      expect(getHairColor(appearance)).toBe('#FF00FF');
      expect(getHair(appearance)).toBe('hair_long_01');
      expect(getBaseTop(appearance)).toBe('hoodie_corp');
      expect(getOuterwear(appearance)).toBe('jacket_leather');
      expect(getBottom(appearance)).toBe('shorts_cyber');
      expect(getFootwear(appearance)).toBe('sneakers_neon');
    });

    it('fall back to defaults / null when unset', () => {
      const bare: CharacterAppearance = {
        bodyBase: 'body_male_white', slots: {}, morphs: {}, colors: {},
        skinTexture: 'skin_01', accessories: [], implants: [], avatarPieces: {},
      };
      expect(getSkinTone(bare)).toBe(DEFAULT_COLORS.skin);
      expect(getHairColor(bare)).toBe(DEFAULT_COLORS.hair);
      expect(getHair(bare)).toBeNull();
      expect(getBaseTop(bare)).toBeNull();
      expect(getFootwear(bare)).toBeNull();
    });
  });

  describe('cloneAppearance', () => {
    it('produces an independent deep copy', () => {
      const clone = cloneAppearance(DEFAULT_APPEARANCE);
      clone.slots.hair = 'changed';
      clone.colors.skin = '#000000';
      clone.implants.push('x');
      expect(DEFAULT_APPEARANCE.slots.hair).toBe('hair_short_01');
      expect(DEFAULT_APPEARANCE.colors.skin).toBe(DEFAULT_COLORS.skin);
      expect(DEFAULT_APPEARANCE.implants).toHaveLength(0);
    });
  });

  describe('materialColors (dynamic paint)', () => {
    it('defaults to an empty map and clones independently', () => {
      expect(DEFAULT_APPEARANCE.materialColors).toEqual({});
      const clone = cloneAppearance(DEFAULT_APPEARANCE);
      clone.materialColors!['skin'] = '#FF0000';
      expect(DEFAULT_APPEARANCE.materialColors).toEqual({});
    });

    it('setMaterialColor adds a channel colour immutably', () => {
      const a = cloneAppearance(DEFAULT_APPEARANCE);
      const b = setMaterialColor(a, 'clothing:top:Tie', '#123456');
      expect(b.materialColors!['clothing:top:Tie']).toBe('#123456');
      expect(a.materialColors!['clothing:top:Tie']).toBeUndefined(); // original untouched
      const c = setMaterialColor(b, 'hair', '#ABCDEF');
      expect(c.materialColors).toEqual({ 'clothing:top:Tie': '#123456', hair: '#ABCDEF' });
    });

    it('migrateAppearance backfills materialColors on both branches', () => {
      // already-new shape
      const fromNew = migrateAppearance({ bodyBase: 'punk', slots: {}, morphs: {}, colors: {} } as unknown);
      expect(fromNew.materialColors).toEqual({});
      // already-new shape that already carries materialColors → preserved
      const withColors = migrateAppearance({
        slots: {}, morphs: {}, colors: {}, materialColors: { hair: '#FF0000' },
      } as unknown);
      expect(withColors.materialColors).toEqual({ hair: '#FF0000' });
      // legacy flat shape
      const fromLegacy = migrateAppearance({ bodyBase: 'body_male_white', skinTone: '#010203' });
      expect(fromLegacy.materialColors).toEqual({});
    });
  });

  describe('migrateAppearance', () => {
    it('maps a legacy flat appearance onto the new model', () => {
      const legacy = {
        bodyBase: 'body_male_black',
        skinTone: '#112233',
        hair: 'hair_long_01',
        hairColor: '#445566',
        eyeStyle: 'eyes_cyber_blue',
        top: 'jacket_neon_bomber',
        bottom: 'pants_tactical',
        shoes: 'boots_combat',
        accessories: ['a'],
        implants: ['neck_data_port'],
      };
      const a = migrateAppearance(legacy);
      expect(a.bodyBase).toBe('body_male_black');
      expect(a.colors.skin).toBe('#112233');
      expect(a.colors.hair).toBe('#445566');
      expect(a.slots.hair).toBe('hair_long_01');
      expect(a.slots.eyes).toBe('eyes_cyber_blue');
      expect(a.slots.shirt).toBe('jacket_neon_bomber');
      expect(a.slots.pants).toBe('pants_tactical');
      expect(a.slots.boots).toBe('boots_combat');
      expect(a.skinTexture).toBe('skin_01');
      expect(a.accessories).toEqual(['a']);
      expect(a.implants).toEqual(['neck_data_port']);
    });

    it('is idempotent on an already-migrated appearance and backfills colors', () => {
      const once = migrateAppearance({ bodyBase: 'body_male_white', skinTone: '#010203' });
      const twice = migrateAppearance(once);
      expect(twice.slots).toEqual(once.slots);
      expect(twice.colors.skin).toBe('#010203');
      expect(twice.colors.eyebrow).toBe(DEFAULT_COLORS.eyebrow); // backfilled
    });

    it('backfills a new-shape object whose subfields are undefined', () => {
      const a = migrateAppearance({
        slots: undefined, morphs: undefined, colors: undefined,
        skinTexture: undefined, accessories: 'nope',
      } as unknown);
      expect(a.slots).toEqual({});
      expect(a.morphs).toEqual({});
      expect(a.colors.skin).toBe(DEFAULT_COLORS.skin);
      expect(a.skinTexture).toBe('skin_01');
      expect(a.accessories).toEqual([]);
    });

    it('returns defaults for null/garbage input', () => {
      expect(migrateAppearance(null).bodyBase).toBe(DEFAULT_APPEARANCE.bodyBase);
      expect(migrateAppearance(42 as unknown).skinTexture).toBe('skin_01');
    });

    it('handles a partial legacy object without optional fields', () => {
      const a = migrateAppearance({ bodyBase: 'body_female_asian' });
      expect(a.slots).toEqual({});
      expect(a.accessories).toEqual([]);
      expect(a.colors.skin).toBe(DEFAULT_COLORS.skin);
    });
  });

  describe('resolveAvatarParts (modular composition)', () => {
    it('inherits bodyBase for every region when avatarPieces is empty', () => {
      const a: CharacterAppearance = { ...DEFAULT_APPEARANCE, bodyBase: 'suit', avatarPieces: {} };
      expect(resolveAvatarParts(a)).toEqual({ head: 'suit', top: 'suit', bottom: 'suit' });
    });

    it('uses per-region overrides and falls back to bodyBase for the rest', () => {
      const a: CharacterAppearance = {
        ...DEFAULT_APPEARANCE,
        bodyBase: 'punk',
        avatarPieces: { head: 'suit', bottom: 'adventurer' },
      };
      expect(resolveAvatarParts(a)).toEqual({ head: 'suit', top: 'punk', bottom: 'adventurer' });
    });

    it('treats null/empty-string overrides as inherit', () => {
      const a: CharacterAppearance = {
        ...DEFAULT_APPEARANCE,
        bodyBase: 'worker',
        avatarPieces: { head: null, top: '', bottom: 'king' },
      };
      expect(resolveAvatarParts(a)).toEqual({ head: 'worker', top: 'worker', bottom: 'king' });
    });

    it('a migrated legacy save renders the whole-outfit look (all = bodyBase)', () => {
      const a = migrateAppearance({ bodyBase: 'w_punk' });
      expect(resolveAvatarParts(a)).toEqual({ head: 'w_punk', top: 'w_punk', bottom: 'w_punk' });
    });
  });

  describe('applyArmorOverlay (Phase 15)', () => {
    it('overlays armor molds onto the chosen regions without mutating the base', () => {
      const base: CharacterAppearance = { ...DEFAULT_APPEARANCE, bodyBase: 'punk', avatarPieces: { head: 'suit' } };
      const out = applyArmorOverlay(base, { head: 'swat', top: 'swat' });
      // base regions: head suit / top punk(inherited); armor overrides head+top.
      expect(resolveAvatarParts(out)).toEqual({ head: 'swat', top: 'swat', bottom: 'punk' });
      // base is untouched
      expect(base.avatarPieces).toEqual({ head: 'suit' });
    });

    it('no armor parts returns an equivalent appearance', () => {
      const base: CharacterAppearance = { ...DEFAULT_APPEARANCE, bodyBase: 'suit', avatarPieces: {} };
      expect(resolveAvatarParts(applyArmorOverlay(base, {}))).toEqual({ head: 'suit', top: 'suit', bottom: 'suit' });
    });

    it('armored regions are flagged to keep their authored colours', () => {
      const base: CharacterAppearance = { ...DEFAULT_APPEARANCE, bodyBase: 'punk' };
      const out = applyArmorOverlay(base, { head: 'swat', bottom: 'swat' });
      expect(keepColorForRegion(out, 'head')).toBe(true);
      expect(keepColorForRegion(out, 'bottom')).toBe(true);
      expect(keepColorForRegion(out, 'top')).toBe(false); // not armored → recoloured as usual
      expect(keepColorForRegion(base, 'head')).toBe(false); // base untouched
    });
  });
});
