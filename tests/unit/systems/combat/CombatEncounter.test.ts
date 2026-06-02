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
  it('throws when fewer than two combatants', () => {
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

  it('seeds combatants spaced along a line; clamps the spacing', () => {
    const enc = new CombatEncounter(makeCombatants());
    expect(enc.posOf('player')).toEqual({ x: 0, z: 0 });
    expect(enc.posOf('zara')).toEqual({ x: DEFAULT_INITIAL_DISTANCE, z: 0 });
    const far = new CombatEncounter(makeCombatants(), { initialDistance: 999 });
    expect(far.getDistance()).toBe(MAX_DISTANCE);
  });

  it('honours an explicit starting position', () => {
    const c = makeCombatants();
    c[0]!.pos = { x: 2, z: -3 };
    c[1]!.pos = { x: 2, z: 1 };
    const enc = new CombatEncounter(c);
    expect(enc.posOf('player')).toEqual({ x: 2, z: -3 });
    expect(enc.getDistance()).toBe(4); // |(-3) - 1|
  });

  it('isAlive / apOf / coverOf answer for known ids and default for unknown ones', () => {
    const enc = new CombatEncounter(makeCombatants());
    expect(enc.isAlive('player')).toBe(true);
    expect(enc.isAlive('ghost')).toBe(false);   // unknown id → not alive
    expect(enc.apOf('ghost')).toBe(0);
    expect(enc.coverOf('ghost')).toBe(0);
  });

  it('getState reports both combatants with their positions', () => {
    const st = new CombatEncounter(makeCombatants()).getState();
    expect(st.combatants.map((c) => c.id)).toEqual(['player', 'zara']);
    expect(st.combatants[0]).toMatchObject({ isPlayer: true, maxAp: 6, alive: true, pos: { x: 0, z: 0 } });
  });
});

describe('CombatEncounter — distance & targeting helpers', () => {
  it('nearest foe / distance ignore the actor and dead combatants', () => {
    const enc = new CombatEncounter(makeCombatants());
    expect(enc.nearestFoeId('player')).toBe('zara');
    expect(enc.distanceToNearestFoe('player')).toBe(DEFAULT_INITIAL_DISTANCE);
    expect(enc.nearestFoeId('ghost')).toBeNull();
    expect(enc.distanceToNearestFoe('ghost')).toBe(Infinity);
  });

  it('reachableToward stops a melee-step short of the target, capped by AP', () => {
    const enc = new CombatEncounter(makeCombatants()); // dist 6, player 6 AP
    const reach = enc.reachableToward('player', 'zara');
    expect(reach).not.toBeNull();
    // budget = min(maxMoveMeters(6 AP)=12, 6 - MELEE_RANGE=5) = 5 → ends at x=5,
    // cost = ceil(5 * 0.5 AP/m) = 3
    expect(reach!.to).toEqual({ x: 5, z: 0 });
    expect(reach!.cost).toBe(3);
  });

  it('reachableToward returns null when already within melee range or unknown ids', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 1 });
    expect(enc.reachableToward('player', 'zara')).toBeNull();
    expect(enc.reachableToward('player', 'ghost')).toBeNull();
  });

  it('reachableToward reserves AP for a follow-up strike', () => {
    const enc = new CombatEncounter(makeCombatants()); // 6 AP
    const reach = enc.reachableToward('player', 'zara', 5); // reserve 5 AP → only 1 AP to move
    // budget = min(maxMoveMeters(1 AP)=2, 5) = 2 → ends at x=2, cost = ceil(2 * 0.5) = 1
    expect(reach!.to).toEqual({ x: 2, z: 0 });
    expect(reach!.cost).toBe(1);
  });
});

describe('CombatEncounter — AP economy', () => {
  it('rejects an action when AP is insufficient', () => {
    const c = makeCombatants();
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

  it('rejects an attack when AP cannot pay the primary cost', () => {
    const c = makeCombatants();
    const enc = new CombatEncounter([
      { ...c[0]!, stats: stats({ destreza: 20, firearms: 80 }) }, // 2 AP
      { ...c[1]!, stats: stats({ destreza: 10, perception: 20 }) },
    ], { rng: seq(0, 0) });
    enc.apply({ type: 'attack', attackKind: 'ranged' }); // spends 2 → 0
    const rej = enc.apply({ type: 'attack', attackKind: 'ranged' });
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
  it('moving to a point updates the position and costs 0.5 AP/m of the routed path', () => {
    const enc = new CombatEncounter(makeCombatants());
    const ev = enc.apply({ type: 'move', to: { x: 4, z: 0 } });
    expect(ev.kind).toBe('move');
    expect(ev.meters).toBe(4);
    expect(ev.path).toEqual([{ x: 0, z: 0 }, { x: 4, z: 0 }]);
    expect(enc.posOf('player')).toEqual({ x: 4, z: 0 });
    expect(enc.getDistance()).toBe(2); // to zara at x=6
    expect(enc.apOf('player')).toBe(6 - 2); // ceil(4 m * 0.5 AP/m) = 2 AP
  });

  it('rejects a move with no destination or zero length', () => {
    const enc = new CombatEncounter(makeCombatants());
    expect(enc.apply({ type: 'move' }).reason).toBe('invalid');
    expect(enc.apply({ type: 'move', to: { x: 0, z: 0 } }).reason).toBe('invalid');
  });

  it('rejects a move that costs more AP than available', () => {
    const enc = new CombatEncounter(makeCombatants()); // 6 AP
    const ev = enc.apply({ type: 'move', to: { x: 15, z: 0 } }); // 15 m → ceil(7.5)=8 AP > 6
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('out_of_ap');
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
    enc.apply({ type: 'move', to: { x: 1, z: 0 } });
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
    const c: CombatantInit[] = [
      { id: 'player', name: 'Hero', isPlayer: true, stats: stats({ destreza: 60, firearms: 10 }), health: { current: 100, max: 100 } },
      { id: 'zara', name: 'Zara', isPlayer: false, stats: stats({ destreza: 40, perception: 90 }), health: { current: 30, max: 100 } },
    ];
    const enc = new CombatEncounter(c, { rng: seq(0.99) });
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' });
    expect(ev.kind).toBe('miss');
    expect(enc.getState().combatants.find((x) => x.id === 'zara')!.hp.current).toBe(30);
  });

  it('targets the named combatant; rejects an unknown/dead target', () => {
    const enc = new CombatEncounter(makeCombatants(), { rng: seq(0, 0) });
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged', targetId: 'zara' });
    expect(ev.targetId).toBe('zara');
    const bad = enc.apply({ type: 'attack', attackKind: 'ranged', targetId: 'ghost' });
    expect(bad.kind).toBe('rejected');
    expect(bad.reason).toBe('invalid');
  });

  it('melee is rejected when out of range, allowed once closed', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 5, rng: seq(0, 0) });
    const tooFar = enc.apply({ type: 'attack', attackKind: 'melee' });
    expect(tooFar.kind).toBe('rejected');
    expect(tooFar.reason).toBe('too_far');
    enc.apply({ type: 'move', to: { x: 4, z: 0 } }); // distance 1 ≤ MELEE_RANGE
    expect(enc.getDistance()).toBeLessThanOrEqual(MELEE_RANGE);
    const ok = enc.apply({ type: 'attack', attackKind: 'melee' });
    expect(ok.kind).toBe('hit');
  });

  it('defaults to a ranged attack on the lone opponent when no kind/target given', () => {
    const enc = new CombatEncounter(makeCombatants(), { rng: seq(0, 0) });
    const ev = enc.apply({ type: 'attack' });
    expect(ev.kind).toBe('hit');
    expect(ev.targetId).toBe('zara');
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
  it('flee ends the encounter as fled when the nearest foe is far enough', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 12 });
    const ev = enc.apply({ type: 'flee' });
    expect(ev.kind).toBe('flee');
    expect(enc.getOutcome()).toBe('fled');
  });

  it('flee is rejected when a foe is within the flee distance', () => {
    const enc = new CombatEncounter(makeCombatants()); // dist 6 ≤ 10
    const ev = enc.apply({ type: 'flee' });
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('too_close');
    expect(enc.getOutcome()).toBe('ongoing');
  });

  it('rejects any action once the encounter is over', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 12 });
    enc.apply({ type: 'flee' });
    const ev = enc.apply({ type: 'attack' });
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('over');
  });

  it('advance is a no-op once over (end_turn after flee keeps outcome)', () => {
    const enc = new CombatEncounter(makeCombatants(), { initialDistance: 12 });
    enc.apply({ type: 'flee' });
    const ev = enc.apply({ type: 'end_turn' });
    expect(ev.kind).toBe('rejected');
    expect(enc.getOutcome()).toBe('fled');
  });
});

describe('CombatEncounter — sides & N-way (8B)', () => {
  function mk(id: string, isPlayer: boolean, side: string, over: { dex?: number; hp?: number; pos?: { x: number; z: number } } = {}): CombatantInit {
    return {
      id, name: id, isPlayer, side,
      stats: stats({ destreza: over.dex ?? 50, firearms: 80, melee: 80, perception: 20 }),
      health: { current: over.hp ?? 100, max: 100 },
      pos: over.pos ?? { x: 0, z: 0 },
    };
  }

  it('a foe is anyone on a DIFFERENT side (same-side allies are skipped)', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 60, pos: { x: 0, z: 0 } }),
      mk('ally', false, 'A', { pos: { x: 1, z: 0 } }),
      mk('enemy', false, 'B', { pos: { x: 5, z: 0 } }),
    ]);
    expect(enc.nearestFoeId('player')).toBe('enemy'); // ally is same side
    expect(enc.distanceToNearestFoe('player')).toBe(5);
    expect(enc.sideOf('ally')).toBe('A');
  });

  it('player + ally beat a lone enemy → player_won when its side is wiped', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 60 }),
      mk('ally', false, 'A', { dex: 50 }),
      mk('enemy', false, 'B', { dex: 10, hp: 1 }),
    ], { rng: seq(0, 0) }); // player acts first, hit
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged', targetId: 'enemy' });
    expect(ev.kind).toBe('death');
    expect(enc.getOutcome()).toBe('player_won');
  });

  it('the player going down with no allies → player_lost', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 20, hp: 1 }),
      mk('enemy', false, 'B', { dex: 90 }),
    ], { rng: seq(0, 0.99) });
    expect(enc.activeId()).toBe('enemy');
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged', targetId: 'player' });
    expect(ev.kind).toBe('death');
    expect(enc.getOutcome()).toBe('player_lost');
  });

  it('a player flee removes them but the rest fight on (ongoing)', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 60, pos: { x: 0, z: 0 } }),
      mk('ally', false, 'A', { dex: 50, pos: { x: 1, z: 0 } }),
      mk('enemy', false, 'B', { dex: 40, pos: { x: 20, z: 0 } }), // >10 m from player
    ]);
    const ev = enc.apply({ type: 'flee' }); // player's turn
    expect(ev.kind).toBe('flee');
    expect(enc.isRemoved('player')).toBe(true);
    expect(enc.isOver()).toBe(false);              // ally vs enemy continues
    expect(enc.getOutcome()).toBe('ongoing');
    expect(['ally', 'enemy']).toContain(enc.activeId()); // turn passed to a standing fighter
  });

  it('a player-absent fight ends as resolved', () => {
    const enc = new CombatEncounter([
      mk('a', false, 'A', { dex: 60 }),
      mk('b', false, 'B', { dex: 10, hp: 1 }),
    ], { rng: seq(0, 0) });
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged', targetId: 'b' });
    expect(ev.kind).toBe('death');
    expect(enc.getOutcome()).toBe('resolved');
  });

  it('marks friendly fire when striking your own side', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 60, pos: { x: 0, z: 0 } }),
      mk('ally', false, 'A', { pos: { x: 1, z: 0 } }),
      mk('enemy', false, 'B', { pos: { x: 1, z: 0 } }),
    ], { rng: seq(0.99) }); // miss (no death) so we can read the flag cleanly
    const ff = enc.apply({ type: 'attack', attackKind: 'melee', targetId: 'ally' });
    expect(ff.friendlyFire).toBe(true);
    const foe = enc.apply({ type: 'attack', attackKind: 'melee', targetId: 'enemy' });
    expect(foe.friendlyFire).toBe(false);
  });

  it('an attack with no foe on another side is rejected', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A', { dex: 60 }),
      mk('ally', false, 'A'),
    ]);
    const ev = enc.apply({ type: 'attack', attackKind: 'ranged' }); // only same-side ally exists
    expect(ev.kind).toBe('rejected');
    expect(ev.reason).toBe('invalid');
  });

  it('setSide flips a combatant; an unknown id is a no-op', () => {
    const enc = new CombatEncounter([
      mk('player', true, 'A'),
      mk('ally', false, 'A'),
      mk('enemy', false, 'B'),
    ]);
    enc.setSide('ally', 'B');
    expect(enc.sideOf('ally')).toBe('B');
    expect(() => enc.setSide('ghost', 'B')).not.toThrow();
  });

  function hpOf(enc: CombatEncounter, id: string): number {
    return enc.getState().combatants.find((c) => c.id === id)!.hp.current;
  }

  it('an equipped melee weapon out-damages the bare fist on a hit', () => {
    // Adjacent combatants (distance 0 ≤ reach 1); seq(0.01,0) = sure hit, 0 variance.
    const fistEnc = new CombatEncounter(
      [mk('player', true, 'A', { dex: 60 }), mk('enemy', false, 'B')],
      { rng: seq(0.01, 0) },
    );
    fistEnc.apply({ type: 'attack', attackKind: 'melee', targetId: 'enemy' });
    const fistDmg = 100 - hpOf(fistEnc, 'enemy'); // 8 + floor(20/10) = 10

    const c = [mk('player', true, 'A', { dex: 60 }), mk('enemy', false, 'B')];
    c[0]!.weapon = { attackKind: 'melee', damageBase: 12, variance: 6, range: 1 };
    const knifeEnc = new CombatEncounter(c, { rng: seq(0.01, 0) });
    knifeEnc.apply({ type: 'attack', attackKind: 'melee', targetId: 'enemy' });
    const knifeDmg = 100 - hpOf(knifeEnc, 'enemy'); // 12 + 2 = 14

    expect(fistDmg).toBe(10);
    expect(knifeDmg).toBe(14);
    expect(knifeDmg).toBeGreaterThan(fistDmg);
  });

  it('a longer-reach weapon can strike from beyond the bare-fist range', () => {
    const c = [
      mk('player', true, 'A', { dex: 60, pos: { x: 0, z: 0 } }),
      mk('enemy', false, 'B', { pos: { x: 2, z: 0 } }), // 2 m away
    ];
    // Fist (reach 1) cannot reach 2 m.
    const fist = new CombatEncounter(c.map((x) => ({ ...x })), { rng: seq(0.01, 0) });
    expect(fist.apply({ type: 'attack', attackKind: 'melee', targetId: 'enemy' }).kind).toBe('rejected');
    // A reach-3 polearm can.
    const cc = c.map((x) => ({ ...x }));
    cc[0]!.weapon = { attackKind: 'melee', damageBase: 10, variance: 4, range: 3 };
    const reach = new CombatEncounter(cc, { rng: seq(0.01, 0) });
    expect(reach.apply({ type: 'attack', attackKind: 'melee', targetId: 'enemy' }).kind).toBe('hit');
  });
});
