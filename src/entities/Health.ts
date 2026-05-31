export interface HealthState {
  current: number;
  max: number;
}

/**
 * Pure hit-point value object shared by the player and vehicles.
 * No Babylon dependency — fully unit-tested.
 */
export class Health {
  private cur: number;
  private maxHp: number;

  constructor(max = 100, current: number = max) {
    this.maxHp = Math.max(1, max);
    this.cur = Health.clamp(current, 0, this.maxHp);
  }

  get current(): number { return this.cur; }
  get max(): number { return this.maxHp; }

  /** Apply non-negative damage; clamps at 0. Returns the new current value. */
  applyDamage(amount: number): number {
    this.cur = Math.max(0, this.cur - Math.max(0, amount));
    return this.cur;
  }

  /** Heal by a non-negative amount; clamps at max. */
  heal(amount: number): number {
    this.cur = Math.min(this.maxHp, this.cur + Math.max(0, amount));
    return this.cur;
  }

  /** Restore to full. */
  reset(): void {
    this.cur = this.maxHp;
  }

  /** 0..1 fraction of max HP remaining. */
  fraction(): number {
    return this.maxHp > 0 ? this.cur / this.maxHp : 0;
  }

  isDead(): boolean {
    return this.cur <= 0;
  }

  /** True when alive but at/under the critical threshold (e.g. smoking). */
  isCritical(threshold = 0.3): boolean {
    return !this.isDead() && this.fraction() <= threshold;
  }

  toState(): HealthState {
    return { current: this.cur, max: this.maxHp };
  }

  static fromState(state: HealthState): Health {
    return new Health(state.max, state.current);
  }

  private static clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }
}
