import {
  CombatEncounter, CombatantInit, DEFAULT_INITIAL_DISTANCE, MAX_DISTANCE,
} from '@systems/combat/CombatEncounter';
import { COVER_PARTIAL, COVER_FULL, MELEE_RANGE } from '@systems/combat/CombatMath';
import { createDefaultStats, CharacterStats } from '@entities/CharacterStats';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
};

function stats(over: Partial<{ destreza: number; forca: number; firearms: number; melee: number; perception: number }> = {}): CharacterStats {
  const s = createDefaultStats();
  if (over.destreza !== undefined) s.attributes.destreza = over.destreza;
  if (over.forca !== undefined) s.attributes.forca = over.forca;
  if (over.firearms !== undefined) s.skills.armas_de_fogo = over.firearms;
  if (over.melee !== undefined) s.skills.combate_corpo_a_corpo = over.melee;
  if (over.perception !== undefined) s.skills.percepcao = over.perception;
  return s;
}

function makeCombatants(over: { player?: Partial<CharacterStats>; enemyDex?: number } = {}): CombatantInit[] {
  return [
    { id: 'player', name: 'Hero', isPlayer: true, stats: stats({ destreza: 60, firearms: 80, melee: 80 }), health: { current: 100, max: 100 } },
    { id: 'zara', name: 'Zara', isPlayer: false, stats: stats({ destreza: over.enemyDex ?? 40, perception: 20 }), health: { current: 30, max: 100 } },
  ];
}

describe('CombatEncounter — setup', () => {
  it('throws unless exactly two combatants', () => {
    expect(() => new CombatEncounter([])).toThrow();
    expect(() => new CombatEncounter([makeCombatants()[0]!])).toThrow();
  });

  it('orders initiative by Dexterity and starts the fastest with a full AP pool', () => {
    const enc = new CombatEncounter(makeCombatants({ enemyDex: 40 }));
    expect(enc.activeId()).toBe('player'); // 60 > 40
    expect(enc.apOf('player')).toBe(6);    // round(60/10)
    expect(enc.getDistance()).toBe(DEFAULT_INITIAL_DISTANCE);
    expect(enc.getOutcome()).toBe('ongoing');
  });

  it('clamps the initial distance', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 999 });
    expect(enc.getDistance()).toBe(MAX_DISTANCE);
  });

  it('isAlive / apOf / coverOf answer for known ids and default for unknown ones', () => {
    const enc = new CombatEncounter(makeCombatants());
    expect(enc.isAlive('player')).toBe(true);
    expect(enc.isAlive('ghost')).toBe(false);   // unknown id → not alive
    expect(enc.apOf('ghost')).toBe(0);
    expect(enc.coverOf('ghost')).toBe(0);
  });

  it('getState reports both combatants', () => {
    const st = new CombatEncounter(makeCombatants()).getState();
    expect(st.combatants.map((c) => c.id)).toEqual(['player', 'zara']);
    expect(st.combatants[0]).toMatchObject({ isPlayer: true, maxAp: 6, alive: true });
  });
});

describe('CombatEncounter — AP economy', () => {
  it('rejects an action when AP is insufficient', () => {
    // enemy Dex 20 → 2 AP; first attack spends 2, second has none.
    const c = makeCombatants();
    c[0]!.stats.attributes.destreza = 20; // player slowest now → enemy acts? no, tie-break by id
    const enc = new CombatEncounter([
      { ...c[0]!, stats: stats({ destreza: 20, firearms: 80 }) },
      { ...c[1]!, stats: stats({ destreza: 10, perception: 20 }) },
    ], { rng: seq(0, 0) });
    expect(enc.apOf('player')).toBe(2);
    enc.apply({ type: 'attack', attackKind: 'ranged' }); // spends 2
    const rej = enc.apply({ type: 'cover' });
    expect(rej.kind).toBe('rejected');
    expect(rej.reason).toBe('out_of_ap');
  });

  it('end_turn refills the next combatant AP and switches active', () => {
    const enc = new CombatEncounter(makeCombatants({ enemyDex: 40 }));
    enc.apply({ type: 'end_turn' });
    expect(enc.activeId()).toBe('zara');
    expect(enc.apOf('zara')).toBe(4); // round(40/10)
  });
});

describe('CombatEncounter — movement & cover', () => {
  it('moving toward closes the distance and costs 1 AP/m by default', () => {
    const enc = new CombatEncounter(makeCombatants());
    const ev = enc.apply({ type: 'move', meters: 4 });
    expect(ev.kind).toBe('move');
    expect(enc.getDistance()).toBe(DEFAULT_INITIAL_DISTANCE - 4);
    expect(enc.apOf('player')).toBe(6 - 4);
  });

  it('retreating opens the distance', () => {
    const enc = new CombatEncounter(makeCombatants());
    enc.apply({ type: 'move', meters: 2, toward: false });
    expect(enc.getDistance()).toBe(DEFAULT_INITIAL_DISTANCE + 2);
  });

  it('rejects a non-positive move', () => {
    const enc = new CombatEncounter(makeCombatants());
    const ev = enc.apply({ type: 'move', meters: 0 });
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('invalid');
  });

  it('take cover sets partial defence; hunker sets full', () => {
    const enc = new CombatEncounter(makeCombatants());
    enc.apply({ type: 'cover' });
    expect(enc.coverOf('player')).toBe(COVER_PARTIAL);
    enc.apply({ type: 'hunker' });
    expect(enc.coverOf('player')).toBe(COVER_FULL);
  });

  it('moving breaks the actor cover', () => {
    const enc = new CombatEncounter(makeCombatants());
    enc.apply({ type: 'cover' });
    enc.apply({ type: 'move', meters: 1 });
    expect(enc.coverOf('player')).toBe(0);
  });

  it('cover resets at the start of the actor next turn', () => {
    const enc = new CombatEncounter(makeCombatants({ enemyDex: 40 }));
    enc.apply({ type: 'cover' });
    expect(enc.coverOf('player')).toBe(COVER_PARTIAL);
    enc.apply({ type: 'end_turn' });   // → zara
    enc.apply({ type: 'end_turn' });   // → player again
    expect(enc.coverOf('player')).toBe(0);
  });

  it('reload spends a secondary AP (no ammo model yet)', () => {
    const enc = new CombatEncounter(makeCombatants());
    const ev = enc.apply({ type: 'reload' });
    expect(ev.kind).toBe('reload');
    expect(enc.apOf('player')).toBe(5);
  });
});

describe('CombatEncounter — attacks', () => {
  it('a ranged hit deals damage; getState reflects the HP loss', () => {
    const enc = new CombatEncounter(makeCombatants(), { rng: seq(0, 0) }); // hit, min damage
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('hit');
    expect(ev.damage).toBeGreaterThan(0);
    const zara = enc.getState().combatants.find((c) => c.id === 'zara')!;
    expect(zara.hp.current).toBeLessThan(30);
  });

  it('attack events carry the to-hit probability and the attack kind', () => {
    const enc = new CombatEncounter(makeCombatants(), { rng: seq(0, 0) });
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('hit');
    expect(ev.attackKind).toBe('ranged');
    expect(ev.probability).toBeGreaterThan(0);
    expect(ev.probability).toBeLessThanOrEqual(1);
  });

  it('a miss deals no damage', () => {
    // weak attacker, defended target, high roll → miss
    const c: CombatantInit[] = [
      { id: 'player', name: 'Hero', isPlayer: true, stats: stats({ destreza: 60, firearms: 10 }), health: { current: 100, max: 100 } },
      { id: 'zara', name: 'Zara', isPlayer: false, stats: stats({ destreza: 40, perception: 90 }), health: { current: 30, max: 100 } },
    ];
    const enc = new CombatEncounter(c, { rng: seq(0.99) });
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('miss');
    expect(enc.getState().combatants.find((x) => x.id === 'zara')!.hp.current).toBe(30);
  });

  it('melee is rejected when out of range, allowed once closed', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 5, rng: seq(0, 0) });
    const tooFar = enc.apply({ type: 'attack', attackKind: 'melee' });
    expect(tooFar.kind).toBe('rejected');
    expect(tooFar.reason).toBe('too_far');
    enc.apply({ type: 'move', meters: 4 }); // distance 1 ≤ MELEE_RANGE
    expect(enc.getDistance()).toBeLessThanOrEqual(MELEE_RANGE);
    const ok = enc.apply({ type: 'attack', attackKind: 'melee' });
    expect(ok.kind).toBe('hit');
  });

  it('defaults to a ranged attack when no kind is given', () => {
    const enc = new CombatEncounter(makeCombatants(), { rng: seq(0, 0) });
    const ev = enc.apply({ type: 'attack' });
    expect(ev.kind).toBe('hit');
  });

  it('a lethal hit ends the encounter as player_won', () => {
    const c = makeCombatants();
    c[1]!.health = { current: 5, max: 100 }; // one hit kills
    const enc = new CombatEncounter(c, { rng: seq(0, 0.99) }); // hit + max variance
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('death');
    expect(enc.getOutcome()).toBe('player_won');
    expect(enc.isOver()).toBe(true);
  });

  it('the enemy killing the player ends as player_lost', () => {
    const c: CombatantInit[] = [
      { id: 'player', name: 'Hero', isPlayer: true, stats: stats({ destreza: 20, perception: 10 }), health: { current: 3, max: 100 } },
      { id: 'zara', name: 'Zara', isPlayer: false, stats: stats({ destreza: 90, firearms: 90 }), health: { current: 100, max: 100 } },
    ];
    const enc = new CombatEncounter(c, { rng: seq(0, 0.99) });
    expect(enc.activeId()).toBe('zara'); // 90 > 20
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('death');
    expect(enc.getOutcome()).toBe('player_lost');
  });
});

describe('CombatEncounter — flee & guards', () => {
  it('flee ends the encounter as fled', () => {
    const enc = new CombatEncounter(makeCombatants());
    const ev = enc.apply({ type: 'flee' });
    expect(ev.kind).toBe('flee');
    expect(enc.getOutcome()).toBe('fled');
  });

  it('rejects any action once the encounter is over', () => {
    const enc = new CombatEncounter(makeCombatants());
    enc.apply({ type: 'flee' });
    const ev = enc.apply({ type: 'attack' });
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('over');
  });

  it('advance is a no-op once over (end_turn after flee keeps outcome)', () => {
    const enc = new CombatEncounter(makeCombatants());
    enc.apply({ type: 'flee' });
    const ev = enc.apply({ type: 'end_turn' });
    expect(ev.kind).toBe('rejected');
    expect(enc.getOutcome()).toBe('fled');
  });
});
