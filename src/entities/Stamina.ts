export interface StaminaState {
  current: number;
  max: number;
}

/**
 * Pure sprint-stamina value object (status-bar phase) — modelled after `Hunger`,
 * no Babylon dep.
 *
 * Owner-locked sprint rule: sprinting is no longer free.
 *  - `tick` drains stamina while the hero is sprinting AND actually moving,
 *    and regenerates it otherwise.
 *  - Hitting 0 sets an "exhausted" latch: sprint stays disabled until stamina
 *    recovers to `RESPRINT_FRACTION` of max (hysteresis — no on/off flapping
 *    right at the empty mark).
 *  - Atletismo scales the reserve via `effectiveMax` (same curve as
 *    `PlayerController.effectiveRunSpeed`: ×0.9 at 10, ×1.0 at 30, ×1.35 at 100).
 * The latch is NOT persisted — `fromState` re-derives it from the saved fraction.
 */
export const STAMINA_BASE_MAX = 100;
export const STAMINA_DRAIN_PER_SEC = 12; // ~8.3 s of continuous full sprint
export const STAMINA_REGEN_PER_SEC = 16; // ~6.3 s empty → full
/** Once exhausted, sprint unlocks again only at this fraction of max. */
export const RESPRINT_FRACTION = 0.2;

export class Stamina {
  private cur: number;
  private maxStamina: number;
  private exhausted: boolean;

  constructor(max = STAMINA_BASE_MAX, current: number = max) {
    this.maxStamina = Math.max(1, max);
    this.cur = Math.min(this.maxStamina, Math.max(0, current));
    this.exhausted = this.cur < RESPRINT_FRACTION * this.maxStamina;
  }

  get current(): number { return this.cur; }
  get max(): number { return this.maxStamina; }

  /** 0..1 fraction of max stamina remaining. */
  fraction(): number {
    return this.cur / this.maxStamina;
  }

  /** True while the exhausted latch holds (sprint disabled). */
  isExhausted(): boolean { return this.exhausted; }

  /** True when sprinting is allowed (not exhausted-latched). */
  canSprint(): boolean { return !this.exhausted; }

  /** Pure: stamina reserve scaled by Atletismo — same curve as run speed. */
  static effectiveMax(atletismo: number): number {
    return STAMINA_BASE_MAX * (0.85 + atletismo / 200);
  }

  /** Rescale max for a new Atletismo value, preserving the current fraction. */
  setMaxForAtletismo(atletismo: number): void {
    const frac = this.fraction();
    this.maxStamina = Math.max(1, Stamina.effectiveMax(atletismo));
    this.cur = frac * this.maxStamina;
  }

  /**
   * Advance stamina by `dtSeconds`: drains while `sprintingAndMoving`,
   * regenerates otherwise. Updates the exhausted latch. dt<=0 is a no-op.
   */
  tick(dtSeconds: number, sprintingAndMoving: boolean): void {
    if (!(dtSeconds > 0)) return;
    if (sprintingAndMoving) {
      this.cur = Math.max(0, this.cur - STAMINA_DRAIN_PER_SEC * dtSeconds);
      if (this.cur <= 0) this.exhausted = true;
    } else {
      this.cur = Math.min(this.maxStamina, this.cur + STAMINA_REGEN_PER_SEC * dtSeconds);
      if (this.exhausted && this.fraction() >= RESPRINT_FRACTION) this.exhausted = false;
    }
  }

  toState(): StaminaState {
    return { current: this.cur, max: this.maxStamina };
  }

  static fromState(state?: StaminaState): Stamina {
    return new Stamina(state?.max ?? STAMINA_BASE_MAX, state?.current ?? (state?.max ?? STAMINA_BASE_MAX));
  }
}
