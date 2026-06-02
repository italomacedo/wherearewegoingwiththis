/**
 * Turn-based combat encounter — a pure state machine for a duel (player vs one
 * hostile NPC). Drives initiative, the per-turn AP pool, the scalar distance
 * between the two fighters, cover, and win/lose/flee end conditions. Every
 * decision is deterministic given the injected RNG; no Babylon/DOM dependency,
 * so it is fully unit-tested. The browser overlay (C4) renders this state and
 * the NPC AI policy (C3) chooses the enemy's actions.
 *
 * Model recap (see CombatMath): AP = round(Dexterity / divisor); a primary action
 * (attack) costs `primaryCost`, a secondary (cover/hunker/reload) `secondaryCost`,
 * movement `moveApPerMeter` per metre. Melee needs distance ≤ MELEE_RANGE. Taking
 * cover raises the actor's incoming-attack defence until their next turn; moving
 * breaks it.
 */

import { Health, HealthState } from '@entities/Health';
import { CharacterStats } from '@entities/CharacterStats';
import { RollFn, defaultRoll } from '../SkillCheck';
import {
  CombatTuning, DEFAULT_COMBAT_TUNING, AttackKind,
  actionPointsFor, moveApCost, resolveAttack, rollDamage,
  initiativeOrder, MELEE_RANGE, COVER_NONE, COVER_PARTIAL, COVER_FULL,
} from './CombatMath';

export interface CombatantInit {
  id: string;
  name: string;
  isPlayer: boolean;
  stats: CharacterStats;
  health: HealthState;
}

export type CombatActionType = 'attack' | 'move' | 'cover' | 'hunker' | 'reload' | 'flee' | 'end_turn';

export interface CombatAction {
  type: CombatActionType;
  /** For 'attack': melee or ranged. */
  attackKind?: AttackKind;
  /** For 'move': whole metres (rounded by the cost helper). */
  meters?: number;
  /** For 'move': true = close the distance (default), false = retreat. */
  toward?: boolean;
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
  /** For 'rejected': why the action was not applied. */
  reason?: 'not_active' | 'over' | 'out_of_ap' | 'too_far' | 'invalid';
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
}

export interface CombatState {
  activeId: string;
  outcome: CombatOutcome;
  distance: number;
  combatants: CombatantView[];
}

interface Slot {
  init: CombatantInit;
  health: Health;
  ap: number;
  cover: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const DEFAULT_INITIAL_DISTANCE = 6;
export const MAX_DISTANCE = 40;

export class CombatEncounter {
  private readonly tuning: CombatTuning;
  private readonly rng: RollFn;
  private readonly order: string[];
  private readonly slots = new Map<string, Slot>();
  private activeIdx = 0;
  private distance: number;
  private outcome: CombatOutcome = 'ongoing';

  constructor(
    combatants: CombatantInit[],
    opts: { tuning?: CombatTuning; rng?: RollFn; initialDistance?: number } = {},
  ) {
    if (combatants.length !== 2) {
      throw new Error('CombatEncounter supports exactly two combatants (player vs one enemy)');
    }
    this.tuning = opts.tuning ?? DEFAULT_COMBAT_TUNING;
    this.rng = opts.rng ?? defaultRoll;
    this.distance = clamp(opts.initialDistance ?? DEFAULT_INITIAL_DISTANCE, 0, MAX_DISTANCE);
    combatants.forEach((c) => this.slots.set(c.id, {
      init: c, health: Health.fromState(c.health), ap: 0, cover: COVER_NONE,
    }));
    this.order = initiativeOrder(combatants.map((c) => ({ id: c.id, dexterity: c.stats.attributes.destreza })));
    this.beginTurn(this.order[this.activeIdx]!);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  activeId(): string { return this.order[this.activeIdx]!; }
  getOutcome(): CombatOutcome { return this.outcome; }
  isOver(): boolean { return this.outcome !== 'ongoing'; }
  getDistance(): number { return this.distance; }
  getTuning(): CombatTuning { return this.tuning; }
  apOf(id: string): number { return this.slots.get(id)?.ap ?? 0; }
  coverOf(id: string): number { return this.slots.get(id)?.cover ?? COVER_NONE; }
  isAlive(id: string): boolean { return !(this.slots.get(id)?.health.isDead() ?? true); }

  private opponentOf(id: string): string {
    return this.order.find((x) => x !== id)!;
  }

  private maxApOf(id: string): number {
    const s = this.slots.get(id)!;
    return actionPointsFor(s.init.stats.attributes.destreza, this.tuning);
  }

  getState(): CombatState {
    return {
      activeId: this.activeId(),
      outcome: this.outcome,
      distance: this.distance,
      combatants: this.order.map((id) => {
        const s = this.slots.get(id)!;
        return {
          id, name: s.init.name, isPlayer: s.init.isPlayer,
          ap: s.ap, maxAp: this.maxApOf(id), cover: s.cover,
          hp: s.health.toState(), alive: !s.health.isDead(),
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

  private cost(type: CombatActionType, meters: number): number {
    switch (type) {
      case 'attack': return this.tuning.primaryCost;
      case 'cover': case 'hunker': case 'reload': return this.tuning.secondaryCost;
      case 'move': return moveApCost(meters, this.tuning);
      default: return 0; // flee / end_turn are free
    }
  }

  // ─── Apply an action by the ACTIVE combatant ─────────────────────────────────

  apply(action: CombatAction): CombatEvent {
    const actorId = this.activeId();
    if (this.isOver()) return { kind: 'rejected', actorId, reason: 'over' };

    const actor = this.slots.get(actorId)!;
    const meters = Math.max(0, Math.floor(action.meters ?? 0));
    const needed = this.cost(action.type, meters);

    // AP gate (free actions skip it).
    if (needed > actor.ap) {
      return { kind: 'rejected', actorId, reason: 'out_of_ap', ap: actor.ap };
    }

    switch (action.type) {
      case 'end_turn': {
        this.advance();
        return { kind: 'end_turn', actorId, ap: 0 };
      }
      case 'flee': {
        this.outcome = 'fled';
        return { kind: 'flee', actorId };
      }
      case 'cover': {
        actor.ap -= needed;
        actor.cover = COVER_PARTIAL;
        return { kind: 'cover', actorId, cover: actor.cover, ap: actor.ap };
      }
      case 'hunker': {
        actor.ap -= needed;
        actor.cover = COVER_FULL;
        return { kind: 'hunker', actorId, cover: actor.cover, ap: actor.ap };
      }
      case 'reload': {
        actor.ap -= needed; // no ammo model yet — flavour + tempo cost
        return { kind: 'reload', actorId, ap: actor.ap };
      }
      case 'move': {
        if (meters <= 0) return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
        actor.ap -= needed;
        actor.cover = COVER_NONE; // moving breaks cover
        const close = action.toward ?? true;
        this.distance = clamp(close ? this.distance - meters : this.distance + meters, 0, MAX_DISTANCE);
        return { kind: 'move', actorId, meters, distance: this.distance, ap: actor.ap };
      }
      case 'attack': {
        const targetId = this.opponentOf(actorId);
        const target = this.slots.get(targetId)!;
        const kind: AttackKind = action.attackKind ?? 'ranged';
        if (kind === 'melee' && this.distance > MELEE_RANGE) {
          return { kind: 'rejected', actorId, targetId, reason: 'too_far', ap: actor.ap };
        }
        actor.ap -= needed;
        const hit = resolveAttack(
          { attacker: actor.init.stats, defender: target.init.stats, kind, coverMod: target.cover },
          this.rng,
        );
        const probability = hit.probability;
        const roll = hit.roll;
        if (!hit.success) {
          return { kind: 'miss', actorId, targetId, distance: this.distance, ap: actor.ap, probability, roll, attackKind: kind };
        }
        const damage = rollDamage(actor.init.stats, kind, this.rng);
        target.health.applyDamage(damage);
        if (target.health.isDead()) {
          this.outcome = target.init.isPlayer ? 'player_lost' : 'player_won';
          return { kind: 'death', actorId, targetId, damage, distance: this.distance, ap: actor.ap, probability, roll, attackKind: kind };
        }
        return { kind: 'hit', actorId, targetId, damage, distance: this.distance, ap: actor.ap, probability, roll, attackKind: kind };
      }
      /* istanbul ignore next — exhaustive switch guard */
      default:
        return { kind: 'rejected', actorId, reason: 'invalid', ap: actor.ap };
    }
  }
}
