/**
 * Unified mutation vocabulary (Fase 21).
 *
 * `Mutation` is the discriminated union the Resolver emits and the Applier
 * consumes. Each kind describes a single, atomic change to world state —
 * inventory transfer, HP delta, disposition shift, combat start, etc.
 *
 * All mutations carry **explicit actors** (`actor` / `from` / `to` / `target`)
 * so the Resolver can produce the same kind for both a PC turn and an NPC
 * autonomy turn — there is no implicit "the actor is the player." That is
 * the architectural pivot of Fase 21.
 *
 * The legacy `SkillMutation` in `src/systems/skills/SkillActions.ts` remains
 * as-is for backward compatibility; the Resolver translates it into the
 * actor-explicit shapes here when it delegates to `resolveSkillAction`.
 *
 * See Fase 21 plan (Save schema + Decisions) for the discriminated union
 * design and Q&A-resolved field choices.
 */

import type { NPCDisposition } from '@entities/NPCAgent';

/**
 * Actor identifier. The player is always `'player'`; NPCs use their
 * `NPCDefinition.id` string.
 */
export type ActorId = 'player' | string;

/** Direction for stepped changes (disposition, relationship). */
export type Dir = 'up' | 'down';

/** A ground point in the scene (used by locomotion mutations). */
export interface Point2 { x: number; z: number; }

/**
 * What a giver may offer as a contract reward (Phase 16 reused as-is).
 * Resolved/validated at the Applier boundary against the giver's inventory.
 */
export interface RewardOffer {
  kind: 'credits' | 'item';
  credits?: number;
  itemId?: string;
}

export type Mutation =
  // ─── Inventory / HP / relation (extant primitives, re-shaped) ──────────
  | { kind: 'steal_item'; from: ActorId; to: ActorId; itemId?: string; }
  | { kind: 'transfer_credits'; from: ActorId; to: ActorId; amount: number; }
  | { kind: 'heal'; target: ActorId; amount: number; }
  | { kind: 'damage'; target: ActorId; amount: number; source?: ActorId; }
  | { kind: 'shift_disposition'; target: ActorId; dir: Dir; steps: number; }
  | { kind: 'alter_relationship'; actor: ActorId; otherId: ActorId; dir: Dir; steps: number; }
  | { kind: 'mark_sabotage'; target: ActorId; }
  | { kind: 'clear_sabotage'; target: ActorId; }

  // ─── Combat (entry-point; combat-internal AI stays separate) ────────────
  | {
      kind: 'begin_combat';
      attacker: ActorId;
      defender: ActorId;
      ambush: boolean;
      remote: boolean;
      openingAttack?: 'melee' | 'ranged';
    }
  | { kind: 'disarm'; actor: ActorId; target: ActorId; }

  // ─── Commerce (new — Fase 21) ───────────────────────────────────────────
  | { kind: 'stage_pending_trade'; npc: ActorId; itemId: string; price: number; }
  | { kind: 'execute_pending_trade'; npc: ActorId; }
  | { kind: 'apply_haggle_discount'; npc: ActorId; factor: number; }
  | { kind: 'clear_pending_trade'; npc: ActorId; }

  // ─── Missions (new — substitutes auto-pay; Q&A decisions #11 + #14) ─────
  | { kind: 'stage_pending_mission'; giver: ActorId; targetId: ActorId; reward: RewardOffer; }
  | { kind: 'accept_pending_mission'; giver: ActorId; }
  | { kind: 'decline_pending_mission'; giver: ActorId; }
  | { kind: 'claim_mission_completion'; giver: ActorId; targetId: ActorId; }
  | { kind: 'cancel_active_mission'; giver: ActorId; }
  | { kind: 'narrate_target_still_alive'; targetId: ActorId; }

  // ─── PDA ────────────────────────────────────────────────────────────────
  | {
      kind: 'add_pda';
      subject: ActorId;
      source: 'asked' | 'scanned';
      from?: ActorId;
      lines?: string[];
    }

  // ─── Crafting ───────────────────────────────────────────────────────────
  | { kind: 'craft'; actor: ActorId; weaponId: string; scrapCost: number; }
  | { kind: 'repair'; actor: ActorId; itemId?: string; }

  // ─── Tamper trace (existing — formalised in the union) ──────────────────
  | {
      kind: 'seed_tamper';
      target: ActorId;
      tamperKind: 'theft' | 'hack' | 'social';
      playerSkillValue: number;
    }

  // ─── Hostile reaction (existing — formalised; decision #8) ──────────────
  | { kind: 'hostile_reaction'; target: ActorId; }

  // ─── Coerce (target hands over an item/credits under threat) ────────────
  | { kind: 'coerce'; actor: ActorId; target: ActorId; steps: number; }

  // ─── NPC locomotion / iniciative (autonomy-only) ────────────────────────
  | { kind: 'move_to'; actor: ActorId; target?: ActorId; coord?: Point2; }
  | { kind: 'flee_from'; actor: ActorId; threat: ActorId; }
  | { kind: 'wait'; actor: ActorId; }
  | { kind: 'talk_to'; actor: ActorId; target: ActorId; }
  | { kind: 'use_item'; actor: ActorId; itemId: string; }

  // ─── Special narrations (replaces the legacy short-circuits; decision #1)
  | { kind: 'examine_self'; actor: ActorId; success: boolean; }
  | { kind: 'narrate_time'; }

  // ─── Learn-by-doing side-effect (decision #12) ──────────────────────────
  // Emitted alongside every check rolled by the Resolver (success OR failure).
  // The Applier calls `applySkillUse(stats, skillId, multiplier)`.
  | { kind: 'apply_skill_use'; actor: ActorId; skillId: string; }

  // ─── Pure narration (no-op mechanical; decision #3) ─────────────────────
  // Resolver emits this when the verb is `narrative` — the Applier MAY emit
  // a system/narration line but no world state changes.
  | { kind: 'narrate'; line?: string; };

/** Lookup `kind` of a mutation; useful in tests/asserts. */
export function mutationKind<M extends Mutation>(m: M): M['kind'] {
  return m.kind;
}

/** Convenience: extract all mutations of a specific kind from a list. */
export function mutationsOfKind<K extends Mutation['kind']>(
  list: readonly Mutation[],
  kind: K,
): Extract<Mutation, { kind: K }>[] {
  return list.filter((m): m is Extract<Mutation, { kind: K }> => m.kind === kind);
}

/**
 * Re-export of `NPCDisposition` for downstream importers — keeps the
 * action layer self-contained without forcing every caller to import from
 * `@entities/NPCAgent` directly.
 */
export type { NPCDisposition };
