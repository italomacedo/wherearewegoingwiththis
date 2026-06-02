import {
  CombatTuning, DEFAULT_COMBAT_TUNING, combatTuningFromSettings,
  actionPointsFor, moveApCost, maxMoveMeters,
  attackValue, dodgeValue, resolveAttack,
  rollDamage, rollWeaponDamage, FIST_PROFILE, WeaponProfile, initiativeOrder,
  MELEE_RANGE, FLEE_MIN_DISTANCE, COVER_NONE, COVER_PARTIAL, COVER_FULL,
  MELEE_BASE, RANGED_BASE,
  distance2, straightLinePath, truncatePath, centroidOf,
} from '@systems/combat/CombatMath';
import { CharacterStats, createDefaultStats } from '@entities/CharacterStats';

/** Deterministic RNG returning the queued [0,1) values, then 0. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
};

/** A stats sheet with explicit attribute/skill overrides. */
function sheet(over: Partial<{ forca: number; destreza: number; melee: number; firearms: number; perception: number }> = {}): CharacterStats {
  const s = createDefaultStats();
  if (over.forca !== undefined) s.attributes.forca = over.forca;
  if (over.destreza !== undefined) s.attributes.destreza = over.destreza;
  if (over.melee !== undefined) s.skills.combate_corpo_a_corpo = over.melee;
  if (over.firearms !== undefined) s.skills.armas_de_fogo = over.firearms;
  if (over.perception !== undefined) s.skills.percepcao = over.perception;
  return s;
}

describe('actionPointsFor', () => {
  it('minimum Dexterity (20) yields 2 AP — one primary action and nothing else', () => {
    expect(actionPointsFor(20)).toBe(2);
  });
  it('honours Dexterity 60 → 6 AP and 100 → 10 AP', () => {
    expect(actionPointsFor(60)).toBe(6);
    expect(actionPointsFor(100)).toBe(10);
  });
  it('rounds to the nearest AP', () => {
    expect(actionPointsFor(34)).toBe(3); // 3.4 → 3
    expect(actionPointsFor(35)).toBe(4); // 3.5 → 4 (round half up)
  });
  it('clamps negatives to 0 and caps at apMax', () => {
    expect(actionPointsFor(-50)).toBe(0);
    expect(actionPointsFor(999)).toBe(DEFAULT_COMBAT_TUNING.apMax);
  });
  it('respects a custom divisor', () => {
    const t: CombatTuning = { ...DEFAULT_COMBAT_TUNING, apPerDexterity: 20 };
    expect(actionPointsFor(60, t)).toBe(3);
  });
});

describe('movement cost', () => {
  it('costs moveApPerMeter AP per metre (rounded up; default 0.5 = 1 AP per 2 m)', () => {
    expect(moveApCost(3)).toBe(2); // ceil(3 * 0.5) = 2
    expect(moveApCost(2.4)).toBe(2); // ceil(1.2) = 2
    expect(moveApCost(4)).toBe(2); // ceil(2) = 2 → 1 AP moves 2 m
    expect(moveApCost(0)).toBe(0);
    expect(moveApCost(-5)).toBe(0);
  });
  it('scales with a costlier movement setting', () => {
    const t: CombatTuning = { ...DEFAULT_COMBAT_TUNING, moveApPerMeter: 2 };
    expect(moveApCost(3, t)).toBe(6);
  });
  it('maxMoveMeters is the whole metres affordable with the AP', () => {
    expect(maxMoveMeters(6)).toBe(12); // 6 AP / 0.5 AP per m = 12 m
    const t: CombatTuning = { ...DEFAULT_COMBAT_TUNING, moveApPerMeter: 2 };
    expect(maxMoveMeters(5, t)).toBe(2);
  });
  it('maxMoveMeters guards a zero/negative movement cost', () => {
    const t: CombatTuning = { ...DEFAULT_COMBAT_TUNING, moveApPerMeter: 0 };
    expect(maxMoveMeters(6, t)).toBe(0);
    expect(maxMoveMeters(-3)).toBe(0);
  });
});

describe('combatTuningFromSettings', () => {
  it('maps the persisted settings, keeping apMax fixed', () => {
    const t = combatTuningFromSettings({
      combatApPerDexterity: 5, combatPrimaryCost: 3, combatSecondaryCost: 2, combatMoveApPerMeter: 2,
    });
    expect(t).toEqual({ apPerDexterity: 5, apMax: DEFAULT_COMBAT_TUNING.apMax, primaryCost: 3, secondaryCost: 2, moveApPerMeter: 2 });
  });
  it('falls back to the default divisor when given a non-positive value', () => {
    const t = combatTuningFromSettings({
      combatApPerDexterity: 0, combatPrimaryCost: 2, combatSecondaryCost: 1, combatMoveApPerMeter: 1,
    });
    expect(t.apPerDexterity).toBe(DEFAULT_COMBAT_TUNING.apPerDexterity);
  });
});

describe('attackValue / dodgeValue', () => {
  it('melee uses Combate Corpo-a-Corpo (a Força skill)', () => {
    expect(attackValue(sheet({ melee: 55 }), 'melee')).toBe(55);
  });
  it('ranged uses Armas de Fogo (a Destreza skill)', () => {
    expect(attackValue(sheet({ firearms: 70 }), 'ranged')).toBe(70);
  });
  it('dodge uses Percepção', () => {
    expect(dodgeValue(sheet({ perception: 42 }))).toBe(42);
  });
});

describe('resolveAttack', () => {
  it('a strong attacker vs a weak dodger almost always hits', () => {
    const r = resolveAttack(
      { attacker: sheet({ firearms: 80 }), defender: sheet({ perception: 20 }), kind: 'ranged' },
      seq(0.5),
    );
    expect(r.probability).toBeGreaterThan(0.9);
    expect(r.success).toBe(true);
  });
  it('full cover sharply lowers the hit chance vs partial vs none', () => {
    const atk = sheet({ firearms: 50 });
    const def = sheet({ perception: 50 });
    const none = resolveAttack({ attacker: atk, defender: def, kind: 'ranged', coverMod: COVER_NONE }, seq(0.99));
    const partial = resolveAttack({ attacker: atk, defender: def, kind: 'ranged', coverMod: COVER_PARTIAL }, seq(0.99));
    const full = resolveAttack({ attacker: atk, defender: def, kind: 'ranged', coverMod: COVER_FULL }, seq(0.99));
    expect(none.probability).toBeGreaterThan(partial.probability);
    expect(partial.probability).toBeGreaterThan(full.probability);
    expect(none.probability).toBeCloseTo(0.5, 5); // 50 vs 50
  });
  it('treats missing coverMod as no cover', () => {
    const r = resolveAttack({ attacker: sheet({ melee: 50 }), defender: sheet({ perception: 50 }), kind: 'melee' }, seq(0.4));
    expect(r.defender).toBe(50);
  });
  it('uses the default RNG when none is injected', () => {
    const r = resolveAttack({ attacker: sheet({ firearms: 60 }), defender: sheet({ perception: 30 }), kind: 'ranged' });
    expect(r.roll).toBeGreaterThanOrEqual(0);
    expect(r.roll).toBeLessThan(100);
  });
});

describe('rollDamage', () => {
  it('melee = base + Força/10 + variance', () => {
    expect(rollDamage(sheet({ forca: 60 }), 'melee', seq(0))).toBe(MELEE_BASE + 6 + 0);
    expect(rollDamage(sheet({ forca: 60 }), 'melee', seq(0.99))).toBe(MELEE_BASE + 6 + 4);
  });
  it('ranged = base + Destreza/20 + variance', () => {
    expect(rollDamage(sheet({ destreza: 80 }), 'ranged', seq(0))).toBe(RANGED_BASE + 4 + 0);
  });
  it('uses the default RNG when none is injected (damage in a sane range)', () => {
    const dmg = rollDamage(sheet({ forca: 20 }), 'melee');
    expect(dmg).toBeGreaterThanOrEqual(MELEE_BASE + 2);
    expect(dmg).toBeLessThanOrEqual(MELEE_BASE + 2 + 4);
  });
});

describe('rollWeaponDamage', () => {
  it('the fist profile reproduces the legacy melee constants exactly', () => {
    const stats = sheet({ forca: 60 });
    expect(rollWeaponDamage(stats, FIST_PROFILE, seq(0))).toBe(rollDamage(stats, 'melee', seq(0)));
    expect(rollWeaponDamage(stats, FIST_PROFILE, seq(0.99))).toBe(rollDamage(stats, 'melee', seq(0.99)));
  });

  it('a melee weapon adds its damageBase + Força/10 + variance', () => {
    const knife: WeaponProfile = { attackKind: 'melee', damageBase: 12, variance: 6, range: 1 };
    expect(rollWeaponDamage(sheet({ forca: 50 }), knife, seq(0))).toBe(12 + 5 + 0);
    expect(rollWeaponDamage(sheet({ forca: 50 }), knife, seq(0.99))).toBe(12 + 5 + 5); // floor(0.99*6)=5
  });

  it('a ranged profile scales with Destreza/20', () => {
    const gun: WeaponProfile = { attackKind: 'ranged', damageBase: 10, variance: 4, range: 12 };
    expect(rollWeaponDamage(sheet({ destreza: 80 }), gun, seq(0))).toBe(10 + 4 + 0);
  });

  it('guards a zero-variance profile (no divide-by-zero / NaN)', () => {
    const blunt: WeaponProfile = { attackKind: 'melee', damageBase: 9, variance: 0, range: 1 };
    expect(rollWeaponDamage(sheet({ forca: 20 }), blunt, seq(0.5))).toBe(9 + 2 + 0);
  });

  it('uses the default RNG when none is injected', () => {
    const dmg = rollWeaponDamage(sheet({ forca: 20 }), FIST_PROFILE);
    expect(dmg).toBeGreaterThanOrEqual(MELEE_BASE + 2);
  });
});

describe('initiativeOrder', () => {
  it('orders by Dexterity descending', () => {
    expect(initiativeOrder([
      { id: 'a', dexterity: 20 }, { id: 'b', dexterity: 80 }, { id: 'c', dexterity: 50 },
    ])).toEqual(['b', 'c', 'a']);
  });
  it('breaks ties deterministically by id', () => {
    expect(initiativeOrder([
      { id: 'zara', dexterity: 50 }, { id: 'mback', dexterity: 50 },
    ])).toEqual(['mback', 'zara']);
  });
});

describe('constants', () => {
  it('exposes melee range, flee distance and cover tiers', () => {
    expect(MELEE_RANGE).toBe(1);
    expect(FLEE_MIN_DISTANCE).toBe(10);
    expect(COVER_NONE).toBe(0);
    expect(COVER_PARTIAL).toBe(20);
    expect(COVER_FULL).toBe(40);
  });
});

describe('ground geometry', () => {
  it('distance2 is the Euclidean distance', () => {
    expect(distance2({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(distance2({ x: 1, z: 1 }, { x: 1, z: 1 })).toBe(0);
  });

  it('straightLinePath is a two-point segment with the Euclidean length', () => {
    const p = straightLinePath({ x: 0, z: 0 }, { x: 0, z: 6 });
    expect(p).toEqual({ points: [{ x: 0, z: 0 }, { x: 0, z: 6 }], meters: 6 });
  });

  it('centroidOf averages the points (origin when empty)', () => {
    expect(centroidOf([{ x: 0, z: 0 }, { x: 4, z: 2 }])).toEqual({ x: 2, z: 1 });
    expect(centroidOf([])).toEqual({ x: 0, z: 0 });
  });
});

describe('truncatePath', () => {
  const path = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }]; // length 4 + 4 = 8

  it('returns the whole path end when the budget covers it', () => {
    expect(truncatePath(path, 100)).toEqual({ point: { x: 4, z: 4 }, meters: 8 });
  });

  it('stops partway along a segment when the budget runs out', () => {
    // 4 m down the first leg, then 2 m up the second → (4, 2)
    expect(truncatePath(path, 6)).toEqual({ point: { x: 4, z: 2 }, meters: 6 });
  });

  it('handles zero/negative budgets, single-point and empty paths', () => {
    expect(truncatePath(path, 0)).toEqual({ point: { x: 0, z: 0 }, meters: 0 });
    expect(truncatePath([{ x: 2, z: 3 }], 5)).toEqual({ point: { x: 2, z: 3 }, meters: 0 });
    expect(truncatePath([], 5)).toEqual({ point: { x: 0, z: 0 }, meters: 0 });
  });

  it('skips zero-length segments without stalling', () => {
    const dup = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 3, z: 0 }];
    expect(truncatePath(dup, 2)).toEqual({ point: { x: 2, z: 0 }, meters: 2 });
  });
});
