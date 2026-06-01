import { Health, conditionBand, coarseCondition, describeCondition } from '../../../src/entities/Health';

describe('conditionBand / coarseCondition / describeCondition (diegetic health)', () => {
  it('precise band: 5 levels from HP fraction', () => {
    expect(conditionBand(1)).toBe('unhurt');
    expect(conditionBand(0.8)).toBe('lightly wounded');
    expect(conditionBand(0.5)).toBe('wounded');
    expect(conditionBand(0.2)).toBe('badly wounded');
    expect(conditionBand(0.05)).toBe('critical');
  });

  it('coarse read: always honest, no skill needed', () => {
    expect(coarseCondition(0.9)).toBe('basically fine');
    expect(coarseCondition(0.5)).toBe('roughed up');
    expect(coarseCondition(0.2)).toBe('badly hurt');
    expect(coarseCondition(0.05)).toBe('barely on your feet');
  });

  it('describeCondition: coarse always, precise (clinical) on a Medicina success', () => {
    // Unhurt player: failure still reads honestly (no misleading "might be worse").
    expect(describeCondition(1, false)).toContain('basically fine');
    expect(describeCondition(0.5, true)).toContain('wounded');
  });
});

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
