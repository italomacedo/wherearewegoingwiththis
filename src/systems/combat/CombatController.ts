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
  CombatTuning, MELEE_RANGE, maxMoveMeters,
} from './CombatMath';

export interface CombatLogEntry {
  actorId: string;
  targetId?: string;
  kind: CombatEvent['kind'];
  beat: string;
  isPlayerActor: boolean;
  /** Set for attack events so the overlay can highlight hits/misses/kills. */
  attackOutcome?: 'hit' | 'miss' | 'death';
  /** To-hit probability (0..1) and kind for attack events (gates critical narration + animation). */
  probability?: number;
  attackKind?: 'melee' | 'ranged';
}

/** A player button: the action to apply, an i18n label key, and whether it is affordable now. */
export interface PlayerActionOption {
  action: CombatAction;
  labelKey: string;
  enabled: boolean;
}

const MAX_ENEMY_ACTIONS = 50; // runaway guard

/** A landed blow is "critical" (worth a Claude-narrated line) when its to-hit P cleared this. */
export const CRITICAL_HIT_THRESHOLD = 0.9;

/** True for a landed hit/kill whose to-hit probability cleared the critical threshold. */
export function isCriticalHit(entry: CombatLogEntry): boolean {
  return (entry.kind === 'hit' || entry.kind === 'death') && (entry.probability ?? 0) > CRITICAL_HIT_THRESHOLD;
}

/** The player's action menu for the current state (move buttons step 1 metre). */
export function playerActionOptions(state: CombatState, playerId: string, tuning: CombatTuning): PlayerActionOption[] {
  const me = state.combatants.find((c) => c.id === playerId);
  const ap = me?.ap ?? 0;
  const inMelee = state.distance <= MELEE_RANGE;
  const canMove1 = maxMoveMeters(ap, tuning) >= 1;
  const canPrimary = ap >= tuning.primaryCost;
  const canSecondary = ap >= tuning.secondaryCost;
  return [
    { action: { type: 'attack', attackKind: 'ranged' }, labelKey: 'combat.shoot', enabled: canPrimary },
    { action: { type: 'attack', attackKind: 'melee' }, labelKey: 'combat.strike', enabled: canPrimary && inMelee },
    { action: { type: 'move', meters: 1, toward: true }, labelKey: 'combat.advance', enabled: canMove1 && state.distance > 0 },
    { action: { type: 'move', meters: 1, toward: false }, labelKey: 'combat.retreat', enabled: canMove1 },
    { action: { type: 'cover' }, labelKey: 'combat.cover', enabled: canSecondary },
    { action: { type: 'hunker' }, labelKey: 'combat.hunker', enabled: canSecondary },
    { action: { type: 'reload' }, labelKey: 'combat.reload', enabled: canSecondary },
    { action: { type: 'flee' }, labelKey: 'combat.flee', enabled: true },
    { action: { type: 'end_turn' }, labelKey: 'combat.endTurn', enabled: true },
  ];
}

export class CombatController {
  private readonly enemyPrefersMelee: boolean;

  constructor(
    private readonly enc: CombatEncounter,
    private readonly names: CombatNames,
    private readonly playerId: string,
    private readonly enemyId: string,
    enemyStats: CharacterStats,
  ) {
    this.enemyPrefersMelee = prefersMelee(enemyStats);
  }

  getState(): CombatState { return this.enc.getState(); }
  outcome(): CombatOutcome { return this.enc.getOutcome(); }
  isOver(): boolean { return this.enc.isOver(); }
  isPlayerTurn(): boolean { return this.enc.activeId() === this.playerId; }
  options(): PlayerActionOption[] {
    return playerActionOptions(this.enc.getState(), this.playerId, this.enc.getTuning());
  }

  private entryOf(ev: CombatEvent): CombatLogEntry | null {
    const beat = combatBeat(ev, this.names);
    if (!beat) return null;
    const attackOutcome = ev.kind === 'hit' || ev.kind === 'miss' || ev.kind === 'death' ? ev.kind : undefined;
    return {
      actorId: ev.actorId, targetId: ev.targetId, kind: ev.kind, beat,
      isPlayerActor: ev.actorId === this.playerId, attackOutcome,
      probability: ev.probability, attackKind: ev.attackKind,
    };
  }

  /** Run the enemy's whole turn via the AI policy; returns its log entries. */
  runEnemyTurn(): CombatLogEntry[] {
    const out: CombatLogEntry[] = [];
    if (this.isPlayerTurn() || this.isOver()) return out;
    let guard = 0;
    while (!this.isOver() && this.enc.activeId() === this.enemyId && guard++ < MAX_ENEMY_ACTIONS) {
      const st = this.enc.getState();
      const self = st.combatants.find((c) => c.id === this.enemyId)!;
      const action = chooseCombatAction({
        ap: self.ap,
        distance: st.distance,
        hpFraction: self.hp.max > 0 ? self.hp.current / self.hp.max : 0,
        cover: self.cover,
        prefersMelee: this.enemyPrefersMelee,
        tuning: this.enc.getTuning(),
      });
      const ev = this.enc.apply(action);
      const entry = this.entryOf(ev);
      if (entry) out.push(entry);
      if (action.type === 'end_turn') break;
      /* istanbul ignore next — defensive: the AI only returns affordable/ending actions */
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
