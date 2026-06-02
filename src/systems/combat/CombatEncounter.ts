/**
 * Turn-based combat encounter — a pure state machine for an N-way fight grouped by
 * `side` (8B; a 1v1 is just player-side vs enemy-side). Drives initiative, the
 * per-turn AP pool, the real 2-D ground positions, cover, and side-based win/lose
 * (the fight ends when ≤1 side has standing combatants). A foe is anyone on a
 * different side. Fleeing removes a combatant but the rest fight on; the player can
 * win/lose/flee, and a player-absent fight ends as `resolved`. Every decision is
 * deterministic given the injected RNG; no Babylon/DOM dependency, so it is fully
 * unit-tested. The browser overlay renders this state and the NPC AI picks actions.
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
  /**
   * The combatant's side (8B). A foe is anyone on a DIFFERENT side. Not a faction —
   * just a grouping the recruiter assigns per-encounter. Defaults to 'player' for the
   * player combatant and 'enemy' for everyone else (so a 1v1 needs no side).
   */
  side?: string;
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

export type CombatOutcome =
  | 'ongoing'
  | 'player_won'
  | 'player_lost'
  | 'fled'
  /** A player-absent fight (autonomous NPC↔NPC, or the remainder after the player fled). */
  | 'resolved';

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
  /** For attack events: true when the actor struck a combatant on its OWN side. */
  friendlyFire?: boolean;
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
  /** The combatant's side (a foe is anyone on a different side). */
  side: string;
  /** True once the combatant has fled the encounter (no longer participates). */
  removed: boolean;
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
  side: string;
  removed: boolean;
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
      side: c.side ?? (c.isPlayer ? 'player' : 'enemy'),
      removed: false,
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
  sideOf(id: string): string | null { return this.slots.get(id)?.side ?? null; }
  isRemoved(id: string): boolean { return this.slots.get(id)?.removed ?? false; }

  /** Still in the fight: known, alive, and not fled. */
  private standing(id: string): boolean {
    const s = this.slots.get(id);
    return !!s && !s.removed && !s.health.isDead();
  }

  /** Distance from the active combatant to its nearest standing foe (∞ if none). */
  getDistance(): number { return this.distanceToNearestFoe(this.activeId()); }

  /**
   * Distance (m) from `id` to the nearest STANDING foe (a combatant on a different
   * side). Returns Infinity if none. (8B: foes are by side, not "everyone else".)
   */
  distanceToNearestFoe(id: string): number {
    const me = this.slots.get(id);
    if (!me) return Infinity;
    let best = Infinity;
    this.order.forEach((other) => {
      if (other === id || !this.standing(other)) return;
      if (this.slots.get(other)!.side === me.side) return;
      best = Math.min(best, distance2(me.pos, this.slots.get(other)!.pos));
    });
    return best;
  }

  /** Id of the nearest STANDING foe (different side) to `id`, or null if none. */
  nearestFoeId(id: string): string | null {
    const me = this.slots.get(id);
    if (!me) return null;
    let bestId: string | null = null;
    let best = Infinity;
    this.order.forEach((other) => {
      if (other === id || !this.standing(other)) return;
      if (this.slots.get(other)!.side === me.side) return;
      const d = distance2(me.pos, this.slots.get(other)!.pos);
      if (d < best) { best = d; bestId = other; }
    });
    return bestId;
  }

  /** Sides that still have at least one standing combatant. */
  private aliveSides(): Set<string> {
    const set = new Set<string>();
    this.slots.forEach((s, id) => { if (this.standing(id)) set.add(s.side); });
    return set;
  }

  private playerSlot(): Slot | undefined {
    return [...this.slots.values()].find((s) => s.init.isPlayer);
  }

  /**
   * End the encounter once ≤1 side has standing combatants. Outcome is player-centric:
   * `player_won` (player standing on the lone side), `player_lost` (player down),
   * `fled` (player left before it resolved), or `resolved` (no player participant).
   */
  private resolve(): void {
    if (this.isOver()) return;
    if (this.aliveSides().size >= 2) return;
    const player = this.playerSlot();
    if (!player) { this.outcome = 'resolved'; return; }
    if (player.removed) { this.outcome = 'fled'; return; }
    this.outcome = !player.health.isDead() && this.standing(player.init.id) ? 'player_won' : 'player_lost';
  }

  /** Move a combatant to another side (8B friendly-fire defection). Re-checks the end condition. */
  setSide(id: string, side: string): void {
    const s = this.slots.get(id);
    if (!s) return;
    s.side = side;
    this.resolve();
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
          side: s.side, removed: s.removed,
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

  /** Advance to the next STANDING combatant and refill their AP. No-op if over. */
  private advance(): void {
    /* istanbul ignore next — apply() already rejects actions once over */
    if (this.isOver()) return;
    let guard = 0;
    do {
      this.activeIdx = (this.activeIdx + 1) % this.order.length;
      guard += 1;
    } while (!this.standing(this.activeId()) && guard <= this.order.length);
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
        // The fleer leaves the fight; the rest may keep fighting (8B). Resolve, then
        // hand the turn to the next standing combatant if the fight goes on.
        actor.removed = true;
        this.resolve();
        if (!this.isOver()) this.advance();
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
        const targetId = action.targetId ?? this.nearestFoeId(actorId);
        const target = targetId ? this.slots.get(targetId) : undefined;
        if (!targetId || !target || target.removed || target.health.isDead()) {
          return { kind: 'rejected', actorId, targetId: targetId ?? undefined, reason: 'invalid', ap: actor.ap };
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
        const friendlyFire = actor.side === target.side;
        const hit = resolveAttack(
          { attacker: actor.init.stats, defender: target.init.stats, kind, coverMod: target.cover },
          this.rng,
        );
        const probability = hit.probability;
        const roll = hit.roll;
        if (!hit.success) {
          return { kind: 'miss', actorId, targetId, distance: dist, ap: actor.ap, probability, roll, attackKind: kind, friendlyFire };
        }
        const damage = rollDamage(actor.init.stats, kind, this.rng);
        target.health.applyDamage(damage);
        const dead = target.health.isDead();
        if (dead) this.resolve(); // side-based win/lose (N-way)
        return { kind: dead ? 'death' : 'hit', actorId, targetId, damage, distance: dist, ap: actor.ap, probability, roll, attackKind: kind, friendlyFire };
      }
      /* istanbul ignore next — exhaustive switch guard */
      default:
        return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
    }
  }
}
