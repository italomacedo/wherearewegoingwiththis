import type { HungerState } from '@entities/Hunger';
import type { HealthState } from '@entities/Health';

/**
 * SleepSystem — pure rules for sleeping in a bed (no Babylon dep, 100% tested).
 *
 * Owner-decided model:
 *  - Sleeping advances the game clock by 8 hours and simulates the physiological
 *    effects of that span: it consumes ~`SLEEP_HUNGER_COST` of hunger and, while
 *    hunger remains, regenerates HP from it (1:1, capped at the hunger spent AND
 *    the missing HP — i.e. you only heal if you went to bed fed). Hunger hitting
 *    0 mid-sleep simply stops the healing; HP is never lost by sleeping.
 *  - Sleeping grants the temporary "Well Rested" buff for 2 game-hours: 2× on all
 *    learn-by-doing gains (skills/attributes → perk points accelerate with them).
 *  - You can only sleep once every 24 game-hours.
 *
 * Times are in `gameTimeSeconds` (1 game-hour = 3600). `lastSleepGameTime` /
 * `wellRestedUntilGameTime` persist in the save (undefined = never slept / no buff).
 */

/** A full sleep advances the clock by 8 game-hours. */
export const SLEEP_DURATION_SECONDS = 8 * 3600; // 28800
/** Hunger metabolised over an 8-hour sleep (≈ a third of a full belly). */
export const SLEEP_HUNGER_COST = 33;
/** You may sleep once per 24 game-hours. */
export const SLEEP_COOLDOWN_SECONDS = 24 * 3600; // 86400
/** "Well Rested" lasts 2 game-hours after waking. */
export const WELL_RESTED_SECONDS = 2 * 3600; // 7200
/** Multiplier applied to all gains while Well Rested. */
export const WELL_RESTED_MULTIPLIER = 2;

/** True when enough game-time has passed since the last sleep (or never slept). */
export function canSleep(lastSleepGameTime: number | undefined, now: number): boolean {
  if (lastSleepGameTime === undefined) return true;
  return now - lastSleepGameTime >= SLEEP_COOLDOWN_SECONDS;
}

/** game-seconds remaining before the player can sleep again (0 = can sleep now). */
export function sleepCooldownRemaining(lastSleepGameTime: number | undefined, now: number): number {
  if (lastSleepGameTime === undefined) return 0;
  return Math.max(0, SLEEP_COOLDOWN_SECONDS - (now - lastSleepGameTime));
}

export interface SleepResult {
  hunger: HungerState;
  health: HealthState;
  hungerSpent: number;
  hpHealed: number;
}

/**
 * Apply the physiological effect of an 8-hour sleep. Pure: returns fresh
 * Hunger/Health states (does not mutate the inputs).
 */
export function computeSleepResult(input: { hunger: HungerState; health: HealthState }): SleepResult {
  const { hunger, health } = input;
  const hungerSpent = Math.min(hunger.current, SLEEP_HUNGER_COST);
  const missingHp = Math.max(0, health.max - health.current);
  const hpHealed = Math.min(hungerSpent, missingHp);
  return {
    hunger: { current: hunger.current - hungerSpent, max: hunger.max },
    health: { current: health.current + hpHealed, max: health.max },
    hungerSpent,
    hpHealed,
  };
}

/** When the Well Rested buff expires if the player sleeps at `now`. */
export function wellRestedUntil(now: number): number {
  return now + WELL_RESTED_SECONDS;
}

/** True while the Well Rested buff is active. */
export function isWellRested(now: number, until: number | undefined): boolean {
  return until !== undefined && now < until;
}

/** Gain multiplier from the Well Rested buff (2× while active, else 1×). */
export function sleepGainMultiplier(now: number, until: number | undefined): number {
  return isWellRested(now, until) ? WELL_RESTED_MULTIPLIER : 1;
}
