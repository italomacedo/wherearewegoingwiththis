/**
 * Missions — kill-contracts an NPC offers the player (Phase 16). Pure + testable.
 *
 * The agent PROPOSES a contract in conversation (target + reward); the game VALIDATES
 * it here: the target must be a present NPC the giver is antagonistic toward (its
 * NPC→NPC ledger), and the reward must be grounded in what the giver actually holds
 * (an inventory item, or credits ≤ its credstick balance — clamped). Completing a
 * contract (the target defeated) transfers the reward and improves the giver's
 * disposition by one step.
 */

import type { NPCDisposition } from '@entities/NPCAgent';
import type { Inventory } from '@entities/Inventory';
import { CURRENCY_ID, creditBalance } from './Economy';

/**
 * Mission status:
 *  - `active`     : accepted, awaiting kill (or claim).
 *  - `complete`   : reward already paid.
 *  - `cancelled`  : player voluntarily dropped the contract (Fase 21, decision #14)
 *                   — kept in history rather than removed from the array so the
 *                   PDA can show a record of past contracts.
 */
export type MissionStatus = 'active' | 'complete' | 'cancelled';

/**
 * A trade or mission OFFERED but not yet accepted/declined by the player
 * (Fase 21, decision #11). One offer per `(npcId, kind)` pair — a new offer
 * from the same NPC of the same kind overwrites the previous. Pendings
 * persist cross-session in `SaveGame.pendings`.
 */
export type PendingOffer =
  | {
      kind: 'trade';
      npcId: string;
      itemId: string;
      price: number;
      createdAt: number;
    }
  | {
      kind: 'mission';
      npcId: string;
      targetId: string;
      reward: RewardOffer;
      createdAt: number;
    };

export interface Mission {
  id: string;
  giverId: string;
  targetId: string;
  rewardKind: 'credits' | 'item';
  rewardCredits?: number;
  rewardItemId?: string;
  status: MissionStatus;
}

/** The reward terms parsed from the agent's offer (before validation). */
export interface RewardOffer {
  kind: 'credits' | 'item';
  credits?: number;
  itemId?: string;
}

/** What `validateMissionOffer`/`completeMission` need from the giver NPC. */
export interface MissionGiver {
  isAntagonisticToward(npcId: string): boolean; // wary or hostile on the ledger
  getInventory(): Inventory;
  improveDisposition(): NPCDisposition;
}

/** Deterministic id for a giver→target contract (one live contract per pair). */
export function missionId(giverId: string, targetId: string): string {
  return `mission_${giverId}_${targetId}`;
}

/**
 * Validate an offered contract into a concrete active Mission, or null if invalid.
 * - target must be a DIFFERENT present NPC the giver is antagonistic toward;
 * - an item reward must be one the giver currently holds;
 * - a credit reward is clamped to 1..(giver's balance); 0 balance → invalid.
 */
export function validateMissionOffer(
  giver: MissionGiver,
  giverId: string,
  targetId: string,
  reward: RewardOffer,
  presentNpcIds: readonly string[],
): Mission | null {
  if (!targetId || targetId === giverId) return null;
  if (!presentNpcIds.includes(targetId)) return null;
  if (!giver.isAntagonisticToward(targetId)) return null;

  const inv = giver.getInventory();
  const base = { id: missionId(giverId, targetId), giverId, targetId, status: 'active' as const };

  if (reward.kind === 'item') {
    const itemId = reward.itemId ?? '';
    if (!itemId || !inv.has(itemId)) return null;
    return { ...base, rewardKind: 'item', rewardItemId: itemId };
  }
  // credits
  const balance = creditBalance(inv);
  const credits = Math.min(Math.max(1, Math.floor(reward.credits ?? 0)), balance);
  if (credits <= 0) return null;
  return { ...base, rewardKind: 'credits', rewardCredits: credits };
}

/**
 * Complete a contract: transfer the reward from the giver to the player (capacity-
 * aware), improve the giver's disposition one step, and mark it complete. Returns
 * the updated mission + the amount actually granted (items: 1, credits: transferred).
 */
export function completeMission(
  mission: Mission,
  playerInv: Inventory,
  giver: MissionGiver,
): { mission: Mission; granted: number } {
  const inv = giver.getInventory();
  let granted = 0;
  if (mission.rewardKind === 'item' && mission.rewardItemId) {
    granted = inv.transferTo(playerInv, mission.rewardItemId, 1);
  } else if (mission.rewardKind === 'credits' && mission.rewardCredits) {
    granted = inv.transferTo(playerInv, CURRENCY_ID, mission.rewardCredits);
  }
  giver.improveDisposition();
  return { mission: { ...mission, status: 'complete' }, granted };
}
