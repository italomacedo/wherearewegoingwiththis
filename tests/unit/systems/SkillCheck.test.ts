import {
  rollD100, resolveUnresisted, resolveContested,
} from '../../../src/systems/SkillCheck';

// Deterministic rng that yields a queued sequence of [0,1) values.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('SkillCheck', () => {
  it('works with the default RNG (no injected roll)', () => {
    expect(rollD100()).toBeGreaterThanOrEqual(0);
    expect(rollD100()).toBeLessThan(100);
    expect(typeof resolveUnresisted(50).success).toBe('boolean');
    expect(typeof resolveContested(50, 50).actorWins).toBe('boolean');
  });

  it('rollD100 scales [0,1) into [0,100)', () => {
    expect(rollD100(seq(0))).toBe(0);
    expect(rollD100(seq(0.42))).toBeCloseTo(42, 6);
  });

  describe('resolveUnresisted — success when the roll is UNDER the value%', () => {
    it('succeeds on a low roll', () => {
      const r = resolveUnresisted(40, seq(0.2)); // roll 20 < 40
      expect(r.success).toBe(true);
      expect(r.roll).toBeCloseTo(20, 6);
    });
    it('fails on a high roll', () => {
      expect(resolveUnresisted(40, seq(0.6)).success).toBe(false); // roll 60
    });
    it('a roll exactly at the value fails (strictly under)', () => {
      expect(resolveUnresisted(40, seq(0.4)).success).toBe(false); // roll 40, not < 40
    });
  });

  describe('resolveContested — higher roll×value wins, ties to the target', () => {
    it('actor wins with the higher score', () => {
      // actorRoll .5 → 50 ×60 = 3000 ; targetRoll .5 → 50 ×40 = 2000
      const r = resolveContested(60, 40, seq(0.5, 0.5));
      expect(r.actorWins).toBe(true);
      expect(r.actorScore).toBeGreaterThan(r.targetScore);
    });
    it('target wins ties (defender advantage)', () => {
      // equal value and equal roll → equal score → actor does NOT win
      const r = resolveContested(50, 50, seq(0.5, 0.5));
      expect(r.actorWins).toBe(false);
      expect(r.actorScore).toBe(r.targetScore);
    });
    it('a strong roll can overcome a higher skill', () => {
      // actorRoll .9 →90 ×40 = 3600 ; targetRoll .1 →10 ×80 = 800
      const r = resolveContested(40, 80, seq(0.9, 0.1));
      expect(r.actorWins).toBe(true);
    });
  });
});
