import {
  SLEEP_DURATION_SECONDS,
  SLEEP_HUNGER_COST,
  SLEEP_COOLDOWN_SECONDS,
  WELL_RESTED_SECONDS,
  WELL_RESTED_MULTIPLIER,
  canSleep,
  sleepCooldownRemaining,
  computeSleepResult,
  wellRestedUntil,
  isWellRested,
  sleepGainMultiplier,
} from '@systems/SleepSystem';

describe('SleepSystem', () => {
  describe('constants', () => {
    it('uses 8h sleep, 24h cooldown, 2h well-rested', () => {
      expect(SLEEP_DURATION_SECONDS).toBe(28800);
      expect(SLEEP_COOLDOWN_SECONDS).toBe(86400);
      expect(WELL_RESTED_SECONDS).toBe(7200);
      expect(WELL_RESTED_MULTIPLIER).toBe(2);
      expect(SLEEP_HUNGER_COST).toBe(33);
    });
  });

  describe('canSleep', () => {
    it('allows sleep when never slept (undefined)', () => {
      expect(canSleep(undefined, 0)).toBe(true);
      expect(canSleep(undefined, 999999)).toBe(true);
    });

    it('blocks sleep before 24h elapse', () => {
      expect(canSleep(1000, 1000)).toBe(false);
      expect(canSleep(1000, 1000 + SLEEP_COOLDOWN_SECONDS - 1)).toBe(false);
    });

    it('allows sleep exactly at and after 24h', () => {
      expect(canSleep(1000, 1000 + SLEEP_COOLDOWN_SECONDS)).toBe(true);
      expect(canSleep(1000, 1000 + SLEEP_COOLDOWN_SECONDS + 1)).toBe(true);
    });
  });

  describe('sleepCooldownRemaining', () => {
    it('is 0 when never slept', () => {
      expect(sleepCooldownRemaining(undefined, 50)).toBe(0);
    });

    it('counts down and never goes negative', () => {
      expect(sleepCooldownRemaining(0, 0)).toBe(SLEEP_COOLDOWN_SECONDS);
      expect(sleepCooldownRemaining(0, 3600)).toBe(SLEEP_COOLDOWN_SECONDS - 3600);
      expect(sleepCooldownRemaining(0, SLEEP_COOLDOWN_SECONDS + 10)).toBe(0);
    });
  });

  describe('computeSleepResult', () => {
    it('spends hunger and heals HP from it when fed and hurt', () => {
      const r = computeSleepResult({
        hunger: { current: 100, max: 100 },
        health: { current: 50, max: 100 },
      });
      expect(r.hungerSpent).toBe(33);
      expect(r.hpHealed).toBe(33);
      expect(r.hunger.current).toBe(67);
      expect(r.health.current).toBe(83);
    });

    it('caps healing at the missing HP (overflow not wasted as HP)', () => {
      const r = computeSleepResult({
        hunger: { current: 100, max: 100 },
        health: { current: 90, max: 100 },
      });
      expect(r.hungerSpent).toBe(33); // hunger still metabolised in full
      expect(r.hpHealed).toBe(10);    // only 10 HP was missing
      expect(r.health.current).toBe(100);
      expect(r.hunger.current).toBe(67);
    });

    it('caps hunger spent at the available hunger', () => {
      const r = computeSleepResult({
        hunger: { current: 20, max: 100 },
        health: { current: 0, max: 100 },
      });
      expect(r.hungerSpent).toBe(20);
      expect(r.hpHealed).toBe(20);
      expect(r.hunger.current).toBe(0);
      expect(r.health.current).toBe(20);
    });

    it('heals nothing when HP already full but still metabolises hunger', () => {
      const r = computeSleepResult({
        hunger: { current: 80, max: 100 },
        health: { current: 100, max: 100 },
      });
      expect(r.hpHealed).toBe(0);
      expect(r.hungerSpent).toBe(33);
      expect(r.hunger.current).toBe(47);
      expect(r.health.current).toBe(100);
    });

    it('starving: nothing to spend, no healing', () => {
      const r = computeSleepResult({
        hunger: { current: 0, max: 100 },
        health: { current: 40, max: 100 },
      });
      expect(r.hungerSpent).toBe(0);
      expect(r.hpHealed).toBe(0);
      expect(r.hunger.current).toBe(0);
      expect(r.health.current).toBe(40);
    });

    it('does not mutate the inputs', () => {
      const hunger = { current: 100, max: 100 };
      const health = { current: 50, max: 100 };
      computeSleepResult({ hunger, health });
      expect(hunger).toEqual({ current: 100, max: 100 });
      expect(health).toEqual({ current: 50, max: 100 });
    });
  });

  describe('well-rested buff', () => {
    it('wellRestedUntil is now + 2h', () => {
      expect(wellRestedUntil(1000)).toBe(1000 + WELL_RESTED_SECONDS);
    });

    it('isWellRested is true only before expiry', () => {
      const until = wellRestedUntil(1000);
      expect(isWellRested(1000, until)).toBe(true);
      expect(isWellRested(until - 1, until)).toBe(true);
      expect(isWellRested(until, until)).toBe(false);
      expect(isWellRested(until + 1, until)).toBe(false);
      expect(isWellRested(1000, undefined)).toBe(false);
    });

    it('sleepGainMultiplier is 2x while active, 1x otherwise', () => {
      const until = wellRestedUntil(0);
      expect(sleepGainMultiplier(0, until)).toBe(2);
      expect(sleepGainMultiplier(until, until)).toBe(1);
      expect(sleepGainMultiplier(0, undefined)).toBe(1);
    });
  });
});
