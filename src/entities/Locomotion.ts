/**
 * Pure locomotion state machine — maps the player's horizontal speed + input
 * flags to an animation state. No engine access, so it's fully unit-tested
 * under NullEngine (where getDeltaTime ≈ 0). The caller is responsible for the
 * dt≈0 guard when deriving `speed`.
 */
export type LocoState = 'idle' | 'walk' | 'run' | 'interact';

/** Speeds at or below this (units/sec) count as standing still. */
export const IDLE_SPEED_EPSILON = 0.05;

export function selectLocoState(speed: number, sprint: boolean, interacting: boolean): LocoState {
  if (interacting) return 'interact';
  if (!(speed > IDLE_SPEED_EPSILON)) return 'idle'; // also catches NaN / negatives
  return sprint ? 'run' : 'walk';
}
