/**
 * Turn-based combat encounter — a pure state machine for a duel (player vs one
 * hostile NPC). Drives initiative, the per-turn AP pool, the real 2-D ground
 * positions of the fighters, cover, and win/lose/flee end conditions. Every
 * decision is deterministic given the injected RNG; no Babylon/DOM dependency,
 * so it is fully unit-tested. The browser overlay renders this state and the NPC
 * AI policy chooses the enemy's actions.
 *
 * Model recap (see CombatMath): AP = round(Dexterity / divisor); a primary action
 * (attack) costs `primaryCost`, a secondary (cover/hunker/reload) `secondaryCost`,
 * movement `moveApPerMeter` per metre of the ROUTED path. Melee needs the Euclidean
 * distance to the target ≤ MELEE_RANGE; fleeing needs the nearest foe > FLEE_MIN_DISTANCE.
 * Taking cover raises the actor's incoming-attack defence until their next turn;
 * moving breaks it. Movement is routed by an injected `pathfind` (straight line by default).
 */

import { Health, HealthState } from '@entities/Health';
import { CharacterStats } from '@entities/CharacterStats';
import { RollFn, defaultRoll } from '../SkillCheck';
import {
  CombatTuning, DEFAULT_COMBAT_TUNING, AttackKind,
  actionPointsFor, moveApCost, resolveAttack, rollDamage, initiativeOrder,
  MELEE_RANGE, FLEE_MIN_DISTANCE, COVER_NONE, COVER_PARTIAL, COVER_FULL,
  Point2, distance2, Pathfinder, straightLinePath, truncatePath, maxMoveMeters,
} from './CombatMath';

export interface CombatantInit {
  id: string;
  name: string;
  isPlayer: boolean;
  stats: CharacterStats;
  health: HealthState;
  /** Starting ground position (m). Defaults to a line spaced by the initial distance. */
  pos?: Point2;
}

export type CombatActionType = 'attack' | 'move' | 'cover' | 'hunker' | 'reload' | 'flee' | 'end_turn';

export interface CombatAction {
  type: CombatActionType;
  /** For 'attack': melee or ranged. */
  attackKind?: AttackKind;
  /** For 'attack': the combatant to strike (defaults to the lone opponent in a 1v1). */
  targetId?: string;
  /** For 'move': the destination ground point; the cost is the routed path length. */
  to?: Point2;
}

export type CombatOutcome = 'ongoing' | 'player_won' | 'player_lost' | 'fled';

export type CombatEventKind =
  | 'hit' | 'miss' | 'move' | 'cover' | 'hunker' | 'reload'
  | 'flee' | 'end_turn' | 'death' | 'rejected';

export interface CombatEvent {
  kind: CombatEventKind;
  actorId: string;
  targetId?: string;
  damage?: number;
  meters?: number;
  cover?: number;
  distance?: number;
  /** For 'move': the routed waypoints the actor walked (for the browser to animate). */
  path?: Point2[];
  /** For 'rejected': why the action was not applied. */
  reason?: 'not_active' | 'over' | 'out_of_ap' | 'too_far' | 'too_close' | 'invalid';
  /** Remaining AP for the actor after the action. */
  ap?: number;
  /** For attack events (hit/miss/death): the to-hit probability (0..1), the d100 roll, and the kind. */
  probability?: number;
  roll?: number;
  attackKind?: AttackKind;
}

export interface CombatantView {
  id: string;
  name: string;
  isPlayer: boolean;
  ap: number;
  maxAp: number;
  cover: number;
  hp: HealthState;
  alive: boolean;
  /** Current ground position (m). */
  pos: Point2;
}

export interface CombatState {
  activeId: string;
  outcome: CombatOutcome;
  /** Distance (m) from the active combatant to its nearest living foe (display/AI convenience). */
  distance: number;
  combatants: CombatantView[];
}

interface Slot {
  init: CombatantInit;
  health: Health;
  ap: number;
  cover: number;
  pos: Point2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const DEFAULT_INITIAL_DISTANCE = 6;
export const MAX_DISTANCE = 40;

export class CombatEncounter {
  private readonly tuning: CombatTuning;
  private readonly rng: RollFn;
  private readonly pathfind: Pathfinder;
  private readonly order: string[];
  private readonly slots = new Map<string, Slot>();
  private activeIdx = 0;
  private outcome: CombatOutcome = 'ongoing';

  constructor(
    combatants: CombatantInit[],
    opts: { tuning?: CombatTuning; rng?: RollFn; initialDistance?: number; pathfind?: Pathfinder } = {},
  ) {
    if (combatants.length < 2) {
      throw new Error('CombatEncounter needs at least two combatants');
    }
    this.tuning = opts.tuning ?? DEFAULT_COMBAT_TUNING;
    this.rng = opts.rng ?? defaultRoll;
    this.pathfind = opts.pathfind ?? straightLinePath;
    const spacing = clamp(opts.initialDistance ?? DEFAULT_INITIAL_DISTANCE, 0, MAX_DISTANCE);
    combatants.forEach((c, i) => this.slots.set(c.id, {
      init: c, health: Health.fromState(c.health), ap: 0, cover: COVER_NONE,
      pos: c.pos ? { ...c.pos } : { x: i * spacing, z: 0 },
    }));
    this.order = initiativeOrder(combatants.map((c) => ({ id: c.id, dexterity: c.stats.attributes.destreza })));
    this.beginTurn(this.order[this.activeIdx]!);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  activeId(): string { return this.order[this.activeIdx]!; }
  getOutcome(): CombatOutcome { return this.outcome; }
  isOver(): boolean { return this.outcome !== 'ongoing'; }
  getTuning(): CombatTuning { return this.tuning; }
  apOf(id: string): number { return this.slots.get(id)?.ap ?? 0; }
  coverOf(id: string): number { return this.slots.get(id)?.cover ?? COVER_NONE; }
  isAlive(id: string): boolean { return !(this.slots.get(id)?.health.isDead() ?? true); }
  posOf(id: string): Point2 { const p = this.slots.get(id)!.pos; return { ...p }; }

  /** Distance from the active combatant to its nearest living foe (∞ if none). */
  getDistance(): number { return this.distanceToNearestFoe(this.activeId()); }

  /**
   * Distance (m) from `id` to the nearest LIVING foe. In a 1v1 (or until sides are
   * introduced in 8B) every other combatant is a foe. Returns Infinity if none live.
   */
  distanceToNearestFoe(id: string): number {
    const me = this.slots.get(id);
    if (!me) return Infinity;
    let best = Infinity;
    this.order.forEach((other) => {
      if (other === id) return;
      const s = this.slots.get(other)!;
      if (s.health.isDead()) return;
      best = Math.min(best, distance2(me.pos, s.pos));
    });
    return best;
  }

  /** Id of the nearest LIVING foe to `id`, or null if none live. */
  nearestFoeId(id: string): string | null {
    const me = this.slots.get(id);
    if (!me) return null;
    let bestId: string | null = null;
    let best = Infinity;
    this.order.forEach((other) => {
      if (other === id) return;
      const s = this.slots.get(other)!;
      if (s.health.isDead()) return;
      const d = distance2(me.pos, s.pos);
      if (d < best) { best = d; bestId = other; }
    });
    return bestId;
  }

  private opponentOf(id: string): string {
    return this.order.find((x) => x !== id)!;
  }

  private maxApOf(id: string): number {
    const s = this.slots.get(id)!;
    return actionPointsFor(s.init.stats.attributes.destreza, this.tuning);
  }

  /**
   * Route from `actorId` toward `targetId`, stopping ~MELEE_RANGE short, capped at
   * the AP the actor can afford. Returns the destination + AP cost, or null if no
   * progress is possible (already in range, blocked, or out of AP).
   */
  reachableToward(actorId: string, targetId: string, reserveAp = 0): { to: Point2; cost: number } | null {
    const actor = this.slots.get(actorId);
    const target = this.slots.get(targetId);
    if (!actor || !target) return null;
    const route = this.pathfind(actor.pos, target.pos);
    if (!route) return null;
    const spendable = Math.max(0, actor.ap - Math.max(0, reserveAp));
    const budget = Math.min(maxMoveMeters(spendable, this.tuning), Math.max(0, route.meters - MELEE_RANGE));
    if (budget <= 0) return null;
    const { point, meters } = truncatePath(route.points, budget);
    const cost = moveApCost(meters, this.tuning);
    if (meters <= 0 || cost <= 0 || cost > actor.ap) return null;
    return { to: point, cost };
  }

  getState(): CombatState {
    return {
      activeId: this.activeId(),
      outcome: this.outcome,
      distance: this.distanceToNearestFoe(this.activeId()),
      combatants: this.order.map((id) => {
        const s = this.slots.get(id)!;
        return {
          id, name: s.init.name, isPlayer: s.init.isPlayer,
          ap: s.ap, maxAp: this.maxApOf(id), cover: s.cover,
          hp: s.health.toState(), alive: !s.health.isDead(), pos: { ...s.pos },
        };
      }),
    };
  }

  // ─── Turn flow ───────────────────────────────────────────────────────────────

  private beginTurn(id: string): void {
    const s = this.slots.get(id)!;
    s.ap = this.maxApOf(id);
    s.cover = COVER_NONE; // re-take cover each turn (and moving breaks it)
  }

  /** Advance to the next living combatant and refill their AP. No-op if over. */
  private advance(): void {
    /* istanbul ignore next — apply() already rejects actions once over */
    if (this.isOver()) return;
    this.activeIdx = (this.activeIdx + 1) % this.order.length;
    this.beginTurn(this.activeId());
  }

  // ─── Apply an action by the ACTIVE combatant ─────────────────────────────────

  apply(action: CombatAction): CombatEvent {
    const actorId = this.activeId();
    if (this.isOver()) return { kind: 'rejected', actorId, reason: 'over' };
    const actor = this.slots.get(actorId)!;
    const secondary = this.tuning.secondaryCost;

    switch (action.type) {
      case 'end_turn': {
        this.advance();
        return { kind: 'end_turn', actorId, ap: 0 };
      }
      case 'flee': {
        if (this.distanceToNearestFoe(actorId) <= FLEE_MIN_DISTANCE) {
          return { kind: 'rejected', actorId, reason: 'too_close', ap: actor.ap };
        }
        this.outcome = 'fled';
        return { kind: 'flee', actorId };
      }
      case 'cover': {
        if (secondary > actor.ap) return { kind: 'rejected', actorId, reason: 'out_of_ap', ap: actor.ap };
        actor.ap -= secondary;
        actor.cover = COVER_PARTIAL;
        return { kind: 'cover', actorId, cover: actor.cover, ap: actor.ap };
      }
      case 'hunker': {
        if (secondary > actor.ap) return { kind: 'rejected', actorId, reason: 'out_of_ap', ap: actor.ap };
        actor.ap -= secondary;
        actor.cover = COVER_FULL;
        return { kind: 'hunker', actorId, cover: actor.cover, ap: actor.ap };
      }
      case 'reload': {
        if (secondary > actor.ap) return { kind: 'rejected', actorId, reason: 'out_of_ap', ap: actor.ap };
        actor.ap -= secondary; // no ammo model yet — flavour + tempo cost
        return { kind: 'reload', actorId, ap: actor.ap };
      }
      case 'move': {
        if (!action.to) return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
        const route = this.pathfind(actor.pos, action.to);
        if (!route || route.meters <= 0) return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
        const cost = moveApCost(route.meters, this.tuning);
        if (cost > actor.ap) return { kind: 'rejected', actorId, reason: 'out_of_ap', ap: actor.ap };
        actor.ap -= cost;
        actor.cover = COVER_NONE; // moving breaks cover
        actor.pos = { ...action.to };
        return {
          kind: 'move', actorId, meters: route.meters, path: route.points,
          distance: this.distanceToNearestFoe(actorId), ap: actor.ap,
        };
      }
      case 'attack': {
        const targetId = action.targetId ?? this.opponentOf(actorId);
        const target = this.slots.get(targetId);
        if (!target || target.health.isDead()) {
          return { kind: 'rejected', actorId, targetId, reason: 'invalid', ap: actor.ap };
        }
        const kind: AttackKind = action.attackKind ?? 'ranged';
        const dist = distance2(actor.pos, target.pos);
        if (kind === 'melee' && dist > MELEE_RANGE) {
          return { kind: 'rejected', actorId, targetId, reason: 'too_far', ap: actor.ap };
        }
        if (this.tuning.primaryCost > actor.ap) {
          return { kind: 'rejected', actorId, targetId, reason: 'out_of_ap', ap: actor.ap };
        }
        actor.ap -= this.tuning.primaryCost;
        const hit = resolveAttack(
          { attacker: actor.init.stats, defender: target.init.stats, kind, coverMod: target.cover },
          this.rng,
        );
        const probability = hit.probability;
        const roll = hit.roll;
        if (!hit.success) {
          return { kind: 'miss', actorId, targetId, distance: dist, ap: actor.ap, probability, roll, attackKind: kind };
        }
        const damage = rollDamage(actor.init.stats, kind, this.rng);
        target.health.applyDamage(damage);
        if (target.health.isDead()) {
          this.outcome = target.init.isPlayer ? 'player_lost' : 'player_won';
          return { kind: 'death', actorId, targetId, damage, distance: dist, ap: actor.ap, probability, roll, attackKind: kind };
        }
        return { kind: 'hit', actorId, targetId, damage, distance: dist, ap: actor.ap, probability, roll, attackKind: kind };
      }
      /* istanbul ignore next — exhaustive switch guard */
      default:
        return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
    }
  }
}
