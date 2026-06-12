import {
  Stamina,
  STAMINA_BASE_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  RESPRINT_FRACTION,
} from '@entities/Stamina';

describe('Stamina', () => {
  it('starts full and sprintable by default', () => {
    const s = new Stamina();
    expect(s.current).toBe(STAMINA_BASE_MAX);
    expect(s.max).toBe(STAMINA_BASE_MAX);
    expect(s.fraction()).toBe(1);
    expect(s.canSprint()).toBe(true);
    expect(s.isExhausted()).toBe(false);
  });

  it('clamps the constructor current into [0, max] and enforces max >= 1', () => {
    expect(new Stamina(100, 150).current).toBe(100);
    expect(new Stamina(100, -5).current).toBe(0);
    expect(new Stamina(0).max).toBe(1);
  });

  it('drains while sprinting and moving', () => {
    const s = new Stamina();
    s.tick(1, true);
    expect(s.current).toBe(STAMINA_BASE_MAX - STAMINA_DRAIN_PER_SEC);
  });

  it('regenerates while not sprinting (idle or walking), clamped at max', () => {
    const s = new Stamina(100, 50);
    s.tick(1, false);
    expect(s.current).toBe(50 + STAMINA_REGEN_PER_SEC);
    s.tick(100, false);
    expect(s.current).toBe(100);
  });

  it('dt<=0 is a no-op (NullEngine frames)', () => {
    const s = new Stamina(100, 50);
    s.tick(0, true);
    s.tick(-1, true);
    s.tick(Number.NaN, true);
    expect(s.current).toBe(50);
  });

  it('latches exhausted at 0 and blocks sprint', () => {
    const s = new Stamina();
    s.tick(STAMINA_BASE_MAX / STAMINA_DRAIN_PER_SEC + 1, true);
    expect(s.current).toBe(0);
    expect(s.isExhausted()).toBe(true);
    expect(s.canSprint()).toBe(false);
  });

  it('stays latched below the re-sprint threshold and unlatches at it (hysteresis)', () => {
    const s = new Stamina();
    s.tick(100, true); // empty + latched
    // Regenerate to just below 20%: still latched.
    const justBelow = (RESPRINT_FRACTION * STAMINA_BASE_MAX - 1) / STAMINA_REGEN_PER_SEC;
    s.tick(justBelow, false);
    expect(s.canSprint()).toBe(false);
    // Cross the threshold: unlatched.
    s.tick(1 / STAMINA_REGEN_PER_SEC, false);
    expect(s.fraction()).toBeGreaterThanOrEqual(RESPRINT_FRACTION);
    expect(s.canSprint()).toBe(true);
  });

  it('does not latch when merely low without hitting 0', () => {
    const s = new Stamina(100, 5); // below threshold but constructed (re-derives latch)
    expect(s.isExhausted()).toBe(true); // constructor re-derivation
    const t = new Stamina(100, 30);
    t.tick(1, true); // 18 left, never hit 0
    expect(t.canSprint()).toBe(true);
  });

  it('effectiveMax follows the Atletismo curve (×0.9 at 10, ×1.0 at 30, ×1.35 at 100)', () => {
    expect(Stamina.effectiveMax(10)).toBeCloseTo(90);
    expect(Stamina.effectiveMax(30)).toBeCloseTo(100);
    expect(Stamina.effectiveMax(100)).toBeCloseTo(135);
  });

  it('setMaxForAtletismo rescales the max preserving the current fraction', () => {
    const s = new Stamina(100, 50); // 50%
    s.setMaxForAtletismo(100);
    expect(s.max).toBeCloseTo(135);
    expect(s.current).toBeCloseTo(67.5);
    expect(s.fraction()).toBeCloseTo(0.5);
  });

  it('toState/fromState round-trips and re-derives the latch from the fraction', () => {
    const s = new Stamina(135, 10);
    const restored = Stamina.fromState(s.toState());
    expect(restored.current).toBe(10);
    expect(restored.max).toBe(135);
    expect(restored.isExhausted()).toBe(true); // 10/135 < 20%
    const fresh = Stamina.fromState(undefined);
    expect(fresh.current).toBe(STAMINA_BASE_MAX);
    expect(fresh.canSprint()).toBe(true);
    const maxOnly = Stamina.fromState({ max: 120 } as never);
    expect(maxOnly.current).toBe(120);
  });
});
