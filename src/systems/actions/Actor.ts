/**
 * Actor abstraction (Fase 21).
 *
 * The unified action resolver treats the player and any NPC behind the same
 * interface so a single `resolveAction(actor, verb, target?, options) →
 * Mutation[]` call works for both. The Resolver itself stays pure — it reads
 * only via `Actor` getters and never touches Babylon / save / UI state.
 *
 * Two adapters implement `Actor`:
 *
 *   - **PlayerActor** — wraps the scene's references to `PlayerController`,
 *     `Inventory`, `CharacterStats`. The player has no relationships ledger
 *     (only NPCs hold ledgers), so `getRelationship` returns `'neutral'` as
 *     a stable neutral baseline.
 *
 *   - **NpcActor** — wraps a live `NPCAgent`. All getters delegate; the
 *     relationships ledger is honoured.
 *
 * Position uses `Point2 { x, z }` to stay engine-agnostic (Babylon's Vector3
 * is converted at the adapter boundary). The Resolver/Mutation layer never
 * sees Babylon types.
 */

import type { Health } from '@entities/Health';
import type { Inventory } from '@entities/Inventory';
import type { CharacterStats } from '@entities/CharacterStats';
import type { NPCAgent, NPCDisposition } from '@entities/NPCAgent';
import type { PlayerController } from '@entities/PlayerController';
import type { Point2 } from './Mutations';

/**
 * Read-only view of an actor that the pure Resolver/Mutation logic can
 * introspect. Adapters wrap the live mutable runtime objects.
 */
export interface Actor {
  /** Stable identifier: `'player'` for the PC, NPC definition id otherwise. */
  readonly id: string;
  /** Human-readable name for narration (always the real name — ADR-0033). */
  readonly displayName: string;
  /** `true` only for the PC adapter. */
  readonly isPlayer: boolean;

  /** Defeated actors cannot act and are excluded from most resolutions. */
  isDefeated(): boolean;

  /** Live inventory (mutated through `Inventory` methods, not via the actor). */
  getInventory(): Inventory;
  /** Live stats (skills/attributes/perks). */
  getStats(): CharacterStats;
  /** Ground position (XZ plane). */
  getPosition(): Point2;
  /** Live HP state. */
  getHealth(): Health;
  /**
   * The actor's disposition toward another actor by id. The PC adapter
   * always returns `'neutral'` (PC has no symmetric ledger). NPC adapter
   * reads `NPCAgent.getRelationship`.
   */
  getRelationship(otherId: string): NPCDisposition;
}

/* ────────────────────────────────────────────────────────────────────────── */

/** Live references the PlayerActor adapter wraps. */
export interface PlayerActorRefs {
  controller: PlayerController;
  inventory: Inventory;
  stats: CharacterStats;
  /** Display name set in the character creator (e.g. "V"). */
  displayName: string;
}

/**
 * PlayerActor — `Actor` adapter for the human player.
 *
 * The PC has no relationships ledger, so `getRelationship` returns a stable
 * `'neutral'`. Position comes from `PlayerController.getPosition()`
 * (Babylon `Vector3`) converted to `Point2`.
 */
export class PlayerActor implements Actor {
  readonly id = 'player';
  readonly isPlayer = true;
  private readonly refs: PlayerActorRefs;

  constructor(refs: PlayerActorRefs) {
    this.refs = refs;
  }

  get displayName(): string { return this.refs.displayName; }

  isDefeated(): boolean {
    // The player is "defeated" when HP reaches zero — game-over flow handles
    // the transition; the actor view simply reads HP.
    return this.refs.controller.getHealth().isDead();
  }

  getInventory(): Inventory { return this.refs.inventory; }
  getStats(): CharacterStats { return this.refs.stats; }
  getHealth(): Health { return this.refs.controller.getHealth(); }

  getPosition(): Point2 {
    const v = this.refs.controller.getPosition();
    return { x: v.x, z: v.z };
  }

  /** PC has no ledger — always neutral toward everyone. */
  getRelationship(_otherId: string): NPCDisposition { return 'neutral'; }
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * NpcActor — `Actor` adapter for any live NPC. Delegates most getters to the
 * underlying `NPCAgent`. `CharacterStats` is passed in at construction time
 * because NPCs do not (yet) carry per-NPC stat blocks — the scene computes
 * them via a shared `enemyStatsFor(agent)` helper and hands the result here.
 *
 * Cheap to create; the scene constructs a fresh `NpcActor` per resolution
 * call rather than caching, which avoids stale references when the underlying
 * agent state changes.
 */
export class NpcActor implements Actor {
  readonly isPlayer = false;
  private readonly agent: NPCAgent;
  private readonly stats: CharacterStats;

  constructor(agent: NPCAgent, stats: CharacterStats) {
    this.agent = agent;
    this.stats = stats;
  }

  get id(): string { return this.agent.definition.id; }
  get displayName(): string { return this.agent.getDisplayName(); }

  isDefeated(): boolean { return this.agent.isDefeated(); }
  getInventory(): Inventory { return this.agent.getInventory(); }
  getStats(): CharacterStats { return this.stats; }
  getHealth(): Health { return this.agent.getHealth(); }

  getPosition(): Point2 {
    const v = this.agent.getPosition();
    return { x: v.x, z: v.z };
  }

  getRelationship(otherId: string): NPCDisposition { return this.agent.getRelationship(otherId); }
}
