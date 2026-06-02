/**
 * Turn orchestration over a CombatEncounter (pure, fully tested). It ties the
 * encounter to the NPC AI policy and the narration seeds: the player submits one
 * action, and if that ends their turn (or the fight), the enemy takes its whole
 * turn automatically. Produces ordered log entries (factual beats) for the
 * overlay to display and to feed Claude for cinematic dramatization.
 *
 * The browser overlay (CombatOverlay) renders this; it owns no game logic.
 */

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
  /** True when the actor struck a combatant on its own side (8B friendly fire). */
  friendlyFire?: boolean;
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
  constructor(
    private readonly enc: CombatEncounter,
    private readonly names: CombatNames,
    private readonly playerId: string,
    private readonly caps: CombatCapabilities = ALL_CAPABILITIES,
  ) {}

  getState(): CombatState { return this.enc.getState(); }
  outcome(): CombatOutcome { return this.enc.getOutcome(); }
  isOver(): boolean { return this.enc.isOver(); }
  isPlayerTurn(): boolean { return this.enc.activeId() === this.playerId; }
  /** True when it is a (non-player) AI combatant's turn. */
  isAiTurn(): boolean { return !this.isOver() && this.enc.activeId() !== this.playerId; }
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
      friendlyFire: ev.friendlyFire, path: ev.path,
    };
  }

  /** Choose + resolve one concrete action for an AI combatant on its turn. */
  private aiActionFor(actorId: string): CombatAction {
    const st = this.enc.getState();
    const self = st.combatants.find((c) => c.id === actorId)!;
    const stats = this.enc.statsOf(actorId);
    const decision = chooseCombatAction({
      ap: self.ap,
      distance: st.distance, // actorId is active → nearest-foe distance is its own
      hpFraction: self.hp.max > 0 ? self.hp.current / self.hp.max : 0,
      cover: self.cover,
      prefersMelee: stats ? prefersMelee(stats) : true,
      hasFirearm: this.caps.firearm,
      hasCover: this.caps.cover,
      tuning: this.enc.getTuning(),
    });
    const targetId = this.enc.nearestFoeId(actorId);
    if (decision.type === 'attack') {
      return targetId ? { type: 'attack', attackKind: decision.attackKind, targetId } : { type: 'end_turn' };
    }
    if (decision.type === 'move') {
      if (!targetId) return { type: 'end_turn' };
      const reach = this.enc.reachableToward(actorId, targetId, this.enc.getTuning().primaryCost);
      return reach ? { type: 'move', to: reach.to } : { type: 'end_turn' };
    }
    return decision;
  }

  /**
   * Run ONE AI combatant's whole turn (the current active non-player combatant) via
   * the policy, returning its log entries. The scene calls this per timed tick; the
   * encounter advances to the next combatant when the turn ends.
   */
  stepNextAiTurn(): CombatLogEntry[] {
    const out: CombatLogEntry[] = [];
    if (this.isOver() || this.isPlayerTurn()) return out;
    const actor = this.enc.activeId();
    let guard = 0;
    while (!this.isOver() && this.enc.activeId() === actor && guard++ < MAX_ENEMY_ACTIONS) {
      const action = this.aiActionFor(actor);
      const ev = this.enc.apply(action);
      const entry = this.entryOf(ev);
      if (entry) out.push(entry);
      if (action.type === 'end_turn') break;
      if (ev.kind === 'rejected') { this.enc.apply({ type: 'end_turn' }); break; }
    }
    return out;
  }

  /**
   * Resolve every AI turn until it is the player's turn or the fight ends. With no
   * player participant (autonomous / post-flee), this runs the whole fight to its
   * end (autopilot). Returns all log entries in order.
   */
  runToCompletion(): CombatLogEntry[] {
    const out: CombatLogEntry[] = [];
    let guard = 0;
    while (!this.isOver() && !this.isPlayerTurn() && guard++ < MAX_ENEMY_ACTIONS) {
      out.push(...this.stepNextAiTurn());
    }
    return out;
  }

  /** The player applies one action (target/destination already resolved by the scene). */
  takePlayerAction(action: CombatAction): CombatLogEntry[] {
    if (!this.isPlayerTurn() || this.isOver()) return [];
    const e = this.entryOf(this.enc.apply(action));
    return e ? [e] : [];
  }
}
