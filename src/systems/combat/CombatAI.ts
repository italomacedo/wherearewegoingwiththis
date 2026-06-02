/**
 * Deterministic NPC combat policy (pure). Given the enemy's current view of the
 * fight (its AP, the distance, its health and cover, and whether it favours melee
 * or ranged), it picks ONE action. The scene driver calls it repeatedly within a
 * turn — applying each action to the CombatEncounter — until it returns end_turn.
 *
 * Behaviour (owner: "close to melee or shoot; take cover when hurt"):
 *   - Hurt and exposed → take cover once (then keep fighting from cover).
 *   - Melee fighter → close the gap (reserving AP for the strike when it can),
 *     then strike when in range.
 *   - Ranged fighter → shoot while AP allows; spend any leftover on cover.
 *   - Nothing affordable → end the turn.
 */

import { CharacterStats } from '@entities/CharacterStats';
import {
  CombatTuning, DEFAULT_COMBAT_TUNING,
  maxMoveMeters, attackValue, MELEE_RANGE, COVER_PARTIAL,
} from './CombatMath';
import { CombatAction } from './CombatEncounter';

/**
 * The AI returns an abstract action. For 'move' it does NOT pick a destination —
 * it just signals "advance toward my target"; the controller routes the concrete
 * path (around obstacles) and truncates it to the affordable distance, reserving
 * AP for a strike. 'attack' likewise carries no targetId — the controller fills the
 * nearest living foe. Everything else (cover/end_turn) is concrete.
 */

/** HP fraction at or below which the AI prioritises taking cover. */
export const AI_LOW_HP = 0.35;

export interface CombatAIView {
  ap: number;
  distance: number;
  hpFraction: number;
  cover: number;
  /** True if this fighter is better at melee than ranged. */
  prefersMelee: boolean;
  /** Whether the fighter has a firearm (gates ranged) / nearby cover (gates cover). Default true. */
  hasFirearm?: boolean;
  hasCover?: boolean;
  tuning?: CombatTuning;
}

/** Whether a fighter is better with fists/blades than firearms (ties → ranged). */
export function prefersMelee(stats: CharacterStats): boolean {
  return attackValue(stats, 'melee') > attackValue(stats, 'ranged');
}

/** Pick the enemy's next single action for the current encounter state. */
export function chooseCombatAction(view: CombatAIView): CombatAction {
  const tuning = view.tuning ?? DEFAULT_COMBAT_TUNING;
  const { ap, distance, hpFraction, cover } = view;
  const hasFirearm = view.hasFirearm ?? true;
  const hasCover = view.hasCover ?? true;
  // No firearm → forced into melee (until inventory grants a gun).
  const melee = view.prefersMelee || !hasFirearm;

  // 1) Defensive: hurt and exposed → duck into cover (only if cover is available).
  if (hasCover && hpFraction <= AI_LOW_HP && cover < COVER_PARTIAL && ap >= tuning.secondaryCost) {
    return { type: 'cover' };
  }

  if (melee) {
    // 2a) Brawler: close the gap (controller routes it), then strike when in range.
    if (distance > MELEE_RANGE) {
      if (maxMoveMeters(ap, tuning) >= 1) return { type: 'move', attackKind: 'melee' };
      return { type: 'end_turn' };
    }
    if (ap >= tuning.primaryCost) return { type: 'attack', attackKind: 'melee' };
    return { type: 'end_turn' };
  }

  // 2b) Gunner: shoot while AP allows, then spend leftovers on cover.
  if (ap >= tuning.primaryCost) return { type: 'attack', attackKind: 'ranged' };
  if (hasCover && ap >= tuning.secondaryCost && cover < COVER_PARTIAL) return { type: 'cover' };
  return { type: 'end_turn' };
}
