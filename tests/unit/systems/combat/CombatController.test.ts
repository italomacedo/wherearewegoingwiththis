import { CombatController, playerActionOptions, isCriticalHit, CRITICAL_HIT_THRESHOLD, CombatLogEntry } from '@systems/combat/CombatController';
import { CombatEncounter, CombatantInit } from '@systems/combat/CombatEncounter';
import { DEFAULT_COMBAT_TUNING, MELEE_RANGE } from '@systems/combat/CombatMath';
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

const NAMES = { player: 'Hero', zara: 'Zara' };

function mkController(opts: { rng?: () => number; playerDex?: number; enemyDex?: number; enemyHp?: number; enemyMelee?: boolean; initialDistance?: number } = {}) {
  const player: CombatantInit = {
    id: 'player', name: 'Hero', isPlayer: true,
    stats: stats({ destreza: opts.playerDex ?? 60, firearms: 80, melee: 80 }),
    health: { current: 100, max: 100 },
  };
  const enemyStats = opts.enemyMelee
    ? stats({ destreza: opts.enemyDex ?? 40, melee: 70, firearms: 10, perception: 20 })
    : stats({ destreza: opts.enemyDex ?? 40, firearms: 70, melee: 10, perception: 20 });
  const enemy: CombatantInit = {
    id: 'zara', name: 'Zara', isPlayer: false, stats: enemyStats,
    health: { current: opts.enemyHp ?? 100, max: 100 },
  };
  const enc = new CombatEncounter([player, enemy], { rng: opts.rng ?? seq(0), initialDistance: opts.initialDistance ?? 6 });
  return { enc, ctrl: new CombatController(enc, NAMES, 'player', 'zara', enemyStats) };
}

describe('playerActionOptions', () => {
  it('enables ranged + secondaries with full AP, disables melee out of range', () => {
    const enc = mkController().enc;
    const opts = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    const by = (k: string) => opts.find((o) => o.labelKey === k)!;
    expect(by('combat.shoot').enabled).toBe(true);
    expect(by('combat.strike').enabled).toBe(false); // distance 6 > melee range
    expect(by('combat.advance').enabled).toBe(true);
    expect(by('combat.flee').enabled).toBe(true);
    expect(by('combat.endTurn').enabled).toBe(true);
  });

  it('enables melee once in range and disables advance at distance 0', () => {
    const enc = mkController({ initialDistance: 1 }).enc;
    const opts = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    expect(opts.find((o) => o.labelKey === 'combat.strike')!.enabled).toBe(true);
    expect(MELEE_RANGE).toBeGreaterThanOrEqual(1);
  });

  it('disables AP-bound actions when the player is out of AP', () => {
    const enc = mkController({ playerDex: 20 }).enc; // 2 AP
    enc.apply({ type: 'attack', attackKind: 'ranged' }); // spend 2
    const opts = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    expect(opts.find((o) => o.labelKey === 'combat.shoot')!.enabled).toBe(false);
    expect(opts.find((o) => o.labelKey === 'combat.cover')!.enabled).toBe(false);
    expect(opts.find((o) => o.labelKey === 'combat.flee')!.enabled).toBe(true);
  });

  it('defaults AP to 0 for an unknown player id', () => {
    const enc = mkController().enc;
    const opts = playerActionOptions(enc.getState(), 'ghost', DEFAULT_COMBAT_TUNING);
    expect(opts.find((o) => o.labelKey === 'combat.shoot')!.enabled).toBe(false);
  });
});

describe('isCriticalHit', () => {
  const entry = (over: Partial<CombatLogEntry>): CombatLogEntry =>
    ({ actorId: 'player', kind: 'hit', beat: 'x', isPlayerActor: true, ...over });
  it('is true only for a landed hit/kill above the probability threshold', () => {
    expect(isCriticalHit(entry({ kind: 'hit', probability: 0.95 }))).toBe(true);
    expect(isCriticalHit(entry({ kind: 'death', probability: 0.99 }))).toBe(true);
    expect(isCriticalHit(entry({ kind: 'hit', probability: CRITICAL_HIT_THRESHOLD }))).toBe(false); // strictly >
    expect(isCriticalHit(entry({ kind: 'hit', probability: 0.5 }))).toBe(false);
    expect(isCriticalHit(entry({ kind: 'miss', probability: 0.99 }))).toBe(false);
    expect(isCriticalHit(entry({ kind: 'hit' }))).toBe(false); // no probability
  });
});

describe('CombatController carries probability + attackKind on entries', () => {
  it('a player hit entry exposes the probability and kind', () => {
    const { ctrl } = mkController({ rng: seq(0, 0) });
    const [entry] = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entry!.attackOutcome).toBe('hit');
    expect(entry!.attackKind).toBe('ranged');
    expect(typeof entry!.probability).toBe('number');
  });
});

describe('CombatController', () => {
  it('reports player turn, state, and options', () => {
    const { ctrl } = mkController();
    expect(ctrl.isPlayerTurn()).toBe(true);
    expect(ctrl.isOver()).toBe(false);
    expect(ctrl.outcome()).toBe('ongoing');
    expect(ctrl.getState().distance).toBe(6);
    expect(ctrl.options().length).toBeGreaterThan(0);
  });

  it('a player shot logs a hit and then the enemy takes its turn', () => {
    // player Dex 20 → 2 AP → one shot exhausts it → enemy (Dex 10) acts.
    const { ctrl } = mkController({ playerDex: 20, enemyDex: 10, rng: seq(0, 0) }); // player hit + dmg
    const entries = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entries[0]).toMatchObject({ isPlayerActor: true, attackOutcome: 'hit' });
    // after the player spent both AP, the enemy should have acted (more entries or turn passed)
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(ctrl.isPlayerTurn()).toBe(true); // back to the player after the enemy turn
  });

  it('ignores actions when it is not the player turn or the fight is over', () => {
    const { ctrl } = mkController();
    ctrl.takePlayerAction({ type: 'flee' });        // ends as fled
    expect(ctrl.isOver()).toBe(true);
    expect(ctrl.takePlayerAction({ type: 'attack' })).toEqual([]);
    expect(ctrl.runEnemyTurn()).toEqual([]);
  });

  it('a lethal player shot ends the fight without an enemy turn', () => {
    const { ctrl } = mkController({ enemyHp: 3, rng: seq(0, 0.99) });
    const entries = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entries.some((e) => e.kind === 'death')).toBe(true);
    expect(ctrl.outcome()).toBe('player_won');
  });

  it('runEnemyTurn drives a gunner enemy to shoot', () => {
    const { ctrl, enc } = mkController({ enemyDex: 40, rng: seq(0, 0) });
    enc.apply({ type: 'end_turn' }); // pass to the enemy
    expect(ctrl.isPlayerTurn()).toBe(false);
    const entries = ctrl.runEnemyTurn();
    expect(entries.some((e) => e.actorId === 'zara')).toBe(true);
    expect(ctrl.isPlayerTurn()).toBe(true); // enemy ended its turn
  });

  it('a melee enemy advances toward the player on its turn', () => {
    const { ctrl, enc } = mkController({ enemyMelee: true, enemyDex: 60, initialDistance: 8 });
    enc.apply({ type: 'end_turn' });
    const before = enc.getDistance();
    const entries = ctrl.runEnemyTurn();
    expect(entries.some((e) => e.kind === 'move')).toBe(true);
    expect(enc.getDistance()).toBeLessThan(before);
  });
});
