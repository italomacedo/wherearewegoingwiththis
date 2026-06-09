/**
 * Unified action vocabulary (Fase 21).
 *
 * Three vocabularies share one resolver and applier:
 *
 *   VERBAL    — verbs the PC produces by typing plain speech (no `*emote*`).
 *               15 + narrative. Classified by `classifyVerbal` (Claude one-shot).
 *
 *   EMOTE     — verbs the PC produces by writing an `*action*` (emote).
 *               12 + narrative. Classified by `classifyEmote` (the slim
 *               version of the legacy `classifyAction`).
 *
 *   AUTONOMY  — verbs the NPC produces from its autonomy deliberation
 *               (Claude one-shot, vocab broader than the legacy 4-intent
 *               menu). Includes NPC-only locomotion/iniciative primitives
 *               (`move | flee | wait | talk_to | use_item`) PLUS the
 *               relevant subset of VERBAL and EMOTE verbs — gated at the
 *               resolver (e.g. NPC can only emit `attack` if it has a
 *               weapon, `craft` if it has scrap, etc.).
 *
 * All three feed the same `resolveAction(actor, verb, target?, options) →
 * Mutation[]` resolver. Vocabularies are string-literal union types so
 * `switch` on `verb` exhausts at compile time.
 *
 * Decisions captured here come from the Fase 21 plan Q&A:
 *   - `narrative` is the fall-through "no-op" verb in all three vocabularies
 *     (decision #3 — pure no-op, no skill check, no XP, no mutation).
 *   - `medicine_check` (was `examine_self`) + `narrate_time` are EMOTE verbs
 *     (decision #1 — replace the legacy `isSelfExamEmote` / `isCheckTimeEmote`
 *     short-circuits with first-class verbs).
 *   - `job_cancel` is a VERBAL verb (decision #14 — player can cancel an
 *     accepted contract at the cost of one disposition step).
 *   - `manipulate` is strictly VERBAL (rename of the legacy non-verbal
 *     `relationship`) — gossip/social engineering happens with words.
 *   - `persuade` + `intimidate` exist in BOTH verbal and emote vocabularies
 *     with the failure-mode asymmetry resolved by the resolver, not the
 *     classifier.
 *   - `use_item` is AUTONOMY-only this phase (decision #13 — NPC
 *     self-medication). Other auxiliary NPC verbs (`pickup/drop/equip`)
 *     deferred to Fase 22.
 */

/** Verbs the PC produces by speaking plain text (no `*emote*`). */
export type VerbalVerb =
  // Mission / contract lifecycle.
  | 'job_request'
  | 'job_claim'
  | 'job_accept'
  | 'job_decline'
  | 'job_cancel'
  // Spice-trafficking job (Fase 22): buy a lot from a dealer, resell to addicts,
  // report back to the dealer to earn a relationship step.
  | 'spice_buy'
  | 'spice_sell'
  | 'spice_report'
  // Commerce lifecycle.
  | 'commerce_discovery'
  | 'commerce_pricing'
  | 'commerce_haggle'
  | 'commerce_buy'
  | 'commerce_sell' // reserved; resolver returns "not interested" until wired.
  // Social.
  | 'manipulate' // alter NPC↔3rd-party ledger via talk.
  | 'persuade'
  | 'intimidate'
  | 'info' // ask the NPC what they know about a 3rd party.
  // Fall-through.
  | 'narrative';

/**
 * Verbs the PC produces by writing an `*action*` (emote).
 *
 * Skill-governed verbs read `<skill>_<use_case>` (mirrors the verbal
 * `commerce_*` family): the Medicina pair is `medicine_check` (read your
 * condition) / `medicine_treat` (restore HP). Generic action verbs stay
 * single-word because they route through more than one skill.
 */
export type EmoteVerb =
  | 'attack'
  | 'steal'
  | 'info' // *scan*/*hack his data* — extracts from target's data (vs verbal `info` which asks).
  | 'coerce' // *grabs his collar — give me the chip*
  | 'medicine_treat' // *bandages my wounds* — restore HP (self or another) — Medicina.
  | 'sabotage'
  | 'repair'
  | 'craft'
  | 'persuade'
  | 'intimidate'
  | 'disarm'
  | 'medicine_check' // *check my wounds* — narrates HP band — Medicina (decision #1).
  | 'narrate_time' // *check the time* — narrates current period (decision #1).
  | 'narrative';

/** Verbs the NPC produces by autonomous deliberation. */
export type AutonomyVerb =
  // Locomotion / iniciative primitives — NPC-only (PC moves via WASD).
  | 'move_to'
  | 'flee_from'
  | 'wait'
  | 'talk_to'
  // Self-care — decision #13 (other aux verbs pickup/drop/equip deferred).
  | 'use_item'
  // Subset of EMOTE/VERBAL the NPC may emit (the resolver gates by context):
  | 'attack'
  | 'steal'
  | 'info'
  | 'sabotage'
  | 'medicine_treat' // can target self or another NPC.
  | 'intimidate'
  | 'persuade'
  | 'manipulate'
  | 'commerce_pricing' // NPC may volunteer a quote (deferred wiring; vocab accepts).
  | 'narrative';

/** Any verb in the unified system. Some kinds appear in multiple vocabularies. */
export type Verb = VerbalVerb | EmoteVerb | AutonomyVerb;

/** Vocabulary enumeration helpers (for prompts + parser validation). */
export const VERBAL_VERBS: readonly VerbalVerb[] = [
  'job_request', 'job_claim', 'job_accept', 'job_decline', 'job_cancel',
  'spice_buy', 'spice_sell', 'spice_report',
  'commerce_discovery', 'commerce_pricing', 'commerce_haggle', 'commerce_buy', 'commerce_sell',
  'manipulate', 'persuade', 'intimidate', 'info', 'narrative',
] as const;

export const EMOTE_VERBS: readonly EmoteVerb[] = [
  'attack', 'steal', 'info', 'coerce', 'medicine_treat', 'sabotage', 'repair', 'craft',
  'persuade', 'intimidate', 'disarm', 'medicine_check', 'narrate_time', 'narrative',
] as const;

export const AUTONOMY_VERBS: readonly AutonomyVerb[] = [
  'move_to', 'flee_from', 'wait', 'talk_to', 'use_item',
  'attack', 'steal', 'info', 'sabotage', 'medicine_treat',
  'intimidate', 'persuade', 'manipulate', 'commerce_pricing', 'narrative',
] as const;

/** Type guards for runtime classifier validation (the parser may emit a stray label). */
export function isVerbalVerb(v: string): v is VerbalVerb {
  return (VERBAL_VERBS as readonly string[]).includes(v);
}
export function isEmoteVerb(v: string): v is EmoteVerb {
  return (EMOTE_VERBS as readonly string[]).includes(v);
}
export function isAutonomyVerb(v: string): v is AutonomyVerb {
  return (AUTONOMY_VERBS as readonly string[]).includes(v);
}

/** Fallback for an unparseable / unknown verb — `narrative` in every vocab. */
export const FALLBACK_VERB = 'narrative' as const;
