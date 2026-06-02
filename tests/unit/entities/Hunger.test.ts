import {
  Hunger, REGEN_FRACTION_PER_SEC, DRAIN_FRACTION_PER_SEC, HUNGER_LOW_FRACTION,
} from '../../../src/entities/Hunger';

describe('Hunger', () => {
  it('starts full by default and clamps the constructor', () => {
    expect(new Hunger().current).toBe(100);
    expect(new Hunger(100, 250).current).toBe(100); // clamp to max
    expect(new Hunger(100, -5).current).toBe(0);     // clamp to 0
    expect(new Hunger(0).max).toBe(1);                // max floored at 1
  });

  it('feed restores up to max and ignores negatives', () => {
    const h = new Hunger(100, 40);
    expect(h.feed(30)).toBe(70);
    expect(h.feed(-10)).toBe(70);   // negatives ignored
    expect(h.feed(999)).toBe(100);  // clamps
  });

  it('fraction reports the 0..1 ratio', () => {
    expect(new Hunger(100, 50).fraction()).toBe(0.5);
    expect(new Hunger(100, 0).fraction()).toBe(0);
  });

  it('isStarving only at zero', () => {
    expect(new Hunger(100, 0).isStarving()).toBe(true);
    expect(new Hunger(100, 1).isStarving()).toBe(false);
  });

  it('isLow when low but not starving', () => {
    expect(new Hunger(100, HUNGER_LOW_FRACTION * 100).isLow()).toBe(true);
    expect(new Hunger(100, 50).isLow()).toBe(false);
    expect(new Hunger(100, 0).isLow()).toBe(false); // starving is not "low"
  });

  it('tick converts hunger to HP while fed and HP is not full', () => {
    const h = new Hunger(100, 80);
    const delta = h.tick(10, false); // 10 s @ 0.1%/s = 1.0 point
    expect(delta).toBeCloseTo(REGEN_FRACTION_PER_SEC * 100 * 10, 6); // 1.0
    expect(h.current).toBeCloseTo(79, 6);
  });

  it('tick holds hunger when HP is already full', () => {
    const h = new Hunger(100, 80);
    expect(h.tick(10, true)).toBe(0);
    expect(h.current).toBe(80);
  });

  it('tick never converts more hunger than remains', () => {
    const h = new Hunger(100, 0.3);
    const delta = h.tick(100, false); // would be 10 points, but only 0.3 left
    expect(delta).toBeCloseTo(0.3, 6);
    expect(h.current).toBe(0);
    expect(h.isStarving()).toBe(true);
  });

  it('tick drains HP while starving', () => {
    const h = new Hunger(100, 0);
    const delta = h.tick(10, false); // 10 s @ 0.01%/s = -0.1
    expect(delta).toBeCloseTo(-(DRAIN_FRACTION_PER_SEC * 100 * 10), 6);
    expect(h.current).toBe(0);
  });

  it('tick is a no-op for non-positive dt', () => {
    const h = new Hunger(100, 50);
    expect(h.tick(0, false)).toBe(0);
    expect(h.tick(-5, false)).toBe(0);
    expect(h.current).toBe(50);
  });

  it('round-trips through toState / fromState (and defaults when absent)', () => {
    const h = new Hunger(100, 42);
    const r = Hunger.fromState(h.toState());
    expect(r.current).toBe(42);
    expect(r.max).toBe(100);
    expect(Hunger.fromState().current).toBe(100); // undefined → full default
    // max present but current omitted → fills to that max
    expect(Hunger.fromState({ max: 80 } as unknown as ReturnType<Hunger['toState']>).current).toBe(80);
  });
});
