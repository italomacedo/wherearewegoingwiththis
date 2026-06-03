export interface HungerState {
  current: number;
  max: number;
}

/**
 * Pure hunger value object (Phase 10) — modelled after `Health`, no Babylon dep.
 *
 * Owner-locked survival rule: hunger is a slow HP-regen battery.
 *  - While hunger > 0 AND HP is not full, `tick` converts hunger into HP at
 *    `REGEN_FRACTION_PER_SEC` (0.1%/s of max): hunger drops, HP rises 1:1.
 *  - With HP full, hunger holds (nothing to regenerate).
 *  - At hunger 0, `tick` drains HP at `DRAIN_FRACTION_PER_SEC` (0.01%/s).
 * Eating refills hunger (`feed`). `tick` mutates hunger and RETURNS the HP delta
 * (>0 heal, <0 damage) for the caller to apply to `Health` — Hunger never imports it.
 */
export const REGEN_FRACTION_PER_SEC = 0.001; // 0.1%/s of max → hunger converted to HP
export const DRAIN_FRACTION_PER_SEC = 0.0001; // 0.01%/s of max → HP lost while starving
/** Below this fraction (and not starving) the body signals hunger diegetically. */
export const HUNGER_LOW_FRACTION = 0.25;

export class Hunger {
  private cur: number;
  private maxHunger: number;

  constructor(max = 100, current: number = max) {
    this.maxHunger = Math.max(1, max);
    this.cur = Math.min(this.maxHunger, Math.max(0, current));
  }

  get current(): number { return this.cur; }
  get max(): number { return this.maxHunger; }

  /** Eat: restore by a non-negative amount; clamps at max. Returns new current. */
  feed(amount: number): number {
    this.cur = Math.min(this.maxHunger, this.cur + Math.max(0, amount));
    return this.cur;
  }

  /** 0..1 fraction of max hunger remaining. */
  fraction(): number {
    return this.maxHunger > 0 ? this.cur / this.maxHunger : 0;
  }

  /** True when hunger has bottomed out (HP starts draining). */
  isStarving(): boolean { return this.cur <= 0; }

  /** True when hunger is low (but not empty) — cue for the "stomach growling" line. */
  isLow(threshold = HUNGER_LOW_FRACTION): boolean {
    return !this.isStarving() && this.fraction() <= threshold;
  }

  /**
   * Advance hunger by `dtSeconds`. Returns the HP delta to apply: a positive value
   * is HP regenerated from hunger; a negative value is starvation damage.
   * @param hpFull whether the linked Health is already at max (no regen needed).
   */
  tick(dtSeconds: number, hpFull: boolean): number {
    if (!(dtSeconds > 0)) return 0;
    if (this.cur > 0) {
      if (hpFull) return 0; // nothing to regenerate → hunger holds
      const convert = Math.min(this.cur, REGEN_FRACTION_PER_SEC * this.maxHunger * dtSeconds);
      this.cur -= convert;
      return convert;
    }
    return -(DRAIN_FRACTION_PER_SEC * this.maxHunger * dtSeconds);
  }

  toState(): HungerState {
    return { current: this.cur, max: this.maxHunger };
  }

  static fromState(state?: HungerState): Hunger {
    return new Hunger(state?.max ?? 100, state?.current ?? (state?.max ?? 100));
  }
}
