/**
 * Turn orchestration over a CombatEncounter (pure, fully tested). It ties the
 * encounter to the NPC AI policy and the narration seeds: the player submits one
 * action, and if that ends their turn (or the fight), the enemy takes its whole
 * turn automatically. Produces ordered log entries (factual beats) for the
 * overlay to display and to feed Claude for cinematic dramatization.
 *
 * The browser overlay (CombatOverlay) renders this; it owns no game logic.
 */

import { CharacterStats } from '@entities/CharacterStats';
import {
  CombatEncounter, CombatAction, CombatEvent, CombatState, CombatOutcome,
} from './CombatEncounter';
import { chooseCombatAction, prefersMelee } from './CombatAI';
import { combatBeat, CombatNames } from './CombatNarration';
import {
  CombatTuning, MELEE_RANGE, FLEE_MIN_DISTANCE, maxMoveMeters, Point2,
} from './CombatMath';

export interface CombatLogEntry {
  actorId: string;
  targetId?: string;
  actorName: string;
  targetName?: string;
  kind: CombatEvent['kind'];
  beat: string;
  isPlayerActor: boolean;
  /** Damage dealt (hit/death). */
  damage?: number;
  /** Set for attack events so the overlay can highlight hits/misses/kills. */
  attackOutcome?: 'hit' | 'miss' | 'death';
  /** To-hit probability (0..1), the d100 roll, and kind for attack events. */
  probability?: number;
  roll?: number;
  attackKind?: 'melee' | 'ranged';
  /** For 'move': the routed waypoints walked (the scene animates the avatar along them). */
  path?: Point2[];
}

/**
 * The objective combat-log line for an event: an i18n key + params (actor/target/
 * damage). Returns null for mechanics-only events (end_turn/rejected). Pure — the
 * overlay applies `I18n.t(key, params)`. Critical hits are shown poetically instead
 * (the Claude narration), handled by the overlay.
 */
export function objectiveLogLine(entry: CombatLogEntry): { key: string; params: Record<string, string | number> } | null {
  const a = entry.actorName;
  const b = entry.targetName ?? '';
  const dmg = entry.damage ?? 0;
  const roll = Math.floor(entry.roll ?? 0);
  const chance = Math.round((entry.probability ?? 0) * 100);
  switch (entry.kind) {
    case 'hit': return { key: 'combat.logHit', params: { a, b, dmg, roll, chance } };
    case 'death': return { key: 'combat.logKill', params: { a, b, dmg, roll, chance } };
    case 'miss': return { key: 'combat.logMiss', params: { a, b, roll, chance } };
    case 'move': return { key: 'combat.logMove', params: { a } };
    case 'cover': return { key: 'combat.logCover', params: { a } };
    case 'hunker': return { key: 'combat.logHunker', params: { a } };
    case 'reload': return { key: 'combat.logReload', params: { a } };
    case 'flee': return { key: 'combat.logFlee', params: { a } };
    default: return null; // end_turn / rejected — nothing to log
  }
}

/** A player button: the action to apply, an i18n label key, and whether it is affordable now. */
export interface PlayerActionOption {
  action: CombatAction;
  labelKey: string;
  enabled: boolean;
}

/**
 * What a combatant can do this fight. `firearm` gates Shoot/Reload (nobody has a
 * gun until inventory lands); `cover` gates Take cover / Hunker down (those need a
 * scenery prop nearby — not implemented). Default = everything (for tests); the
 * scene opts into MELEE_ONLY for now.
 */
export interface CombatCapabilities {
  firearm: boolean;
  cover: boolean;
}

export const ALL_CAPABILITIES: CombatCapabilities = { firearm: true, cover: true };
export const MELEE_ONLY_CAPS: CombatCapabilities = { firearm: false, cover: false };

const MAX_ENEMY_ACTIONS = 50; // runaway guard

/**
 * A "critical" is a NATURAL low roll (d100 under this), not merely a likely hit —
 * so it stays rare (~CRITICAL_ROLL%) regardless of the stat matchup, and only a
 * critical earns a (succinct) poetic Claude line.
 */
export const CRITICAL_ROLL = 5;

/** True for a landed hit/kill rolled critically low (a rare natural crit). */
export function isCriticalHit(entry: CombatLogEntry): boolean {
  return (entry.kind === 'hit' || entry.kind === 'death') && (entry.roll ?? 100) < CRITICAL_ROLL;
}

/**
 * The player's action menu for the current state. Attack and Move are "modes":
 * the browser enters a targeting mode and fills the concrete target/destination on
 * the 3D click (so these options carry no targetId/`to`). `enabled` reflects only
 * what's affordable/legal up front (AP, a foe in melee reach, flee distance).
 * Firearm actions (Shoot/Reload) and cover actions are only offered when the
 * loadout/scenery allows them (`caps`).
 */
export function playerActionOptions(
  state: CombatState, playerId: string, tuning: CombatTuning, caps: CombatCapabilities = ALL_CAPABILITIES,
): PlayerActionOption[] {
  const me = state.combatants.find((c) => c.id === playerId);
  const ap = me?.ap ?? 0;
  const inMelee = state.distance <= MELEE_RANGE;
  const canMove1 = maxMoveMeters(ap, tuning) >= 1;
  const canPrimary = ap >= tuning.primaryCost;
  const canSecondary = ap >= tuning.secondaryCost;
  const opts: PlayerActionOption[] = [];
  if (caps.firearm) opts.push({ action: { type: 'attack', attackKind: 'ranged' }, labelKey: 'combat.shoot', enabled: canPrimary });
  opts.push({ action: { type: 'attack', attackKind: 'melee' }, labelKey: 'combat.strike', enabled: canPrimary && inMelee });
  opts.push({ action: { type: 'move' }, labelKey: 'combat.move', enabled: canMove1 });
  if (caps.cover) {
    opts.push({ action: { type: 'cover' }, labelKey: 'combat.cover', enabled: canSecondary });
    opts.push({ action: { type: 'hunker' }, labelKey: 'combat.hunker', enabled: canSecondary });
  }
  if (caps.firearm) opts.push({ action: { type: 'reload' }, labelKey: 'combat.reload', enabled: canSecondary });
  opts.push({ action: { type: 'flee' }, labelKey: 'combat.flee', enabled: state.distance > FLEE_MIN_DISTANCE });
  opts.push({ action: { type: 'end_turn' }, labelKey: 'combat.endTurn', enabled: true });
  return opts;
}

export class CombatController {
  private readonly enemyPrefersMelee: boolean;

  constructor(
    private readonly enc: CombatEncounter,
    private readonly names: CombatNames,
    private readonly playerId: string,
    private readonly enemyId: string,
    enemyStats: CharacterStats,
    private readonly caps: CombatCapabilities = ALL_CAPABILITIES,
  ) {
    this.enemyPrefersMelee = prefersMelee(enemyStats);
  }

  getState(): CombatState { return this.enc.getState(); }
  outcome(): CombatOutcome { return this.enc.getOutcome(); }
  isOver(): boolean { return this.enc.isOver(); }
  isPlayerTurn(): boolean { return this.enc.activeId() === this.playerId; }
  options(): PlayerActionOption[] {
    return playerActionOptions(this.enc.getState(), this.playerId, this.enc.getTuning(), this.caps);
  }

  private entryOf(ev: CombatEvent): CombatLogEntry | null {
    const beat = combatBeat(ev, this.names);
    if (!beat) return null;
    const attackOutcome = ev.kind === 'hit' || ev.kind === 'miss' || ev.kind === 'death' ? ev.kind : undefined;
    return {
      actorId: ev.actorId, targetId: ev.targetId, kind: ev.kind, beat,
      actorName: this.names[ev.actorId] ?? ev.actorId,
      targetName: ev.targetId ? (this.names[ev.targetId] ?? ev.targetId) : undefined,
      isPlayerActor: ev.actorId === this.playerId, attackOutcome,
      damage: ev.damage, probability: ev.probability, roll: ev.roll, attackKind: ev.attackKind,
      path: ev.path,
    };
  }

  /**
   * Turn the AI's abstract decision into a concrete encounter action: pick the
   * nearest living foe as the target, and for 'move' route a concrete destination
   * toward that foe (reserving AP for a strike). Degrades to end_turn when the
   * enemy can neither reach nor strike anyone.
   */
  private resolveEnemyAction(decision: CombatAction): CombatAction {
    const targetId = this.enc.nearestFoeId(this.enemyId);
    if (decision.type === 'attack') {
      if (!targetId) return { type: 'end_turn' };
      return { type: 'attack', attackKind: decision.attackKind, targetId };
    }
    if (decision.type === 'move') {
      if (!targetId) return { type: 'end_turn' };
      const reach = this.enc.reachableToward(this.enemyId, targetId, this.enc.getTuning().primaryCost);
      return reach ? { type: 'move', to: reach.to } : { type: 'end_turn' };
    }
    return decision;
  }

  /** Run the enemy's whole turn via the AI policy; returns its log entries. */
  runEnemyTurn(): CombatLogEntry[] {
    const out: CombatLogEntry[] = [];
    if (this.isPlayerTurn() || this.isOver()) return out;
    let guard = 0;
    while (!this.isOver() && this.enc.activeId() === this.enemyId && guard++ < MAX_ENEMY_ACTIONS) {
      const st = this.enc.getState();
      const self = st.combatants.find((c) => c.id === this.enemyId)!;
      const decision = chooseCombatAction({
        ap: self.ap,
        distance: st.distance,
        hpFraction: self.hp.max > 0 ? self.hp.current / self.hp.max : 0,
        cover: self.cover,
        prefersMelee: this.enemyPrefersMelee,
        hasFirearm: this.caps.firearm,
        hasCover: this.caps.cover,
        tuning: this.enc.getTuning(),
      });
      const action = this.resolveEnemyAction(decision);
      const ev = this.enc.apply(action);
      const entry = this.entryOf(ev);
      if (entry) out.push(entry);
      if (action.type === 'end_turn') break;
      if (ev.kind === 'rejected') { this.enc.apply({ type: 'end_turn' }); break; }
    }
    return out;
  }

  /**
   * The player applies one action; if their turn then ends (or the fight ends),
   * the enemy takes its full turn. Returns every resulting log entry in order.
   */
  takePlayerAction(action: CombatAction): CombatLogEntry[] {
    const entries: CombatLogEntry[] = [];
    if (!this.isPlayerTurn() || this.isOver()) return entries;
    const ev = this.enc.apply(action);
    const e = this.entryOf(ev);
    if (e) entries.push(e);
    if (!this.isOver() && !this.isPlayerTurn()) {
      entries.push(...this.runEnemyTurn());
    }
    return entries;
  }
}
