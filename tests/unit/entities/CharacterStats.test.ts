import {
  ATTRIBUTES, SKILLS, PERKS, PERK_TIERS,
  createDefaultStats, setPrimaryAttribute, isValidStartingSkills, allocateStartingSkills,
  applySkillUse, unlockedTierCount, pendingPerkSlots, canChoosePerk, choosePerk, choosePerkReplacing, checkValue,
  perksForTier, skillsForAttribute, toggleStartingSkill, startingSkillState,
  detectPerkPointGrants, grantPerkPoints, pickPerk, totalPerkPoints,
  type StartingSkillPick,
} from '../../../src/entities/CharacterStats';

describe('CharacterStats — registries', () => {
  it('has 4 attributes and 13 skills, each skill under a real attribute', () => {
    expect(ATTRIBUTES).toHaveLength(4);
    expect(SKILLS).toHaveLength(13);
    const attrIds = new Set(ATTRIBUTES.map((a) => a.id));
    expect(SKILLS.every((s) => attrIds.has(s.attribute))).toBe(true);
  });

  it('Inteligência holds the IT/Engineering/Medicine skills', () => {
    const intel = skillsForAttribute('inteligencia').map((s) => s.id);
    expect(intel).toEqual(expect.arrayContaining(['tecnologia_informacao', 'engenharia', 'medicina']));
  });

  it('has 5 tiers x 2 perks per attribute (40 unique perks)', () => {
    expect(PERKS).toHaveLength(40);
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(40);
    for (const a of ATTRIBUTES) {
      for (let t = 1; t <= PERK_TIERS; t++) {
        expect(perksForTier(a.id, t)).toHaveLength(2);
      }
    }
  });
});

describe('CharacterStats — creation', () => {
  it('default sheet: attributes 20, skills 10, no perks', () => {
    const s = createDefaultStats();
    expect(Object.values(s.attributes).every((v) => v === 20)).toBe(true);
    expect(Object.values(s.skills).every((v) => v === 10)).toBe(true);
    expect(s.perks).toEqual([]);
  });

  it('setPrimaryAttribute: chosen 30, others 20', () => {
    const s = setPrimaryAttribute(createDefaultStats(), 'destreza');
    expect(s.attributes.destreza).toBe(30);
    expect(s.attributes.forca).toBe(20);
  });

  it('validates the starting skill allocation (2 majors + 3 minors, distinct, real)', () => {
    expect(isValidStartingSkills(['armas_de_fogo', 'furtividade'], ['hacking_x', 'a', 'b'])).toBe(false); // unknown
    expect(isValidStartingSkills(['armas_de_fogo'], ['furtividade', 'medicina', 'comercio'])).toBe(false); // wrong major count
    expect(isValidStartingSkills(['armas_de_fogo', 'armas_de_fogo'], ['furtividade', 'medicina', 'comercio'])).toBe(false); // dup
    expect(isValidStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio'])).toBe(true);
  });

  it('allocateStartingSkills: majors 40, minors 20, rest 10', () => {
    const s = allocateStartingSkills(createDefaultStats(),
      ['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio']);
    expect(s.skills.armas_de_fogo).toBe(40);
    expect(s.skills.medicina).toBe(40);
    expect(s.skills.furtividade).toBe(20);
    expect(s.skills.comercio).toBe(20);
    expect(s.skills.atletismo).toBe(10);
  });
});

describe('CharacterStats — creator skill picker (toggleStartingSkill)', () => {
  const empty: StartingSkillPick = { majors: [], minors: [] };

  it('cycles base → minor → major → base', () => {
    let p = toggleStartingSkill(empty, 'armas_de_fogo');
    expect(startingSkillState(p, 'armas_de_fogo')).toBe('minor');
    p = toggleStartingSkill(p, 'armas_de_fogo');
    expect(startingSkillState(p, 'armas_de_fogo')).toBe('major');
    p = toggleStartingSkill(p, 'armas_de_fogo');
    expect(startingSkillState(p, 'armas_de_fogo')).toBe('base');
  });

  it('caps minors at 3: a 4th base skill cannot become minor (jumps toward major)', () => {
    let p: StartingSkillPick = { majors: [], minors: ['a', 'b', 'c'] };
    p = toggleStartingSkill(p, 'medicina'); // minors full → goes to major
    expect(startingSkillState(p, 'medicina')).toBe('major');
  });

  it('caps majors at 2: when both caps are full a new skill stays base', () => {
    const p = { majors: ['x', 'y'], minors: ['a', 'b', 'c'] };
    const next = toggleStartingSkill(p, 'medicina');
    expect(startingSkillState(next, 'medicina')).toBe('base');
  });

  it('minor → major is blocked when majors are full (drops to base)', () => {
    const p = { majors: ['x', 'y'], minors: ['medicina'] };
    const next = toggleStartingSkill(p, 'medicina');
    expect(startingSkillState(next, 'medicina')).toBe('base');
  });
});

describe('CharacterStats — learning by doing', () => {
  it('using a skill raises the skill and its parent attribute by 0.1% (x multiplier)', () => {
    const s = applySkillUse(createDefaultStats(), 'armas_de_fogo');
    expect(s.skills.armas_de_fogo).toBeCloseTo(10.1, 6);
    expect(s.attributes.destreza).toBeCloseTo(20.1, 6);
    const s3 = applySkillUse(createDefaultStats(), 'armas_de_fogo', 3);
    expect(s3.skills.armas_de_fogo).toBeCloseTo(10.3, 6);
  });

  it('caps at 100 and ignores unknown skills', () => {
    const base = createDefaultStats();
    base.skills.armas_de_fogo = 99.95;
    base.attributes.destreza = 100;
    const s = applySkillUse(base, 'armas_de_fogo', 10);
    expect(s.skills.armas_de_fogo).toBe(100);
    expect(s.attributes.destreza).toBe(100);
    expect(applySkillUse(base, 'nope')).toBe(base);
  });
});

describe('CharacterStats — perks', () => {
  it('unlockedTierCount steps every 20% (cap 5)', () => {
    expect(unlockedTierCount(19)).toBe(0);
    expect(unlockedTierCount(20)).toBe(1);
    expect(unlockedTierCount(41)).toBe(2);
    expect(unlockedTierCount(100)).toBe(5);
    expect(unlockedTierCount(250)).toBe(5);
  });

  it('a default sheet (all attrs 20%) has 4 tier-1 perk slots', () => {
    const slots = pendingPerkSlots(createDefaultStats());
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.tier === 1)).toBe(true);
  });

  it('choosePerk fills the slot; a second perk in the same (attr,tier) is blocked', () => {
    const [p1, p2] = perksForTier('forca', 1);
    let s = createDefaultStats();
    expect(canChoosePerk(s, p1!.id)).toBe(true);
    s = choosePerk(s, p1!.id);
    expect(s.perks).toContain(p1!.id);
    expect(canChoosePerk(s, p2!.id)).toBe(false); // tier-1 forca slot already filled
    expect(pendingPerkSlots(s).some((slot) => slot.attribute === 'forca' && slot.tier === 1)).toBe(false);
  });

  it('a tier is locked until the attribute reaches its threshold', () => {
    const s = createDefaultStats(); // forca 20 → only tier 1 unlocked
    const t2 = perksForTier('forca', 2)[0]!;
    expect(canChoosePerk(s, t2.id)).toBe(false);
    s.attributes.forca = 40; // now tier 2 unlocked
    expect(canChoosePerk(s, t2.id)).toBe(true);
  });

  it('choosePerk is a no-op for an invalid choice', () => {
    const s = createDefaultStats();
    expect(choosePerk(s, 'does_not_exist')).toBe(s);
  });

  it('choosePerkReplacing swaps the perk within a (attr,tier) slot', () => {
    const [p1, p2] = perksForTier('forca', 1);
    let s = choosePerkReplacing(createDefaultStats(), p1!.id);
    expect(s.perks).toEqual([p1!.id]);
    s = choosePerkReplacing(s, p2!.id); // swap to the other tier-1 forca perk
    expect(s.perks).toEqual([p2!.id]);
    expect(choosePerkReplacing(s, 'nope')).toBe(s); // unknown → no-op
  });
});

describe('CharacterStats — checkValue (skill fits → skill, else attribute)', () => {
  it('returns the skill value when a skill is given', () => {
    const s = allocateStartingSkills(createDefaultStats(), ['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio']);
    expect(checkValue(s, 'armas_de_fogo', 'destreza')).toBe(40);
  });
  it('falls back to the attribute when skill is null or unknown', () => {
    const s = setPrimaryAttribute(createDefaultStats(), 'destreza');
    expect(checkValue(s, null, 'destreza')).toBe(30);
    expect(checkValue(s, 'unknown_skill', 'destreza')).toBe(30);
  });
});

describe('CharacterStats — perk points (Phase 19)', () => {
  it('createDefaultStats has empty perkPoints', () => {
    const s = createDefaultStats();
    expect(s.perkPoints).toEqual({});
    expect(totalPerkPoints(s)).toBe(0);
  });

  it('detectPerkPointGrants: no grants when no threshold is crossed', () => {
    const before = createDefaultStats(); // forca=20
    const after = applySkillUse(before, 'combate_corpo_a_corpo'); // forca≈20.1
    expect(detectPerkPointGrants(before, after)).toEqual({});
  });

  it('detectPerkPointGrants: 1 grant when attribute crosses 40% (tier 2)', () => {
    const before = createDefaultStats();
    before.attributes.forca = 39.9;
    const after = { ...before, attributes: { ...before.attributes, forca: 40.1 } };
    const grants = detectPerkPointGrants(before, after);
    expect(grants.forca).toBe(1);
    expect(grants.destreza).toBeUndefined();
  });

  it('detectPerkPointGrants: grants multiple points when multiple thresholds crossed at once', () => {
    const before = createDefaultStats();
    before.attributes.forca = 39;
    const after = { ...before, attributes: { ...before.attributes, forca: 61 } };
    const grants = detectPerkPointGrants(before, after);
    expect(grants.forca).toBe(2); // crossed 40 and 60
  });

  it('detectPerkPointGrants: does not grant for the first threshold (tier 1 is free)', () => {
    const before = createDefaultStats();
    before.attributes.forca = 0;
    const after = { ...before, attributes: { ...before.attributes, forca: 20 } };
    expect(detectPerkPointGrants(before, after)).toEqual({});
  });

  it('grantPerkPoints adds to existing points and returns a new sheet', () => {
    const s = createDefaultStats();
    const s2 = grantPerkPoints(s, { forca: 1 });
    expect(s2.perkPoints.forca).toBe(1);
    const s3 = grantPerkPoints(s2, { forca: 1, destreza: 2 });
    expect(s3.perkPoints.forca).toBe(2);
    expect(s3.perkPoints.destreza).toBe(2);
    expect(grantPerkPoints(s, {})).toBe(s); // no-op if empty
  });

  it('pickPerk succeeds when tier unlocked and point available', () => {
    const [t2a] = perksForTier('forca', 2);
    let s = createDefaultStats();
    s.attributes.forca = 40; // tier 2 unlocked
    s = grantPerkPoints(s, { forca: 1 });
    const result = pickPerk(t2a!.id, s);
    expect(result).not.toBeNull();
    expect(result!.perks).toContain(t2a!.id);
    expect(result!.perkPoints.forca).toBe(0);
  });

  it('pickPerk: null when no point available', () => {
    const [t2a] = perksForTier('forca', 2);
    const s = createDefaultStats();
    s.attributes.forca = 40; // tier 2 unlocked but no points
    expect(pickPerk(t2a!.id, s)).toBeNull();
  });

  it('pickPerk: null when tier is locked', () => {
    const [t2a] = perksForTier('forca', 2);
    let s = createDefaultStats();
    s = grantPerkPoints(s, { forca: 1 }); // point but tier locked (forca=20)
    expect(pickPerk(t2a!.id, s)).toBeNull();
  });

  it('pickPerk: null when perk already chosen', () => {
    const [t2a] = perksForTier('forca', 2);
    let s = createDefaultStats();
    s.attributes.forca = 40;
    s = grantPerkPoints(s, { forca: 2 });
    s = pickPerk(t2a!.id, s)!;
    expect(pickPerk(t2a!.id, s)).toBeNull(); // already chosen
  });

  it('pickPerk: null when slot is already filled by another perk', () => {
    const [t2a, t2b] = perksForTier('forca', 2);
    let s = createDefaultStats();
    s.attributes.forca = 40;
    s = grantPerkPoints(s, { forca: 2 });
    s = pickPerk(t2a!.id, s)!;
    expect(pickPerk(t2b!.id, s)).toBeNull(); // slot filled by t2a
  });

  it('pickPerk: null for unknown perk id', () => {
    expect(pickPerk('does_not_exist', createDefaultStats())).toBeNull();
  });

  it('totalPerkPoints sums across all attributes', () => {
    let s = createDefaultStats();
    s = grantPerkPoints(s, { forca: 2, destreza: 1 });
    expect(totalPerkPoints(s)).toBe(3);
  });

  it('pickPerk handles stats with undefined perkPoints (legacy save)', () => {
    // A legacy save may not have perkPoints — the optional chain should not throw.
    const [t2a] = perksForTier('forca', 2);
    const s = createDefaultStats();
    s.attributes.forca = 40;
    // Simulate missing perkPoints field (legacy save)
    (s as unknown as { perkPoints: undefined }).perkPoints = undefined;
    expect(pickPerk(t2a!.id, s)).toBeNull(); // no points → null
  });

  it('totalPerkPoints handles undefined perkPoints', () => {
    const s = createDefaultStats();
    (s as unknown as { perkPoints: undefined }).perkPoints = undefined;
    expect(totalPerkPoints(s)).toBe(0);
  });

  it('totalPerkPoints skips undefined values within perkPoints', () => {
    // A perkPoints entry may be undefined (Partial<Record<...>>)
    const s = createDefaultStats();
    s.perkPoints = { forca: 2, destreza: undefined as unknown as number };
    expect(totalPerkPoints(s)).toBe(2);
  });

  it('grantPerkPoints works when attribute already has points', () => {
    let s = createDefaultStats();
    s = grantPerkPoints(s, { forca: 1 });
    s = grantPerkPoints(s, { forca: 2 }); // adds to existing
    expect(s.perkPoints.forca).toBe(3);
  });
});
