import { Health } from '../../../src/entities/Health';

describe('Health', () => {
  it('starts at full by default', () => {
    const h = new Health(100);
    expect(h.current).toBe(100);
    expect(h.max).toBe(100);
    expect(h.fraction()).toBe(1);
    expect(h.isDead()).toBe(false);
  });

  it('clamps the initial current value into [0, max]', () => {
    expect(new Health(100, 250).current).toBe(100);
    expect(new Health(100, -5).current).toBe(0);
  });

  it('enforces a minimum max of 1', () => {
    expect(new Health(0).max).toBe(1);
  });

  it('applyDamage reduces HP and clamps at 0', () => {
    const h = new Health(100);
    expect(h.applyDamage(30)).toBe(70);
    expect(h.applyDamage(1000)).toBe(0);
    expect(h.isDead()).toBe(true);
  });

  it('ignores negative damage', () => {
    const h = new Health(100);
    h.applyDamage(-50);
    expect(h.current).toBe(100);
  });

  it('heal restores up to max', () => {
    const h = new Health(100, 40);
    expect(h.heal(30)).toBe(70);
    expect(h.heal(1000)).toBe(100);
  });

  it('reset returns to full', () => {
    const h = new Health(100, 10);
    h.reset();
    expect(h.current).toBe(100);
  });

  it('isCritical is true when alive at/under the threshold, false when dead', () => {
    const h = new Health(100, 25);
    expect(h.isCritical()).toBe(true);     // 25% <= 30%
    h.applyDamage(25);                      // 0
    expect(h.isCritical()).toBe(false);     // dead, not "critical"
    expect(h.isDead()).toBe(true);
  });

  it('isCritical respects a custom threshold', () => {
    const h = new Health(100, 45);
    expect(h.isCritical(0.5)).toBe(true);
    expect(h.isCritical(0.3)).toBe(false);
  });

  it('round-trips through toState/fromState', () => {
    const h = new Health(120, 80);
    const restored = Health.fromState(h.toState());
    expect(restored.current).toBe(80);
    expect(restored.max).toBe(120);
  });
});
