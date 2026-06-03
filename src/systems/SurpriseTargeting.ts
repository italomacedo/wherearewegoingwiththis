/**
 * Pure geometry for the out-of-combat **surprise attack** targeting (Phase 11).
 *
 * The browser layer (GameWorldScene) casts a ground ray under the cursor and asks
 * these helpers which living NPC is being aimed at and whether it is within reach.
 * Kept pure (no engine) so the picking/range logic is unit-tested; only the ray +
 * ring rendering live in the istanbul-ignored scene glue.
 */

import { Point2, distance2 } from '@systems/combat/CombatMath';

/** An aim-able entity: an id and its ground position. */
export interface AimTarget {
  id: string;
  pos: Point2;
}

/** True when `b` is within `range` metres of `a` (inclusive). */
export function withinRange(a: Point2, b: Point2, range: number): boolean {
  return distance2(a, b) <= range;
}

/**
 * The target nearest to a ground `point`, but only if it lies within `radius`
 * metres of that point (a generous click radius). Null when none qualifies.
 * Self/already-excluded entities must be filtered by the caller.
 */
export function nearestToPoint(
  targets: readonly AimTarget[], point: Point2, radius: number,
): AimTarget | null {
  let best: AimTarget | null = null;
  let bestD = radius;
  for (const t of targets) {
    const d = distance2(point, t.pos);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}
