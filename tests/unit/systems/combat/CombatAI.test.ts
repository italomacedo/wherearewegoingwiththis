import { chooseCombatAction, prefersMelee, AI_LOW_HP, CombatAIView } from '@systems/combat/CombatAI';
import { DEFAULT_COMBAT_TUNING, MELEE_RANGE } from '@systems/combat/CombatMath';
import { createDefaultStats, CharacterStats } from '@entities/CharacterStats';

function stats(over: Partial<{ melee: number; firearms: number }> = {}): CharacterStats {
  const s = createDefaultStats();
  if (over.melee !== undefined) s.skills.combate_corpo_a_corpo = over.melee;
  if (over.firearms !== undefined) s.skills.armas_de_fogo = over.firearms;
  return s;
}

const base = (over: Partial<CombatAIView> = {}): CombatAIView => ({
  ap: 6, distance: 6, hpFraction: 1, cover: 0, prefersMelee: false, ...over,
});

describe('prefersMelee', () => {
  it('true when melee skill beats firearms, else false (ties → ranged)', () => {
    expect(prefersMelee(stats({ melee: 70, firearms: 40 }))).toBe(true);
    expect(prefersMelee(stats({ melee: 40, firearms: 70 }))).toBe(false);
    expect(prefersMelee(stats({ melee: 50, firearms: 50 }))).toBe(false);
  });
});

describe('chooseCombatAction — defensive', () => {
  it('takes cover when hurt and exposed', () => {
    expect(chooseCombatAction(base({ hpFraction: AI_LOW_HP, cover: 0 }))).toEqual({ type: 'cover' });
  });
  it('does not re-cover when already in cover (fights on)', () => {
    const a = chooseCombatAction(base({ hpFraction: 0.2, cover: 20 }));
    expect(a.type).toBe('attack');
  });
  it('does not take cover when it cannot afford the secondary', () => {
    // ranged, hurt, 0 AP → end_turn (no cover possible)
    expect(chooseCombatAction(base({ hpFraction: 0.2, ap: 0 }))).toEqual({ type: 'end_turn' });
  });
});

describe('chooseCombatAction — gunner (ranged)', () => {
  it('shoots while AP allows', () => {
    expect(chooseCombatAction(base({ prefersMelee: false, ap: 6 }))).toEqual({ type: 'attack', attackKind: 'ranged' });
  });
  it('spends leftover AP on cover, else ends', () => {
    expect(chooseCombatAction(base({ ap: 1 }))).toEqual({ type: 'cover' });
    expect(chooseCombatAction(base({ ap: 1, cover: 20 }))).toEqual({ type: 'end_turn' });
    expect(chooseCombatAction(base({ ap: 0 }))).toEqual({ type: 'end_turn' });
  });
});

describe('chooseCombatAction — brawler (melee)', () => {
  it('advances toward the target when out of range (controller routes the path)', () => {
    // distance 6, can afford ≥1 m of movement → abstract "move toward target".
    const a = chooseCombatAction(base({ prefersMelee: true, distance: 6, ap: 6 }));
    expect(a.type).toBe('move');
    expect(a.attackKind).toBe('melee');
  });
  it('strikes when already in range', () => {
    expect(chooseCombatAction(base({ prefersMelee: true, distance: MELEE_RANGE, ap: 6 })))
      .toEqual({ type: 'attack', attackKind: 'melee' });
  });
  it('ends the turn when it cannot move or strike', () => {
    // far away, only 0 AP → cannot afford even 1 m
    expect(chooseCombatAction(base({ prefersMelee: true, distance: 10, ap: 0 }))).toEqual({ type: 'end_turn' });
  });
  it('in range but cannot afford a strike → end_turn', () => {
    expect(chooseCombatAction(base({ prefersMelee: true, distance: 1, ap: 1 }))).toEqual({ type: 'end_turn' });
  });
  it('moves toward when it can afford at least one metre', () => {
    const a = chooseCombatAction(base({ prefersMelee: true, distance: 10, ap: 1 }));
    expect(a.type).toBe('move');
  });
  it('without a firearm, a gunner is forced into melee (close then strike)', () => {
    // prefersMelee false but hasFirearm false → behaves as a brawler.
    expect(chooseCombatAction(base({ prefersMelee: false, hasFirearm: false, distance: 1, ap: 6 })))
      .toEqual({ type: 'attack', attackKind: 'melee' });
    const far = chooseCombatAction(base({ prefersMelee: false, hasFirearm: false, distance: 6, ap: 6 }));
    expect(far.type).toBe('move');
  });

  it('without cover available, a hurt fighter does not take cover', () => {
    // hurt + exposed but hasCover false → no cover; melee-forced → strikes in range.
    expect(chooseCombatAction(base({ hpFraction: 0.2, hasCover: false, hasFirearm: false, distance: 1, ap: 6 })))
      .toEqual({ type: 'attack', attackKind: 'melee' });
  });

  it('honours a custom tuning (cannot afford a metre → end_turn)', () => {
    // moveApPerMeter 2, ap 1 → maxMoveMeters = 0 → no move possible.
    const a = chooseCombatAction(base({ prefersMelee: true, distance: 6, ap: 1, tuning: { ...DEFAULT_COMBAT_TUNING, moveApPerMeter: 2 } }));
    expect(a).toEqual({ type: 'end_turn' });
  });
});
