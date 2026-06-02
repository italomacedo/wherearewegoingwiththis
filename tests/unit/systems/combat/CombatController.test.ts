import { CombatController, playerActionOptions, isCriticalHit, CRITICAL_ROLL, objectiveLogLine, MELEE_ONLY_CAPS, CombatLogEntry } from '@systems/combat/CombatController';
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
  return { enc, ctrl: new CombatController(enc, NAMES, 'player') };
}

describe('playerActionOptions', () => {
  it('enables ranged + move with full AP, disables melee out of range, gates flee by distance', () => {
    const enc = mkController().enc; // distance 6
    const opts = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    const by = (k: string) => opts.find((o) => o.labelKey === k)!;
    expect(by('combat.shoot').enabled).toBe(true);
    expect(by('combat.strike').enabled).toBe(false); // distance 6 > melee range
    expect(by('combat.move').enabled).toBe(true);
    expect(by('combat.flee').enabled).toBe(false);   // foe within FLEE_MIN_DISTANCE
    expect(by('combat.endTurn').enabled).toBe(true);
  });

  it('enables melee once in range; flee only when the foe is far enough', () => {
    const close = playerActionOptions(mkController({ initialDistance: 1 }).enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    expect(close.find((o) => o.labelKey === 'combat.strike')!.enabled).toBe(true);
    expect(close.find((o) => o.labelKey === 'combat.flee')!.enabled).toBe(false);
    expect(MELEE_RANGE).toBeGreaterThanOrEqual(1);
    const far = playerActionOptions(mkController({ initialDistance: 12 }).enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    expect(far.find((o) => o.labelKey === 'combat.flee')!.enabled).toBe(true);
  });

  it('disables AP-bound actions when the player is out of AP (flee stays free if far)', () => {
    const enc = mkController({ playerDex: 20, initialDistance: 12 }).enc; // 2 AP, foe far
    enc.apply({ type: 'attack', attackKind: 'ranged' }); // spend 2
    const opts = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING);
    expect(opts.find((o) => o.labelKey === 'combat.shoot')!.enabled).toBe(false);
    expect(opts.find((o) => o.labelKey === 'combat.cover')!.enabled).toBe(false);
    expect(opts.find((o) => o.labelKey === 'combat.move')!.enabled).toBe(false);
    expect(opts.find((o) => o.labelKey === 'combat.flee')!.enabled).toBe(true);
  });

  it('defaults AP to 0 for an unknown player id', () => {
    const enc = mkController().enc;
    const opts = playerActionOptions(enc.getState(), 'ghost', DEFAULT_COMBAT_TUNING);
    expect(opts.find((o) => o.labelKey === 'combat.shoot')!.enabled).toBe(false);
  });

  it('melee-only caps omit Shoot/Reload/Cover/Hunker, keep Strike/Move/Flee/End', () => {
    const enc = mkController({ initialDistance: 1 }).enc;
    const keys = playerActionOptions(enc.getState(), 'player', DEFAULT_COMBAT_TUNING, MELEE_ONLY_CAPS).map((o) => o.labelKey);
    expect(keys).toEqual(['combat.strike', 'combat.move', 'combat.flee', 'combat.endTurn']);
    expect(keys).not.toContain('combat.shoot');
    expect(keys).not.toContain('combat.cover');
    expect(keys).not.toContain('combat.hunker');
    expect(keys).not.toContain('combat.reload');
  });
});

describe('isCriticalHit', () => {
  const entry = (over: Partial<CombatLogEntry>): CombatLogEntry =>
    ({ actorId: 'player', actorName: 'Hero', kind: 'hit', beat: 'x', isPlayerActor: true, ...over });
  it('is true only for a landed hit/kill rolled critically low (rare natural crit)', () => {
    expect(isCriticalHit(entry({ kind: 'hit', roll: 2 }))).toBe(true);
    expect(isCriticalHit(entry({ kind: 'death', roll: 0 }))).toBe(true);
    expect(isCriticalHit(entry({ kind: 'hit', roll: CRITICAL_ROLL }))).toBe(false); // strictly <
    expect(isCriticalHit(entry({ kind: 'hit', roll: 40, probability: 0.99 }))).toBe(false); // high P, normal roll
    expect(isCriticalHit(entry({ kind: 'miss', roll: 1 }))).toBe(false); // a miss is never critical
    expect(isCriticalHit(entry({ kind: 'hit' }))).toBe(false); // no roll → not critical
  });
});

describe('CombatController carries probability + attackKind + names/damage on entries', () => {
  it('a player hit entry exposes probability, kind, names and damage', () => {
    const { ctrl } = mkController({ rng: seq(0, 0) });
    const [entry] = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entry!.attackOutcome).toBe('hit');
    expect(entry!.attackKind).toBe('ranged');
    expect(typeof entry!.probability).toBe('number');
    expect(entry!.actorName).toBe('Hero');
    expect(entry!.targetName).toBe('Zara');
    expect(entry!.damage).toBeGreaterThan(0);
  });
});

describe('objectiveLogLine', () => {
  const entry = (over: Partial<CombatLogEntry>): CombatLogEntry =>
    ({ actorId: 'player', actorName: 'Hero', kind: 'hit', beat: 'x', isPlayerActor: true, ...over });
  it('builds an i18n key + params per event, with roll/chance + damage on hits', () => {
    expect(objectiveLogLine(entry({ kind: 'hit', targetName: 'Zara', damage: 14, roll: 33.7, probability: 0.72, weaponName: 'Knife' })))
      .toEqual({ key: 'combat.logHit', params: { a: 'Hero', b: 'Zara', dmg: 14, roll: 33, chance: 72, weapon: 'Knife' } });
    expect(objectiveLogLine(entry({ kind: 'death', targetName: 'Zara', damage: 9, roll: 5, probability: 0.9, weaponName: 'Knife' })))
      .toEqual({ key: 'combat.logKill', params: { a: 'Hero', b: 'Zara', dmg: 9, roll: 5, chance: 90, weapon: 'Knife' } });
    expect(objectiveLogLine(entry({ kind: 'miss', targetName: 'Zara', roll: 88, probability: 0.4, weaponName: 'fists' })))
      .toEqual({ key: 'combat.logMiss', params: { a: 'Hero', b: 'Zara', roll: 88, chance: 40, weapon: 'fists' } });
    expect(objectiveLogLine(entry({ kind: 'move' }))).toEqual({ key: 'combat.logMove', params: { a: 'Hero' } });
    expect(objectiveLogLine(entry({ kind: 'cover' }))!.key).toBe('combat.logCover');
    expect(objectiveLogLine(entry({ kind: 'hunker' }))!.key).toBe('combat.logHunker');
    expect(objectiveLogLine(entry({ kind: 'reload' }))!.key).toBe('combat.logReload');
    expect(objectiveLogLine(entry({ kind: 'flee' }))!.key).toBe('combat.logFlee');
  });
  it('returns null for mechanics-only events', () => {
    expect(objectiveLogLine(entry({ kind: 'end_turn' }))).toBeNull();
    expect(objectiveLogLine(entry({ kind: 'rejected' }))).toBeNull();
  });
  it('defaults damage/roll/chance to 0 and target to empty when absent', () => {
    expect(objectiveLogLine(entry({ kind: 'hit' }))).toEqual({ key: 'combat.logHit', params: { a: 'Hero', b: '', dmg: 0, roll: 0, chance: 0, weapon: '' } });
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

  it('a player shot logs a hit; the player keeps the turn (no auto AI)', () => {
    const { ctrl } = mkController({ playerDex: 20, enemyDex: 10, rng: seq(0, 0) }); // player hit + dmg
    const entries = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entries[0]).toMatchObject({ isPlayerActor: true, attackOutcome: 'hit' });
    expect(ctrl.isPlayerTurn()).toBe(true); // takePlayerAction does NOT auto-run the AI
  });

  it('ignores actions when it is not the player turn or the fight is over', () => {
    const { ctrl } = mkController({ initialDistance: 12 }); // far enough to flee
    ctrl.takePlayerAction({ type: 'flee' });        // player leaves; lone enemy side → resolved
    expect(ctrl.isOver()).toBe(true);
    expect(ctrl.takePlayerAction({ type: 'attack' })).toEqual([]);
    expect(ctrl.stepNextAiTurn()).toEqual([]);
    expect(ctrl.runToCompletion()).toEqual([]);
  });

  it('ending the player turn hands off to the AI via stepNextAiTurn', () => {
    const { ctrl } = mkController({ enemyDex: 40, rng: seq(0, 0) });
    expect(ctrl.takePlayerAction({ type: 'end_turn' })).toEqual([]); // end_turn logs nothing
    expect(ctrl.isAiTurn()).toBe(true);
    const ai = ctrl.stepNextAiTurn();
    expect(ai.some((e) => e.actorId === 'zara')).toBe(true);
    expect(ctrl.isPlayerTurn()).toBe(true); // back to the player afterwards
  });

  it('a lethal player shot ends the fight as player_won', () => {
    const { ctrl } = mkController({ enemyHp: 3, rng: seq(0, 0.99) });
    const entries = ctrl.takePlayerAction({ type: 'attack', attackKind: 'ranged' });
    expect(entries.some((e) => e.kind === 'death')).toBe(true);
    expect(ctrl.outcome()).toBe('player_won');
  });

  it('stepNextAiTurn drives a gunner enemy to shoot', () => {
    const { ctrl, enc } = mkController({ enemyDex: 40, rng: seq(0, 0) });
    enc.apply({ type: 'end_turn' }); // pass to the enemy
    expect(ctrl.isPlayerTurn()).toBe(false);
    const entries = ctrl.stepNextAiTurn();
    expect(entries.some((e) => e.actorId === 'zara')).toBe(true);
    expect(ctrl.isPlayerTurn()).toBe(true); // enemy ended its turn
  });

  it('melee-only caps: options omit Shoot, and a gun-statted enemy melees anyway', () => {
    // Enemy statted for firearms, but melee-only caps force melee + drop Shoot.
    const player: CombatantInit = { id: 'player', name: 'Hero', isPlayer: true, stats: stats({ destreza: 60, melee: 80 }), health: { current: 100, max: 100 } };
    const enemyStats = stats({ destreza: 70, firearms: 80, melee: 10, perception: 20 });
    const enemy: CombatantInit = { id: 'zara', name: 'Zara', isPlayer: false, stats: enemyStats, health: { current: 100, max: 100 } };
    const enc = new CombatEncounter([player, enemy], { rng: seq(0, 0), initialDistance: 1 });
    const ctrl = new CombatController(enc, NAMES, 'player', MELEE_ONLY_CAPS);
    expect(ctrl.options().map((o) => o.labelKey)).not.toContain('combat.shoot');
    expect(ctrl.isPlayerTurn()).toBe(false); // enemy Dex 70 > 60 → acts first
    const entries = ctrl.stepNextAiTurn();
    expect(entries.some((e) => e.attackKind === 'ranged')).toBe(false);
    expect(entries.some((e) => e.attackKind === 'melee' || e.kind === 'move')).toBe(true);
  });

  it('a melee enemy advances toward the player on its turn', () => {
    const { ctrl, enc } = mkController({ enemyMelee: true, enemyDex: 60, initialDistance: 8 });
    enc.apply({ type: 'end_turn' });
    const before = enc.getDistance();
    const entries = ctrl.stepNextAiTurn();
    expect(entries.some((e) => e.kind === 'move')).toBe(true);
    expect(enc.getDistance()).toBeLessThan(before);
  });

  it('runToCompletion autopilots a player-absent fight to the end', () => {
    // Two NPCs on opposite sides, no player → the controller resolves the whole fight.
    const a: CombatantInit = { id: 'a', name: 'A', isPlayer: false, side: 'A', stats: stats({ destreza: 60, melee: 80 }), health: { current: 100, max: 100 }, pos: { x: 0, z: 0 } };
    const b: CombatantInit = { id: 'b', name: 'B', isPlayer: false, side: 'B', stats: stats({ destreza: 40, perception: 10 }), health: { current: 6, max: 100 }, pos: { x: 0, z: 0 } };
    const enc = new CombatEncounter([a, b], { rng: seq(0, 0.99) });
    const ctrl = new CombatController(enc, { a: 'A', b: 'B' }, 'player'); // no 'player' combatant
    const log = ctrl.runToCompletion();
    expect(ctrl.isOver()).toBe(true);
    expect(ctrl.outcome()).toBe('resolved');
    expect(log.some((e) => e.kind === 'death')).toBe(true);
  });
});
