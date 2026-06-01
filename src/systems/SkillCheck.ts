/**
 * cRPG check resolution (pure; RNG injectable for tests). The value tested comes
 * from CharacterStats.checkValue (skill% if the action fits a skill, else the
 * governing attribute%). Results are NARRATED with no numbers in-game (Phase 4).
 *
 * Rules (owner-specified):
 *  - Unresisted: roll d100; SUCCESS if the roll is UNDER the value%.
 *  - Contested: each side scores roll × value%; the higher score wins; ties go
 *    to the target (the resisting character / defender).
 */

export type RollFn = () => number; // returns [0, 1)
export const defaultRoll: RollFn = Math.random;

/** A d100 roll in [0, 100). */
export function rollD100(rng: RollFn = defaultRoll): number {
  return rng() * 100;
}

export interface UnresistedResult {
  success: boolean;
  roll: number;
  value: number;
}

/** Non-contested check: success when the d100 roll is under the value%. */
export function resolveUnresisted(value: number, rng: RollFn = defaultRoll): UnresistedResult {
  const roll = rollD100(rng);
  return { success: roll < value, roll, value };
}

export interface ContestedResult {
  actorWins: boolean;
  actorScore: number;
  targetScore: number;
  actorRoll: number;
  targetRoll: number;
}

/**
 * Contested check: actorScore = actorRoll × actorValue%, likewise for the target.
 * Higher score wins; a tie goes to the target (defender).
 */
export function resolveContested(
  actorValue: number,
  targetValue: number,
  rng: RollFn = defaultRoll
): ContestedResult {
  const actorRoll = rollD100(rng);
  const targetRoll = rollD100(rng);
  const actorScore = actorRoll * actorValue;
  const targetScore = targetRoll * targetValue;
  return { actorWins: actorScore > targetScore, actorScore, targetScore, actorRoll, targetRoll };
}
