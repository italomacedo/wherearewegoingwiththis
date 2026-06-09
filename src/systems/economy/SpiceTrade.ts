/**
 * SpiceTrade — pure core for the spice-trafficking job (Fase 22). No engine, fully
 * testable.
 *
 * A second kind of NPC job alongside the kill-contract (`Missions.ts`). A NPC with
 * the **dealer** trait and a non-negative stance toward the player (≥ neutral) may
 * OFFER spice in conversation. The player BUYS a lot for X/unit and RESELLS it to
 * any **addict** NPC for ~10X/unit (modulated by the addict's stance + the player's
 * Comércio skill). Returning to the originating dealer and reporting "sold it all"
 * (no verification) improves that dealer's disposition one step.
 *
 * Both traits are PROBABILISTIC + seeded per NPC (`rollSpiceTraits`) so the
 * procedural world is deterministic — a tile's dealers/addicts are identical
 * forever for the same `worldSeed`. Authored NPCs set the traits explicitly.
 */

import type { NPCDisposition } from '@entities/NPCAgent';
import { resolveCheck, RollFn, defaultRoll } from '@systems/SkillCheck';
import { hash32 } from '@systems/world/SeededRng';
import { itemValue } from '@entities/items/ItemCatalog';
import { discountFor } from './Economy';

/** The spice item id (a stackable misc good — the merchandise of this job). */
export const SPICE_ID = 'spice';

/** Units of spice sold per contract lot. */
export const SPICE_LOT = 5;

/** Per-NPC probability of carrying the dealer trait (offers + sells spice to the player). */
export const DEALER_CHANCE = 0.2;
/** Per-NPC probability of carrying the addict trait (buys spice from the player). */
export const ADDICT_CHANCE = 0.25;

/** Base resale markup over the buy value — the headline "10×" of the loop. */
export const RESALE_MULTIPLIER = 10;
/** Extra resale on a successful Comércio check (failure = no penalty). */
export const SPICE_RESALE_SUCCESS_BONUS = 0.15;
/** Extra resale on a CRITICAL Comércio check. */
export const SPICE_RESALE_CRIT_BONUS = 0.3;
/** A natural d100 below this on a successful resale check = CRITICAL. */
export const SPICE_RESALE_CRITICAL_ROLL = 5;

/* ────────────────────────────────────────────────────────────────────────── */
/* Traits                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Roll an NPC's spice traits deterministically from a seed (its unique world id
 * mixed with `worldSeed`). The two draws use FIXED salts so they are independent
 * and stable forever for the same seed.
 */
export function rollSpiceTraits(seed: number): { dealer: boolean; addict: boolean } {
  const dealerRoll = hash32(seed, 1) / 4294967296; // hash32 returns an unsigned 32-bit int
  const addictRoll = hash32(seed, 2) / 4294967296;
  return { dealer: dealerRoll < DEALER_CHANCE, addict: addictRoll < ADDICT_CHANCE };
}

/** A dealer offers/sells spice only when it does not dislike the player (≥ neutral). */
export function canOfferSpice(disposition: NPCDisposition): boolean {
  return disposition === 'neutral' || disposition === 'friendly';
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Pricing                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** What the player pays the dealer per unit (base value × (1 − disposition discount), floored at 1). */
export function spiceBuyPrice(disposition: NPCDisposition): number {
  return Math.max(1, Math.round(itemValue(SPICE_ID) * (1 - discountFor(disposition))));
}

export interface SpiceResale {
  /** Credits the addict pays per unit. */
  unit: number;
  success: boolean;
  critical: boolean;
  probability: number;
  roll: number;
}

/**
 * Per-unit resale price to an addict: base `RESALE_MULTIPLIER × value`, boosted by a
 * Comércio (vs the addict's Carisma) haggle check AND a premium for a friendlier
 * addict (reusing `discountFor` as a positive premium). Failure = no penalty (base).
 * RNG injected; `resolveCheck` rolls one d100 (rng ∈ [0,1)).
 */
export function spiceResaleUnit(
  disposition: NPCDisposition,
  comercio: number,
  carisma: number,
  rng: RollFn = defaultRoll,
): SpiceResale {
  const base = RESALE_MULTIPLIER * itemValue(SPICE_ID);
  const check = resolveCheck({ value: comercio, opponent: carisma }, rng);
  const critical = check.success && check.roll < SPICE_RESALE_CRITICAL_ROLL;
  const haggleBonus = critical ? SPICE_RESALE_CRIT_BONUS : check.success ? SPICE_RESALE_SUCCESS_BONUS : 0;
  // A friendlier addict pays a small premium (friendly +30% / neutral +15% / wary +0%).
  const premium = discountFor(disposition);
  const unit = Math.max(1, Math.round(base * (1 + haggleBonus + premium)));
  return { unit, success: check.success, critical, probability: check.probability, roll: check.roll };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Contract                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export type SpiceContractStatus = 'active' | 'complete';

/** A trafficking contract: the player bought a lot from `dealerId` and owes nothing
 *  but a "sold it all" report to earn the relationship bump. One active per dealer. */
export interface SpiceContract {
  id: string;
  dealerId: string;
  /** Units bought (flavour — the report does NOT verify how many were resold). */
  qty: number;
  status: SpiceContractStatus;
}

/** Deterministic id for a dealer's contract (one live contract per dealer). */
export function spiceContractId(dealerId: string): string {
  return `spice_${dealerId}`;
}

/** Create a fresh active contract for a dealer. */
export function makeSpiceContract(dealerId: string, qty: number): SpiceContract {
  return { id: spiceContractId(dealerId), dealerId, qty: Math.max(0, Math.floor(qty)), status: 'active' };
}

/** Mark a contract complete (the report handshake — no sales verification). */
export function completeSpiceReport(c: SpiceContract): SpiceContract {
  return { ...c, status: 'complete' };
}
