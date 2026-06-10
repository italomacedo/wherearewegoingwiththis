/**
 * SpiceTrade — pure core for the spice-trafficking job (Fase 22). No engine, fully
 * testable.
 *
 * A second kind of NPC job alongside the kill-contract (`Missions.ts`). The deal is
 * negotiated through the SAME four-phase machine as commerce (discovery → pricing →
 * haggle → commit), but spice flows BOTH ways:
 *   - BUY  — from a `dealer` NPC (≥ neutral stance), the player buys a lot of spice
 *            to run. The player is the buyer → haggle pushes the price DOWN.
 *   - SELL — to an `addict` NPC, the player resells spice at ~10×. The player is the
 *            seller → haggle pushes the price UP.
 * A `spice_buy` (the commit) executes whichever side was staged. Reporting "sold it
 * all" back to the originating dealer improves that dealer's disposition one step.
 *
 * Both NPC traits are PROBABILISTIC + seeded per NPC (`rollSpiceTraits`) so the
 * procedural world is deterministic. Authored NPCs set the traits explicitly.
 */

import type { NPCDisposition } from '@entities/NPCAgent';
import { hash32 } from '@systems/world/SeededRng';
import { itemValue } from '@entities/items/ItemCatalog';
import { discountFor } from './Economy';

/** The spice item id (a stackable misc good — the merchandise of this job). */
export const SPICE_ID = 'spice';

/** Units of spice sold per contract lot (the dealer's wholesale lot). */
export const SPICE_LOT = 5;

/** Per-NPC probability of carrying the dealer trait (offers + sells spice to the player). */
export const DEALER_CHANCE = 0.2;
/** Per-NPC probability of carrying the addict trait (buys spice from the player). */
export const ADDICT_CHANCE = 0.25;

/** Base resale markup over the buy value — the headline "10×" of the loop. */
export const RESALE_MULTIPLIER = 10;

/** Haggle swing on a successful Comércio check (failure = no change). */
export const SPICE_HAGGLE_SUCCESS = 0.15;
/** Haggle swing on a CRITICAL Comércio check. */
export const SPICE_HAGGLE_CRIT = 0.3;
/** A buyer can't haggle a dealer below this fraction of the base wholesale price. */
export const SPICE_BUY_FLOOR_FACTOR = 0.5;
/** A seller can't push the resale above this multiple of the base resale price. */
export const SPICE_SELL_CEIL_FACTOR = 2.0;

/** Which side of a spice deal the player is on. */
export type SpiceSide = 'buy' | 'sell';

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

/**
 * Which side a deal takes given the addressed NPC's traits + whether the player is
 * holding spice. Prefers SELLING to an addict when the player has product; otherwise
 * BUYS from a dealer; falls back to a sell for an addict-only NPC. `null` = neither
 * trait (no spice deal possible).
 */
export function spiceDealSide(isDealer: boolean, isAddict: boolean, playerHasSpice: boolean): SpiceSide | null {
  if (isAddict && playerHasSpice) return 'sell';
  if (isDealer) return 'buy';
  if (isAddict) return 'sell';
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Pricing                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** Base wholesale the player pays a dealer per unit (value × (1 − discount), floored at 1). */
export function spiceBuyPrice(disposition: NPCDisposition): number {
  return Math.max(1, Math.round(itemValue(SPICE_ID) * (1 - discountFor(disposition))));
}

/** Base resale per unit to an addict before haggling (10× value + a friendlier-addict premium). */
export function spiceResaleBase(disposition: NPCDisposition): number {
  const base = RESALE_MULTIPLIER * itemValue(SPICE_ID);
  return Math.max(1, Math.round(base * (1 + discountFor(disposition))));
}

/** The base per-unit price for a side at a disposition (the un-haggled quote). */
export function spiceBasePrice(side: SpiceSide, disposition: NPCDisposition): number {
  return side === 'buy' ? spiceBuyPrice(disposition) : spiceResaleBase(disposition);
}

/**
 * The price multiplier a Comércio haggle yields for a side: a BUYER pushes the price
 * DOWN (factor < 1), a SELLER pushes it UP (factor > 1); failure = no change (1).
 */
export function spiceHaggleFactor(side: SpiceSide, success: boolean, critical: boolean): number {
  const mag = critical ? SPICE_HAGGLE_CRIT : success ? SPICE_HAGGLE_SUCCESS : 0;
  if (mag === 0) return 1;
  return side === 'buy' ? 1 - mag : 1 + mag;
}

/**
 * Apply a haggle factor to a staged price and clamp it: a buy can't fall below
 * `SPICE_BUY_FLOOR_FACTOR × base`; a sell can't rise above `SPICE_SELL_CEIL_FACTOR ×
 * base`. `base` is the un-haggled base price for the side.
 */
export function clampSpicePrice(side: SpiceSide, price: number, base: number): number {
  const p = Math.round(price);
  return side === 'buy'
    ? Math.max(Math.round(base * SPICE_BUY_FLOOR_FACTOR), Math.max(1, p))
    : Math.min(Math.round(base * SPICE_SELL_CEIL_FACTOR), Math.max(1, p));
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
