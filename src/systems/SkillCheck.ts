/**
 * cRPG check resolution (pure; RNG injectable for tests). Used by the Phase 4
 * deterministic emote checks and by combat. Results are NARRATED with no numbers
 * in-game.
 *
 * Model (owner-specified) — power-ratio, k=2:
 *   P(success) = atk^k / (atk^k + def^k)
 *   then roll ONE d100: success if roll < P×100.
 *
 *   - atk = the actor's value (skill% if the action fits a skill, else the
 *     governing attribute% — see CharacterStats.checkValue) PLUS the sum of the
 *     actor's modifiers (buffs +, debuffs −).
 *   - def = the opponent's value (contested) or a fixed difficulty (unresisted,
 *     default 50) PLUS the defender's modifiers (cover +20 medium / +40 full,
 *     buffs, …).
 *   - Every buff/debuff/cover is just ±N points on the relevant side's effective
 *     value — one formula composes them all.
 *   - Contested = a SINGLE roll against P(actor wins) — never one roll per side
 *     (that would re-introduce the variance we removed).
 *
 * k tunes decisiveness (k=2 → 80 vs 20 ≈ 94%); the stat gap dominates, luck only
 * decides close calls, and nothing is ever a hard 0%/100%.
 */

export type RollFn = () => number; // returns [0, 1)
export const defaultRoll: RollFn = Math.random;

export const DEFAULT_K = 2;
export const DEFAULT_DIFFICULTY = 50;
/** Effective values are floored here so a debuff can't drive P to a hard 0/1. */
export const MIN_EFFECTIVE = 1;

/** A d100 roll in [0, 100) (for display / narration). */
export function rollD100(rng: RollFn = defaultRoll): number {
  return rng() * 100;
}

/** Effective value = base + modifier, floored at MIN_EFFECTIVE. */
export function effectiveValue(base: number, modifier = 0): number {
  return Math.max(MIN_EFFECTIVE, base + modifier);
}

/** Power-ratio win probability: atk^k / (atk^k + def^k). */
export function winProbability(attacker: number, defender: number, k: number = DEFAULT_K): number {
  const a = Math.pow(Math.max(0, attacker), k);
  const d = Math.pow(Math.max(0, defender), k);
  if (a + d === 0) return 0.5;
  return a / (a + d);
}

/** ±N modifier sums for each side (buffs +, debuffs −; cover is a defender +). */
export interface CheckModifiers {
  attacker?: number;
  defender?: number;
}

export interface CheckResult {
  success: boolean;
  probability: number; // 0..1
  roll: number;        // d100 [0,100)
  attacker: number;    // effective attacker value used
  defender: number;    // effective defender value used
}

/**
 * Resolve a check. `opponent` omitted → unresisted vs `DEFAULT_DIFFICULTY`.
 * Pass `opponent` for a contested check (the other character's value). Modifiers
 * (buffs/debuffs/cover) are ±N on each side. One d100 decides: success if < P.
 */
export function resolveCheck(
  opts: { value: number; opponent?: number; k?: number; mods?: CheckModifiers },
  rng: RollFn = defaultRoll
): CheckResult {
  const k = opts.k ?? DEFAULT_K;
  const attacker = effectiveValue(opts.value, opts.mods?.attacker);
  const defender = effectiveValue(opts.opponent ?? DEFAULT_DIFFICULTY, opts.mods?.defender);
  const probability = winProbability(attacker, defender, k);
  const roll = rng() * 100;
  return { success: roll < probability * 100, probability, roll, attacker, defender };
}
