/**
 * Mutation Applier (Fase 21).
 *
 * Consumes `Mutation`s emitted by the Resolver and applies them to the live
 * world. Pure dispatch logic lives here; the heavy side-effects (Babylon,
 * save, TTS, NPC state mutations) are abstracted behind an `ApplierContext`
 * interface the scene implements.
 *
 * This module is intentionally THIN — the dispatcher just switches on
 * `mutation.kind` and forwards to the right context method. All
 * implementation details (transferTo, beginCombat, speakNpc, etc.) belong
 * to the scene's `ApplierContext` realisation in 21F.
 *
 * TTS invariant (from the plan): every narrative-emitting mutation calls
 * `ctx.narrate(line, voice, agent?)`. This is the SINGLE seam that triggers
 * Kokoro TTS — if a mutation produces narration without going through it,
 * the game goes silent on that path (regression).
 */

import { Mutation, RewardOffer, Point2 } from './Mutations';

/**
 * The world view + side-effect surface the Applier needs. The scene
 * implements this against its live refs (player, npcManager, save, dialog,
 * audio, …). The Applier itself never imports Babylon / save / GUI.
 *
 * Methods are grouped by domain. Each branch of `applyMutation` calls a few
 * of these — that mapping IS the wiring contract between the action layer
 * and the scene.
 */
export interface ApplierContext {
  // ── Inventory & credits ──────────────────────────────────────────────
  /** Move N units of `itemId` from one actor's inventory to another, capped by the source. */
  transferItem(from: string, to: string, itemId: string | null, qty: number): void;
  /** Move `amount` credits (credsticks) from source actor → target actor; `-1` = all. */
  transferCredits(from: string, to: string, amount: number): void;

  // ── HP ───────────────────────────────────────────────────────────────
  /** Restore `amount` HP on the target actor (clamped to max). */
  heal(target: string, amount: number): void;
  /** Apply `amount` damage to the target actor (clamped to 0). */
  damage(target: string, amount: number, source?: string): void;

  // ── Disposition / relationship ───────────────────────────────────────
  /** Shift the target's disposition toward the player one or more steps. */
  shiftDisposition(target: string, dir: 'up' | 'down', steps: number): void;
  /** Alter the actor's ledger view of `otherId`, one or more steps. */
  alterRelationship(actor: string, otherId: string, dir: 'up' | 'down', steps: number): void;
  /** Apply the canonical "hostile reaction" flow (mood/state/ultimatum). */
  hostileReaction(target: string): void;

  // ── Combat ──────────────────────────────────────────────────────────
  /** Start a combat between `attacker` and `defender`. Ambush & remote flags
   *  honour Phase-11 surprise + Fase-20 IT-remote semantics. */
  beginCombat(attacker: string, defender: string, opts: {
    ambush: boolean; remote: boolean; openingAttack?: 'melee' | 'ranged';
  }): void;
  /** Disarm the target — knock their weapon onto the ground at their feet. */
  disarm(actor: string, target: string): void;

  // ── Sabotage flags ──────────────────────────────────────────────────
  markSabotage(target: string): void;
  clearSabotage(target: string): void;

  // ── PDA ─────────────────────────────────────────────────────────────
  addPdaEntry(subject: string, source: 'asked' | 'scanned', from?: string, lines?: string[], silent?: boolean): void;

  // ── Tamper trace (post-surprise detection loop) ─────────────────────
  seedTamper(target: string, kind: 'theft' | 'hack' | 'social', playerSkillValue: number): void;

  // ── Commerce — pending trade ─────────────────────────────────────────
  stagePendingTrade(npc: string, itemId: string, price: number): void;
  executePendingTrade(npc: string): void;
  applyHaggleDiscount(npc: string, factor: number): void;
  clearPendingTrade(npc: string): void;

  // ── Missions ─────────────────────────────────────────────────────────
  stagePendingMission(giver: string, targetId: string, reward: RewardOffer): void;
  acceptPendingMission(giver: string): void;
  declinePendingMission(giver: string): void;
  claimMissionCompletion(giver: string, targetId: string): void;
  cancelActiveMission(giver: string): void;

  // ── Spice-trafficking job (Fase 22) ──────────────────────────────────
  /** Buy `qty` spice from the dealer at `unitPrice` (credits→dealer, spice→player, open a contract). */
  buySpice(dealer: string, qty: number, unitPrice: number): void;
  /** Sell `qty` spice to the addict at `unitPrice` (spice→addict, credits→player). */
  sellSpice(buyer: string, qty: number, unitPrice: number): void;
  /** Stage an improved resale `unitPrice` for the next sale to this addict (haggle). */
  haggleSpice(buyer: string, unitPrice: number): void;
  /** Report "sold it all" to the dealer — improve disposition + complete the contract (no verification). */
  reportSpice(dealer: string): void;

  // ── Crafting ─────────────────────────────────────────────────────────
  craft(actor: string, weaponId: string, scrapCost: number): void;
  repair(actor: string, itemId?: string): void;

  // ── Locomotion (NPC autonomy) ───────────────────────────────────────
  moveTo(actor: string, target: string | undefined, coord: Point2 | undefined): void;
  fleeFrom(actor: string, threat: string): void;
  wait(actor: string): void;
  talkTo(actor: string, target: string): void;

  // ── Item use (NPC self-medication etc.) ─────────────────────────────
  useItem(actor: string, itemId: string): void;

  // ── Special narrations (replace short-circuits) ─────────────────────
  examineSelf(actor: string, success: boolean): void;
  narrateTime(): void;
  /** Narrate "the target's still alive" when the player tries to claim too early. */
  narrateTargetAlive(targetId: string): void;

  // ── Learn-by-doing (XP) ─────────────────────────────────────────────
  applySkillUse(actor: string, skillId: string): void;

  // ── Pure narration (TTS invariant; see plan) ────────────────────────
  /**
   * The SINGLE TTS gateway. Every narration-emitting branch routes its
   * line through this method. Voice = `'npc'` (per-NPC Kokoro voice) or
   * `'narrator'` (narrator voice). `agentId` is required for `voice='npc'`.
   *
   * This is the architectural invariant from the Fase 21 plan: 12 legacy
   * call sites of `speakNpc`/`speakNarration` collapse into ONE seam here.
   */
  narrate(line: string, voice: 'npc' | 'narrator', agentId?: string): void;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Dispatcher                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Apply a single mutation by dispatching to the right ApplierContext method.
 *
 * Pure switch + delegation: no Babylon, no save, no GUI. The scene's
 * `ApplierContext` carries those. Exhaustive over `Mutation['kind']` — adding
 * a new mutation kind will produce a `default` fall-through that returns
 * silently (defensive). All branches call AT MOST one or two context methods.
 */
export function applyMutation(ctx: ApplierContext, m: Mutation): void {
  switch (m.kind) {
    // ── Inventory & credits ──
    case 'steal_item':
      ctx.transferItem(m.from, m.to, m.itemId ?? null, 1);
      return;
    case 'transfer_credits':
      ctx.transferCredits(m.from, m.to, m.amount);
      return;

    // ── HP ──
    case 'heal':
      ctx.heal(m.target, m.amount);
      return;
    case 'damage':
      ctx.damage(m.target, m.amount, m.source);
      return;

    // ── Disposition / relationship ──
    case 'shift_disposition':
      ctx.shiftDisposition(m.target, m.dir, m.steps);
      return;
    case 'alter_relationship':
      ctx.alterRelationship(m.actor, m.otherId, m.dir, m.steps);
      return;
    case 'hostile_reaction':
      ctx.hostileReaction(m.target);
      return;

    // ── Combat ──
    case 'begin_combat':
      ctx.beginCombat(m.attacker, m.defender, {
        ambush: m.ambush,
        remote: m.remote,
        openingAttack: m.openingAttack,
      });
      return;
    case 'disarm':
      ctx.disarm(m.actor, m.target);
      return;

    // ── Sabotage flags ──
    case 'mark_sabotage':
      ctx.markSabotage(m.target);
      return;
    case 'clear_sabotage':
      ctx.clearSabotage(m.target);
      return;

    // ── PDA ──
    case 'add_pda':
      ctx.addPdaEntry(m.subject, m.source, m.from, m.lines, m.silent);
      return;

    // ── Tamper ──
    case 'seed_tamper':
      ctx.seedTamper(m.target, m.tamperKind, m.playerSkillValue);
      return;

    // ── Coerce (target hands over an item/credits under threat) ──
    case 'coerce':
      // Implemented as a sequence: worsen disposition + leave the specific
      // transfer/yield to the scene's coerce flow (which today couples the
      // item-or-credits decision to the target's holdings).
      // Applier delegates the full effect via a dedicated branch on ctx.
      ctx.shiftDisposition(m.target, 'down', m.steps);
      // Note: a fuller coerce implementation lives in the scene; this branch
      // covers the disposition side-effect uniformly. The scene-bound "give me
      // your stuff" semantics stay in 21F's resolvePlayerAction follow-up.
      return;

    // ── Commerce — pending trade ──
    case 'stage_pending_trade':
      ctx.stagePendingTrade(m.npc, m.itemId, m.price);
      return;
    case 'execute_pending_trade':
      ctx.executePendingTrade(m.npc);
      return;
    case 'apply_haggle_discount':
      ctx.applyHaggleDiscount(m.npc, m.factor);
      return;
    case 'clear_pending_trade':
      ctx.clearPendingTrade(m.npc);
      return;

    // ── Missions ──
    case 'stage_pending_mission':
      ctx.stagePendingMission(m.giver, m.targetId, m.reward);
      return;
    case 'accept_pending_mission':
      ctx.acceptPendingMission(m.giver);
      return;
    case 'decline_pending_mission':
      ctx.declinePendingMission(m.giver);
      return;
    case 'claim_mission_completion':
      ctx.claimMissionCompletion(m.giver, m.targetId);
      return;
    case 'cancel_active_mission':
      ctx.cancelActiveMission(m.giver);
      return;
    case 'narrate_target_still_alive':
      ctx.narrateTargetAlive(m.targetId);
      return;

    // ── Spice-trafficking job ──
    case 'buy_spice':
      ctx.buySpice(m.dealer, m.qty, m.unitPrice);
      return;
    case 'sell_spice':
      ctx.sellSpice(m.buyer, m.qty, m.unitPrice);
      return;
    case 'haggle_spice':
      ctx.haggleSpice(m.buyer, m.unitPrice);
      return;
    case 'report_spice':
      ctx.reportSpice(m.dealer);
      return;

    // ── Crafting ──
    case 'craft':
      ctx.craft(m.actor, m.weaponId, m.scrapCost);
      return;
    case 'repair':
      ctx.repair(m.actor, m.itemId);
      return;

    // ── Locomotion ──
    case 'move_to':
      ctx.moveTo(m.actor, m.target, m.coord);
      return;
    case 'flee_from':
      ctx.fleeFrom(m.actor, m.threat);
      return;
    case 'wait':
      ctx.wait(m.actor);
      return;
    case 'talk_to':
      ctx.talkTo(m.actor, m.target);
      return;
    case 'use_item':
      ctx.useItem(m.actor, m.itemId);
      return;

    // ── Special narrations ──
    case 'examine_self':
      ctx.examineSelf(m.actor, m.success);
      return;
    case 'narrate_time':
      ctx.narrateTime();
      return;

    // ── Learn-by-doing ──
    case 'apply_skill_use':
      ctx.applySkillUse(m.actor, m.skillId);
      return;

    // ── Pure narration ──
    case 'narrate':
      if (m.line) ctx.narrate(m.line, 'narrator');
      return;

    /* istanbul ignore next — exhaustive over the union; defensive fall-through */
    default: {
      const _exhaustive: never = m;
      return _exhaustive;
    }
  }
}

/**
 * Apply a sequence of mutations in order. Convenience wrapper for the
 * scene's typical "Resolver returns mutations[] → apply them all" path.
 */
export function applyMutations(ctx: ApplierContext, mutations: readonly Mutation[]): void {
  for (const m of mutations) applyMutation(ctx, m);
}
