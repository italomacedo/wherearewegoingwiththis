/**
 * Unified action Resolver (Fase 21).
 *
 * `resolveAction(actor, verb, target?, options?, rng?) → ResolveResult`
 *
 * The pure heart of the action pipeline. Takes any actor (PC or NPC), any
 * verb (verbal / emote / autonomy), any optional target, and returns a
 * `ResolveResult` describing whether the action is allowed, whether a check
 * was rolled, the success/critical state, and the list of `Mutation`s the
 * Applier should execute. No Babylon, no save, no I/O.
 *
 * For SKILL-driven emote effects (steal/info/heal/sabotage/coerce/craft/
 * repair/persuade/intimidate/disarm), the Resolver delegates to the
 * pre-existing `resolveSkillAction` in `skills/SkillActions.ts` and
 * **lifts** its `SkillMutation`s into actor-explicit `Mutation`s. For the
 * NEW verbs (job_*, commerce_*, manipulate, examine_self, narrate_time,
 * autonomy locomotion) the Resolver implements branches directly.
 *
 * Decisions baked in here:
 *   - #3 `narrative` = pure no-op (no check, no XP).
 *   - #10 `commerce_haggle` without `pendingTrade` → falls through to
 *     `commerce_discovery` (game lists what's for sale instead of blocking).
 *   - #12 Learn-by-doing: every rolled check (success OR failure) emits an
 *     `apply_skill_use` mutation alongside the main mutations.
 *   - Commerce haggle skill check uses Comércio vs Carisma (resistido), with
 *     0.85/0.7 factors and a 50% piso of `priceFor(item, neutral)`.
 */

import {
  Mutation, RewardOffer, Point2,
} from './Mutations';
import { Actor } from './Actor';
import { VerbalVerb, EmoteVerb, AutonomyVerb, isVerbalVerb, isEmoteVerb, isAutonomyVerb } from './Verbs';
import {
  resolveSkillAction, SkillActionInput, SkillActionResult, SkillTargetInfo, SkillMutation,
  SKILL_ACTION_RADIUS,
} from '@systems/skills/SkillActions';
import { SkillEffect } from '@systems/npc/EmoteIntent';
import { resolveCheck, RollFn, defaultRoll } from '@systems/SkillCheck';
import { checkValue } from '@entities/CharacterStats';

/**
 * A natural d100 below this on a successful check = CRITICAL (doubles social
 * effect steps). Mirrors `SKILL_CRITICAL_ROLL` in SkillActions.
 */
const RESOLVER_CRITICAL_ROLL = 5;

/** Haggle floor: 50 % of the item's neutral-disposition base price (decision in plan). */
export const HAGGLE_FLOOR_FACTOR = 0.5;
/** Normal-success haggle multiplier (15 % extra off). */
export const HAGGLE_SUCCESS_FACTOR = 0.85;
/** Critical-success haggle multiplier (30 % extra off). */
export const HAGGLE_CRIT_FACTOR = 0.7;

/** Default credit reward when the game deterministically stages a contract on `job_request`. */
export const DEFAULT_MISSION_REWARD = 30;

/* ────────────────────────────────────────────────────────────────────────── */
/* Result types                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type BlockedReason =
  | 'no_tool'             // missing cyberdeck/scrap/etc.
  | 'no_target'           // verb needs a target NPC, none provided
  | 'dead_target'         // target is defeated
  | 'out_of_range'        // target beyond the verb's reach
  | 'self_only'           // verb cannot target self
  | 'no_pending_trade'    // commerce_buy/haggle when nothing is on the table
  | 'no_pending_mission'  // job_accept/decline when no offer is pending
  | 'no_active_mission'   // job_claim/cancel when player has no active contract
  | 'target_alive'        // job_claim when the contract target is still alive
  | 'no_rivals'           // job_request when the giver has no rival to offer
  | 'no_credits_to_pay'   // job_request when the giver has nothing to pay with
  | 'unknown_item'        // commerce verb references unknown item
  | 'unknown_npc';        // referenced npc id not in the world

export interface ResolveResult {
  allowed: boolean;
  blockedReason?: BlockedReason;
  /** True when a covert action resolved without live resistance. */
  surprise: boolean;
  /** True when a check was actually rolled. */
  rolled: boolean;
  success: boolean;
  critical: boolean;
  /** P(success) on the rolled check, 0..1. 1 when not rolled. */
  probability: number;
  /** Natural d100 roll (1..100). 0 when not rolled. */
  roll: number;
  mutations: Mutation[];
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Options — everything the Resolver needs about the world to decide.        */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ResolveOptions {
  // ── Universal context ───────────────────────────────────────────────────
  /** Difficulty bucket for `self` policies (medium = 50 by default). */
  difficulty?: number;
  /** Direction hint for the classifier (`up`/`down`/null). */
  dir?: 'up' | 'down' | null;
  /** Direct skill id override (for emote dispatch). */
  skillId?: string | null;

  // ── Tool gates ──────────────────────────────────────────────────────────
  /** Override of `actor.getInventory().has('cyberdeck')` — useful for tests. */
  hasCyberdeck?: boolean;
  /** Override of `actor.getInventory().has('scrap')`. */
  hasScrap?: boolean;
  /** Weapon id the craft target maps to (used by emote `craft`). */
  craftWeaponId?: string;
  /** Scrap cost to craft `craftWeaponId`. */
  scrapCost?: number;

  // ── Verbal classifier extras ────────────────────────────────────────────
  /** Item id mentioned in commerce verbs. */
  itemId?: string | null;
  /** Player-proposed price for `commerce_haggle`. */
  proposedPrice?: number | null;
  /** A second NPC id referenced by `manipulate` / `info`. */
  otherTargetId?: string | null;

  // ── Commerce state ──────────────────────────────────────────────────────
  /** What this NPC has for sale (validated against the verb's ITEM). */
  npcSellableIds?: readonly string[];
  /** A trade currently on the table (commerce_buy / commerce_haggle). */
  pendingTrade?: { itemId: string; price: number } | null;
  /** Function to compute the base (neutral-disposition) price for the haggle floor. */
  basePriceFor?: (itemId: string) => number;
  /** Function to compute the current price for an item (after disposition discount). */
  priceFor?: (itemId: string) => number;
  /** Item id this NPC consumes for use_item (e.g. 'medkit'). */
  useItemId?: string;
  /** Heal amount when the actor uses `useItemId`. */
  useItemHeal?: number;

  // ── Mission state ───────────────────────────────────────────────────────
  /** NPCs this giver (the actor when it is an NPC) is antagonistic toward. */
  rivalIds?: readonly string[];
  /** NPC ids currently present in the scene (for picking a mission target). */
  presentNpcIds?: readonly string[];
  /** Player's active missions across all givers (by giverId/targetId). */
  activeMissions?: readonly { giverId: string; targetId: string }[];
  /** Pending mission already offered by this NPC. */
  pendingMission?: { targetId: string; reward: RewardOffer } | null;
  /** Default reward (credits) when staging a deterministic mission. */
  defaultMissionReward?: number;
  /** Set of defeated npc ids; used by `job_claim`. */
  defeatedNpcIds?: readonly string[];
  /** Credit balance available in the giver's inventory (for reward clamp). */
  giverCreditBalance?: number;

  // ── Locomotion (autonomy) ───────────────────────────────────────────────
  /** A coordinate `move_to` targets (instead of a target Actor). */
  coord?: Point2;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function ok(): ResolveResult {
  return { allowed: true, surprise: false, rolled: false, success: true, critical: false, probability: 1, roll: 0, mutations: [] };
}

function blocked(reason: BlockedReason): ResolveResult {
  return { allowed: false, blockedReason: reason, surprise: false, rolled: false, success: false, critical: false, probability: 0, roll: 0, mutations: [] };
}

/** Distance² between two Point2 (XZ plane). */
function distance2(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Build a `SkillTargetInfo` (the shape `resolveSkillAction` consumes) from
 * an Actor target. Provides sensible defaults for NPC-side fields when the
 * target is the player.
 */
function targetInfoOf(actor: Actor, target: Actor): SkillTargetInfo {
  const stats = target.getStats();
  return {
    id: target.id,
    otherId: null,
    distance: distance2(actor.getPosition(), target.getPosition()),
    // "Aware" means actively engaged (in conversation / hostile / responding).
    // The pure resolver can't know that without scene context; the caller can
    // pass a stricter awareness via options if needed. Default to TRUE — most
    // chat-triggered actions happen in active conversation.
    aware: true,
    alive: !target.isDefeated(),
    /* istanbul ignore next — defensive defaults; createDefaultStats always populates */
    perception: stats.skills.percepcao ?? 30,
    /* istanbul ignore next */
    infotech: stats.skills.tecnologia_informacao ?? 0,
    /* istanbul ignore next */
    charisma: stats.attributes.carisma ?? 30,
    hasDeck: target.getInventory().has('cyberdeck'),
  };
}

/** Convert legacy `SkillMutation` (player-implicit) → actor-explicit `Mutation`. */
function liftSkillMutation(m: SkillMutation, actor: Actor, _target: Actor | null): Mutation | null {
  const actorId = actor.id;
  switch (m.kind) {
    case 'begin_combat':
      return { kind: 'begin_combat', attacker: actorId, defender: m.targetId, ambush: m.ambush, remote: m.remote };
    case 'steal_item':
      // The thief is the actor; the victim is `m.targetId`.
      return { kind: 'steal_item', from: m.targetId, to: actorId };
    case 'steal_credits':
      // Amount left to the Applier (transfers what the victim has, capped).
      return { kind: 'transfer_credits', from: m.targetId, to: actorId, amount: -1 };
    case 'add_pda':
      return { kind: 'add_pda', subject: m.subjectId, source: 'scanned', from: actorId };
    /* istanbul ignore next — legacy emote `relationship` superseded by verbal `manipulate` */
    case 'alter_relationship':
      return { kind: 'alter_relationship', actor: m.targetId, otherId: m.otherId, dir: m.dir, steps: m.steps };
    /* istanbul ignore next — legacy emote `disposition` superseded by verbal `persuade`/`intimidate` */
    case 'shift_disposition':
      return { kind: 'shift_disposition', target: m.targetId, dir: m.dir, steps: m.steps };
    case 'coerce':
      return { kind: 'coerce', actor: actorId, target: m.targetId, steps: m.steps };
    case 'heal':
      return { kind: 'heal', target: m.targetId ?? actorId, amount: 20 };
    case 'mark_sabotage':
      return { kind: 'mark_sabotage', target: m.targetId };
    case 'repair':
      return { kind: 'repair', actor: actorId };
    case 'craft':
      return { kind: 'craft', actor: actorId, weaponId: '', scrapCost: 0 }; // Applier fills from ctx
    /* istanbul ignore next — legacy mutation shapes the classifier no longer emits */
    case 'haggle':
    /* istanbul ignore next */
    case 'appraise':
      return null;
    /* istanbul ignore next — defensive; no SkillMutation kind falls through today */
    default:
      return null;
  }
}

/** Lift a SkillActionResult → ResolveResult. */
function liftSkillResult(res: SkillActionResult, actor: Actor, target: Actor | null, skillId?: string | null): ResolveResult {
  if (!res.allowed) {
    return {
      allowed: false,
      /* istanbul ignore next — `?? 'no_target'` defensive: SkillActions always sets blockedReason on !allowed */
      blockedReason: (res.blockedReason as BlockedReason) ?? 'no_target',
      surprise: false, rolled: false, success: false, critical: false, probability: 0, roll: 0, mutations: [],
    };
  }
  const mutations: Mutation[] = [];
  for (const sm of res.mutations) {
    const lifted = liftSkillMutation(sm, actor, target);
    if (lifted) mutations.push(lifted);
  }
  // Learn-by-doing: every rolled check (success OR fail) earns XP on the skill (decision #12).
  if (res.rolled && skillId) {
    mutations.push({ kind: 'apply_skill_use', actor: actor.id, skillId });
  }
  return {
    allowed: true,
    surprise: res.surprise,
    rolled: res.rolled,
    success: res.success,
    critical: res.critical,
    probability: res.probability,
    roll: res.roll,
    mutations,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main entry point                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The channel a verb is being emitted on. Some verbs (`info`, `persuade`,
 * `intimidate`, `attack`, `steal`, `sabotage`, `heal`, `manipulate`,
 * `commerce_pricing`, `narrative`) exist in MORE THAN ONE vocabulary with
 * DIFFERENT semantics, so the caller must say which channel produced it:
 *
 *   - `verbal`    — PC speech (no *emote*), verbal classifier output.
 *                   `info` = ASK a 3rd-party question; `persuade`/`intimidate`
 *                   = verbal-only social pressure.
 *   - `emote`     — PC emote (`*action*`), emote classifier output.
 *                   `info` = hack/scan extraction; `persuade`/`intimidate`
 *                   = physical-action variants.
 *   - `autonomy`  — NPC deliberation output. Locomotion primitives
 *                   (move_to/flee_from/wait/talk_to/use_item) plus the
 *                   relevant subset of verbal/emote verbs.
 */
export type Channel = 'verbal' | 'emote' | 'autonomy';

/** The unified action resolver. */
export function resolveAction(
  actor: Actor,
  verb: VerbalVerb | EmoteVerb | AutonomyVerb,
  target: Actor | null = null,
  options: ResolveOptions = {},
  rng: RollFn = defaultRoll,
  channel: Channel = 'verbal',
): ResolveResult {
  // narrative / no-op (decision #3) — no check, no XP, no mutation.
  if (verb === 'narrative') return ok();

  // ── Channel-specific dispatch ───────────────────────────────────────────
  if (channel === 'verbal') {
    if (isVerbalVerb(verb)) {
      return resolveVerbal(actor, verb as Exclude<VerbalVerb, 'narrative'>, target, options, rng);
    }
    // A non-verbal verb on the verbal channel = unknown → narrative no-op.
    return ok();
  }

  if (channel === 'autonomy') {
    if (verb === 'move_to' || verb === 'flee_from' || verb === 'wait' || verb === 'talk_to' || verb === 'use_item') {
      return resolveAutonomy(actor, verb, target, options);
    }
    // NPC emitting a verb from the verbal/emote subset → treat as emote action.
    /* istanbul ignore next — branch exercised in 21G when NPC autonomy expands its vocab */
    if (isEmoteVerb(verb) || isAutonomyVerb(verb)) {
      return resolveEmoteOrAutonomyAction(actor, verb as EmoteVerb, target, options, rng);
    }
    /* istanbul ignore next — defensive */
    return ok();
  }

  // channel === 'emote'
  if (verb === 'examine_self') {
    const skillValue = checkValue(actor.getStats(), 'medicina', 'inteligencia');
    /* istanbul ignore next — `?? 50` defensive */
    const check = resolveCheck({ value: skillValue, opponent: options.difficulty ?? 50 }, rng);
    return {
      allowed: true, surprise: false, rolled: true,
      success: check.success, critical: check.success && check.roll < RESOLVER_CRITICAL_ROLL,
      probability: check.probability, roll: check.roll,
      mutations: [
        { kind: 'examine_self', actor: actor.id, success: check.success },
        { kind: 'apply_skill_use', actor: actor.id, skillId: 'medicina' },
      ],
    };
  }
  if (verb === 'narrate_time') {
    return { ...ok(), mutations: [{ kind: 'narrate_time' }] };
  }
  if (isEmoteVerb(verb)) {
    return resolveEmoteOrAutonomyAction(actor, verb as EmoteVerb, target, options, rng);
  }
  return ok();
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Verbal branch                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function resolveVerbal(
  actor: Actor,
  verb: Exclude<VerbalVerb, 'narrative'>,
  target: Actor | null,
  o: ResolveOptions,
  rng: RollFn,
): ResolveResult {
  // The "giver" in a verbal exchange is the addressed NPC (= `target`).
  // The "player" is the actor when verbal verbs come from the PC. For NPC↔NPC,
  // the actor is the speaker and target the listener.

  switch (verb) {
    case 'job_request': {
      if (!target) return blocked('no_target');
      if (target.isDefeated()) return blocked('dead_target');
      /* istanbul ignore next — defensive defaults; the scene always supplies these. */
      const rivals = (o.rivalIds ?? []).filter((id) => id !== actor.id && id !== target.id);
      if (rivals.length === 0) return blocked('no_rivals');
      /* istanbul ignore next */
      const targetId = pickMissionTargetId(rivals, o.presentNpcIds ?? []);
      /* istanbul ignore next */
      const balance = o.giverCreditBalance ?? 0;
      if (balance <= 0) return blocked('no_credits_to_pay');
      /* istanbul ignore next */
      const credits = Math.min(o.defaultMissionReward ?? DEFAULT_MISSION_REWARD, balance);
      return {
        ...ok(),
        mutations: [{
          kind: 'stage_pending_mission',
          giver: target.id,
          targetId,
          reward: { kind: 'credits', credits },
        }],
      };
    }

    case 'job_accept': {
      if (!target) return blocked('no_target');
      if (!o.pendingMission) return blocked('no_pending_mission');
      return { ...ok(), mutations: [{ kind: 'accept_pending_mission', giver: target.id }] };
    }

    case 'job_decline': {
      if (!target) return blocked('no_target');
      if (!o.pendingMission) return blocked('no_pending_mission');
      return { ...ok(), mutations: [{ kind: 'decline_pending_mission', giver: target.id }] };
    }

    case 'job_cancel': {
      if (!target) return blocked('no_target');
      /* istanbul ignore next — `?? []` defensive */
      const active = (o.activeMissions ?? []).find((m) => m.giverId === target.id);
      if (!active) return blocked('no_active_mission');
      return {
        ...ok(),
        mutations: [
          { kind: 'cancel_active_mission', giver: target.id },
          // Cost of cancelling: -1 disposition (decision #14).
          { kind: 'shift_disposition', target: target.id, dir: 'down', steps: 1 },
        ],
      };
    }

    case 'job_claim': {
      if (!target) return blocked('no_target');
      /* istanbul ignore next — `?? []` defensive */
      const active = (o.activeMissions ?? []).find((m) => m.giverId === target.id);
      if (!active) return blocked('no_active_mission');
      /* istanbul ignore next */
      const isDead = (o.defeatedNpcIds ?? []).includes(active.targetId);
      if (!isDead) {
        return { ...ok(), mutations: [{ kind: 'narrate_target_still_alive', targetId: active.targetId }] };
      }
      return {
        ...ok(),
        mutations: [{ kind: 'claim_mission_completion', giver: target.id, targetId: active.targetId }],
      };
    }

    case 'commerce_discovery': {
      if (!target) return blocked('no_target');
      // Index the seller in the PDA — the dossier re-derives a "Sells X for Y cr"
      // line for every sellable item the next time the PDA opens (recomputed live
      // from the NPC's current disposition).
      return { ...ok(), mutations: [{ kind: 'add_pda', subject: target.id, source: 'asked', silent: true }] };
    }

    case 'commerce_pricing': {
      if (!target) return blocked('no_target');
      if (!o.itemId) return blocked('unknown_item');
      if (o.npcSellableIds && !o.npcSellableIds.includes(o.itemId)) return blocked('unknown_item');
      const price = o.priceFor ? o.priceFor(o.itemId) : 0;
      return {
        ...ok(),
        // Stage the pending trade AND index the price discovery in the PDA (the
        // dossier rebuild picks up the seller's live inventory + disposition-
        // discounted prices, so a fresh PDA open shows the quote going forward).
        mutations: [
          { kind: 'stage_pending_trade', npc: target.id, itemId: o.itemId, price },
          { kind: 'add_pda', subject: target.id, source: 'asked', silent: true },
        ],
      };
    }

    case 'commerce_haggle': {
      if (!target) return blocked('no_target');
      // Fallback decision #10: no pending trade → fall through to commerce_discovery.
      if (!o.pendingTrade) {
        return ok(); // Applier just lists the NPC's wares (commerce_discovery semantics).
      }
      // Skill check: Comércio vs the NPC's Carisma.
      const skillValue = checkValue(actor.getStats(), 'comercio', 'carisma');
      /* istanbul ignore next — `?? 30` is defensive; createDefaultStats always populates carisma */
      const opp = target.getStats().attributes.carisma ?? 30;
      const check = resolveCheck({ value: skillValue, opponent: opp }, rng);
      const critical = check.success && check.roll < RESOLVER_CRITICAL_ROLL;
      const mutations: Mutation[] = [
        { kind: 'apply_skill_use', actor: actor.id, skillId: 'comercio' },
        // Index the negotiation in the PDA on EVERY haggle — the dossier line
        // will reflect the haggled price via the active pendingTrade.
        { kind: 'add_pda', subject: target.id, source: 'asked', silent: true },
      ];
      if (check.success) {
        const factor = critical ? HAGGLE_CRIT_FACTOR : HAGGLE_SUCCESS_FACTOR;
        mutations.push({ kind: 'apply_haggle_discount', npc: target.id, factor });
      }
      return {
        allowed: true, surprise: false, rolled: true,
        success: check.success, critical,
        probability: check.probability, roll: check.roll,
        mutations,
      };
    }

    case 'commerce_buy': {
      if (!target) return blocked('no_target');
      // No pending trade → silently no-op (don't block). The player may have
      // already bought it in the previous turn (the classifier picks "I want
      // X" + "Deal" as TWO buys in sequence), and a hard block here would
      // surface "no_pending_trade" noise. Let the NPC's reply handle it
      // diegetically ("we're settled" / "what did you want?").
      if (!o.pendingTrade) return ok();
      return { ...ok(), mutations: [{ kind: 'execute_pending_trade', npc: target.id }] };
    }

    case 'commerce_sell': {
      // Reserved — vocab accepts but resolver does nothing (deferred).
      return ok();
    }

    case 'manipulate': {
      if (!target) return blocked('no_target');
      if (!o.otherTargetId) return blocked('no_target');
      const skillValue = checkValue(actor.getStats(), 'persuasao', 'carisma');
      /* istanbul ignore next — `?? 30` is defensive; createDefaultStats always populates carisma */
      const opp = target.getStats().attributes.carisma ?? 30;
      const check = resolveCheck({ value: skillValue, opponent: opp }, rng);
      const critical = check.success && check.roll < RESOLVER_CRITICAL_ROLL;
      /* istanbul ignore next — `?? 'down'` defensive */
      const dir = o.dir ?? 'down';
      const steps = critical ? 2 : 1;
      const mutations: Mutation[] = [{ kind: 'apply_skill_use', actor: actor.id, skillId: 'persuasao' }];
      if (check.success) {
        mutations.push({ kind: 'alter_relationship', actor: target.id, otherId: o.otherTargetId, dir, steps });
      }
      return { allowed: true, surprise: false, rolled: true, success: check.success, critical, probability: check.probability, roll: check.roll, mutations };
    }

    case 'persuade': {
      if (!target) return blocked('no_target');
      const skillValue = checkValue(actor.getStats(), 'persuasao', 'carisma');
      /* istanbul ignore next — `?? 30` is defensive; createDefaultStats always populates carisma */
      const opp = target.getStats().attributes.carisma ?? 30;
      const check = resolveCheck({ value: skillValue, opponent: opp }, rng);
      const critical = check.success && check.roll < RESOLVER_CRITICAL_ROLL;
      const steps = critical ? 2 : 1;
      const mutations: Mutation[] = [{ kind: 'apply_skill_use', actor: actor.id, skillId: 'persuasao' }];
      if (check.success) {
        // Success → disposition UP. Failure → no penalty (decision: assimetria).
        mutations.push({ kind: 'shift_disposition', target: target.id, dir: 'up', steps });
      }
      return { allowed: true, surprise: false, rolled: true, success: check.success, critical, probability: check.probability, roll: check.roll, mutations };
    }

    case 'intimidate': {
      if (!target) return blocked('no_target');
      const skillValue = checkValue(actor.getStats(), 'intimidacao', 'carisma');
      /* istanbul ignore next — `?? 30` is defensive; createDefaultStats always populates carisma */
      const opp = target.getStats().attributes.carisma ?? 30;
      const check = resolveCheck({ value: skillValue, opponent: opp }, rng);
      const critical = check.success && check.roll < RESOLVER_CRITICAL_ROLL;
      const steps = critical ? 2 : 1;
      const mutations: Mutation[] = [{ kind: 'apply_skill_use', actor: actor.id, skillId: 'intimidacao' }];
      if (check.success) {
        // Compliance via fear: target's stance softens (UP) but the relationship sours.
        mutations.push({ kind: 'shift_disposition', target: target.id, dir: 'up', steps });
      } else {
        // Failure asymmetry (decision): -1 disposition + hostile_reaction may escalate.
        mutations.push({ kind: 'shift_disposition', target: target.id, dir: 'down', steps: 1 });
        mutations.push({ kind: 'hostile_reaction', target: target.id });
      }
      return { allowed: true, surprise: false, rolled: true, success: check.success, critical, probability: check.probability, roll: check.roll, mutations };
    }

    case 'info': {
      // Player asks the NPC about a third party. Resolved via Persuasão vs the
      // NPC's trust in the player (disposition magnitude proxy). Success → PDA
      // entry with source='asked' (the line is filled by the Applier from the
      // NPC's reply).
      if (!target) return blocked('no_target');
      /* istanbul ignore next — `?? null` defensive */
      const subjectId = o.otherTargetId ?? null;
      if (!subjectId) return blocked('no_target');
      const skillValue = checkValue(actor.getStats(), 'persuasao', 'carisma');
      // Trust opponent value: charisma + a +/- for the NPC's disposition toward us.
      /* istanbul ignore next — `?? 30` defensive */
      const opp = (target.getStats().attributes.carisma ?? 30) + (target.getRelationship(actor.id) === 'wary' ? 20 : 0);
      const check = resolveCheck({ value: skillValue, opponent: opp }, rng);
      const critical = check.success && check.roll < RESOLVER_CRITICAL_ROLL;
      const mutations: Mutation[] = [{ kind: 'apply_skill_use', actor: actor.id, skillId: 'persuasao' }];
      if (check.success) {
        mutations.push({ kind: 'add_pda', subject: subjectId, source: 'asked', from: target.id });
      }
      return { allowed: true, surprise: false, rolled: true, success: check.success, critical, probability: check.probability, roll: check.roll, mutations };
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Autonomy branch                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

function resolveAutonomy(
  actor: Actor,
  verb: 'move_to' | 'flee_from' | 'wait' | 'talk_to' | 'use_item',
  target: Actor | null,
  o: ResolveOptions,
): ResolveResult {
  switch (verb) {
    case 'wait':
      return { ...ok(), mutations: [{ kind: 'wait', actor: actor.id }] };

    case 'move_to': {
      if (!target && !o.coord) return blocked('no_target');
      return {
        ...ok(),
        mutations: [{ kind: 'move_to', actor: actor.id, target: target?.id, coord: o.coord }],
      };
    }

    case 'flee_from': {
      if (!target) return blocked('no_target');
      return { ...ok(), mutations: [{ kind: 'flee_from', actor: actor.id, threat: target.id }] };
    }

    case 'talk_to': {
      if (!target) return blocked('no_target');
      if (target.isDefeated()) return blocked('dead_target');
      return { ...ok(), mutations: [{ kind: 'talk_to', actor: actor.id, target: target.id }] };
    }

    case 'use_item': {
      const itemId = o.useItemId;
      if (!itemId) return blocked('unknown_item');
      if (!actor.getInventory().has(itemId)) return blocked('no_tool');
      return { ...ok(), mutations: [{ kind: 'use_item', actor: actor.id, itemId }] };
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Emote / Autonomy SKILL action branch (delegates to SkillActions)          */
/* ────────────────────────────────────────────────────────────────────────── */

function resolveEmoteOrAutonomyAction(
  actor: Actor,
  verb: EmoteVerb | AutonomyVerb,
  target: Actor | null,
  o: ResolveOptions,
  rng: RollFn,
): ResolveResult {
  // Translate the verb to the SkillEffect the legacy resolver understands.
  const effect = verb as SkillEffect; // slim vocab is a strict subset of SkillEffect now.
  const inv = actor.getInventory();
  const inputTarget: SkillTargetInfo | null = target ? targetInfoOf(actor, target) : null;
  const skillId = o.skillId ?? null;
  // When a skill id is given, checkValue uses skill % directly; the attribute
  // arg is a no-op. When skill is null, fall back to a fixed 30 (the classifier
  // dispatches to attribute checks separately).
  const skillValue = skillId
    ? checkValue(actor.getStats(), skillId, 'inteligencia')
    : 30;
  const input: SkillActionInput = {
    effect,
    skillId,
    skillValue,
    difficulty: o.difficulty ?? 50,
    dir: o.dir ?? null,
    hasCyberdeck: o.hasCyberdeck ?? inv.has('cyberdeck'),
    hasScrap: o.hasScrap ?? inv.has('scrap'),
    target: inputTarget,
  };
  const res = resolveSkillAction(input, rng);
  return liftSkillResult(res, actor, target, skillId);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Pure deterministic target picker for `job_request`.                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Deterministically choose a rival to offer for assassination: prefer the
 * first rival that is physically present in the scene, otherwise the first
 * rival on the ledger. Returns the rival id.
 */
export function pickMissionTargetId(
  rivalIds: readonly string[],
  presentNpcIds: readonly string[],
): string {
  const present = rivalIds.find((id) => presentNpcIds.includes(id));
  return present ?? rivalIds[0]!;
}

/**
 * Apply the haggle factor to a current price, clamped by the floor (50% of
 * the item's neutral-disposition base price). Pure helper exposed for the
 * Applier; tested directly.
 */
export function applyHaggleFactor(
  currentPrice: number,
  factor: number,
  basePriceNeutral: number,
): number {
  const next = Math.round(currentPrice * factor);
  const floor = Math.max(1, Math.round(basePriceNeutral * HAGGLE_FLOOR_FACTOR));
  return Math.max(next, floor);
}

/** Re-export for downstream symmetry with SkillActions consumers. */
export { SKILL_ACTION_RADIUS };
