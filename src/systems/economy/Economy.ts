/**
 * Economy — pure pricing + credit helpers (Phase 16). No engine, fully testable.
 *
 * Money is the `credstick` item (1 credit each), so a player's balance is just the
 * credstick count in their inventory; buying/rewards add/remove credsticks. Valuation
 * is FIXED (catalog `itemValue`); the only modifier is a disposition discount. The
 * agent decides WHICH items to sell — never the price.
 */

import type { NPCDisposition } from '@entities/NPCAgent';
import { Inventory } from '@entities/Inventory';
import { itemValue } from '@entities/items/ItemCatalog';

/** The currency item id (1 unit = 1 credit). */
export const CURRENCY_ID = 'credstick';

/**
 * Trade discount for a disposition (owner-locked): the two highest tiers give the
 * discounts — `friendly` ("ama") 30%, `neutral` ("gosta") 15%; `wary` trades at full
 * price (0%). `hostile` does not trade (also 0 — gated by `canTrade`).
 */
export function discountFor(disposition: NPCDisposition): number {
  switch (disposition) {
    case 'friendly': return 0.30;
    case 'neutral': return 0.15;
    default: return 0; // wary (full price) / hostile (no trade)
  }
}

/** An NPC trades with the player unless it is hostile. */
export function canTrade(disposition: NPCDisposition): boolean {
  return disposition !== 'hostile';
}

/** An NPC may offer a kill-contract unless it hates the player (hostile). */
export function canOfferMission(disposition: NPCDisposition): boolean {
  return disposition !== 'hostile';
}

/** Price the player pays for an item at a disposition (fixed value × (1 − discount)). */
export function priceFor(itemId: string, disposition: NPCDisposition): number {
  return Math.max(0, Math.round(itemValue(itemId) * (1 - discountFor(disposition))));
}

/** Item ids in an inventory that have a sale value (excludes the currency itself). */
export function sellableItems(inv: Inventory): string[] {
  return inv.items
    .map((s) => s.id)
    .filter((id) => id !== CURRENCY_ID && itemValue(id) > 0);
}

// ── Credit balance helpers (over the credstick stack) ──

/** The player's credit balance = number of credsticks held. */
export function creditBalance(inv: Inventory): number {
  return inv.count(CURRENCY_ID);
}

/** Remove `n` credits (credsticks). Returns true if the player could afford it. */
export function payCredits(inv: Inventory, n: number): boolean {
  if (n <= 0) return true;
  if (creditBalance(inv) < n) return false;
  inv.remove(CURRENCY_ID, n);
  return true;
}

/** Grant `n` credits (credsticks), honouring capacity. Returns the amount added. */
export function grantCredits(inv: Inventory, n: number): number {
  if (n <= 0) return 0;
  return inv.addRespectingCapacity(CURRENCY_ID, n);
}
