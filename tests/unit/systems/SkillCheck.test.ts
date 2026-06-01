import {
  rollD100, effectiveValue, winProbability, resolveCheck,
  DEFAULT_DIFFICULTY, MIN_EFFECTIVE,
} from '../../../src/systems/SkillCheck';

// Deterministic rng yielding a queued sequence of [0,1) values.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('SkillCheck — power-ratio (k=2)', () => {
  it('works with the default RNG (no injected roll)', () => {
    expect(rollD100()).toBeGreaterThanOrEqual(0);
    expect(rollD100()).toBeLessThan(100);
    expect(typeof resolveCheck({ value: 50 }).success).toBe('boolean');
  });

  describe('winProbability', () => {
    it('a big stat gap is decisive but never certain (80 vs 20 ≈ 94%)', () => {
      expect(winProbability(80, 20)).toBeCloseTo(0.9412, 3);
      expect(winProbability(20, 80)).toBeCloseTo(0.0588, 3);
    });
    it('equal values are a coin flip', () => {
      expect(winProbability(50, 50)).toBeCloseTo(0.5, 6);
    });
    it('close values stay close (70 vs 50 ≈ 66%)', () => {
      expect(winProbability(70, 50)).toBeCloseTo(0.6620, 3);
    });
    it('k=3 is more decisive than k=2', () => {
      expect(winProbability(80, 20, 3)).toBeGreaterThan(winProbability(80, 20, 2));
    });
    it('degenerate 0 vs 0 → 0.5', () => {
      expect(winProbability(0, 0)).toBe(0.5);
    });
  });

  describe('effectiveValue', () => {
    it('adds the modifier and floors at MIN_EFFECTIVE', () => {
      expect(effectiveValue(60, 15)).toBe(75);
      expect(effectiveValue(60, -20)).toBe(40);
      expect(effectiveValue(10, -100)).toBe(MIN_EFFECTIVE);
    });
  });

  describe('resolveCheck — unresisted (vs difficulty)', () => {
    it('defaults the opponent to the standard difficulty', () => {
      const r = resolveCheck({ value: 50 }, seq(0.4));
      expect(r.defender).toBe(DEFAULT_DIFFICULTY);
      expect(r.probability).toBeCloseTo(0.5, 6);
      expect(r.success).toBe(true); // roll 40 < 50
    });
    it('a roll at/above P×100 fails', () => {
      expect(resolveCheck({ value: 50 }, seq(0.5)).success).toBe(false); // roll 50, P 50
    });
  });

  describe('resolveCheck — cover & modifiers (the shot example)', () => {
    const shooter = 60;
    it('no cover: 60 vs 50 ≈ 59%', () => {
      const r = resolveCheck({ value: shooter }, seq(0.5));
      expect(r.probability).toBeCloseTo(0.5902, 3);
    });
    it('medium cover (+20 defender): ≈ 42%', () => {
      const r = resolveCheck({ value: shooter, mods: { defender: 20 } }, seq(0.99));
      expect(r.defender).toBe(70);
      expect(r.probability).toBeCloseTo(0.4235, 3);
      expect(r.success).toBe(false);
    });
    it('full cover (+40 defender): ≈ 31%', () => {
      expect(resolveCheck({ value: shooter, mods: { defender: 40 } }).probability).toBeCloseTo(0.3077, 3);
    });
    it('a +15 aim buff offsets medium cover', () => {
      const r = resolveCheck({ value: shooter, mods: { attacker: 15, defender: 20 } });
      expect(r.attacker).toBe(75);
      expect(r.probability).toBeCloseTo(0.5344, 3); // 75 vs 70
    });
  });

  describe('resolveCheck — contested (single roll vs P)', () => {
    it('uses the opponent value and one roll', () => {
      // Brick grapples Vex: 65 vs 20 → ~91% ; roll 0.5 → success
      const r = resolveCheck({ value: 65, opponent: 20 }, seq(0.5));
      expect(r.probability).toBeCloseTo(0.9135, 3);
      expect(r.success).toBe(true);
    });
  });
});
