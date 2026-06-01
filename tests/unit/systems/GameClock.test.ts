import {
  GameClock, periodForHour, hourFromDate, hourFromPlaytime, formatHour,
  normalizeHour, paletteForPeriod, DAY_PALETTES, PERIOD_BOUNDS,
} from '../../../src/systems/GameClock';

const at = (h: number, m = 0, s = 0): Date => new Date(2026, 5, 1, h, m, s);

describe('GameClock — in-world time of day (pure)', () => {
  describe('normalizeHour', () => {
    it('wraps into [0,24)', () => {
      expect(normalizeHour(25)).toBe(1);
      expect(normalizeHour(-1)).toBe(23);
      expect(normalizeHour(12)).toBe(12);
    });
  });

  describe('periodForHour', () => {
    it('classifies each period', () => {
      expect(periodForHour(2)).toBe('night');
      expect(periodForHour(6)).toBe('dawn');
      expect(periodForHour(12)).toBe('day');
      expect(periodForHour(19)).toBe('dusk');
      expect(periodForHour(22)).toBe('night');
    });
    it('uses the documented boundaries', () => {
      expect(periodForHour(PERIOD_BOUNDS.dawnStart)).toBe('dawn');
      expect(periodForHour(PERIOD_BOUNDS.dayStart)).toBe('day');
      expect(periodForHour(PERIOD_BOUNDS.duskStart)).toBe('dusk');
      expect(periodForHour(PERIOD_BOUNDS.nightStart)).toBe('night');
      expect(periodForHour(PERIOD_BOUNDS.dawnStart - 0.1)).toBe('night');
    });
  });

  describe('hourFromDate', () => {
    it('converts H:M:S into a float hour', () => {
      expect(hourFromDate(at(14, 30))).toBeCloseTo(14.5, 6);
      expect(hourFromDate(at(0, 0, 0))).toBe(0);
      expect(hourFromDate(at(6, 15))).toBeCloseTo(6.25, 6);
    });
  });

  describe('hourFromPlaytime', () => {
    it('adds elapsed game hours to the start hour and wraps', () => {
      expect(hourFromPlaytime(20, 0)).toBe(20);
      expect(hourFromPlaytime(20, 3600)).toBe(21);
      expect(hourFromPlaytime(20, 5 * 3600)).toBe(1); // 20 + 5 = 25 → 1
    });
  });

  describe('formatHour', () => {
    it('formats HH:MM with zero padding', () => {
      expect(formatHour(14.5)).toBe('14:30');
      expect(formatHour(9.0)).toBe('09:00');
      expect(formatHour(0.25)).toBe('00:15');
      expect(formatHour(23.999)).toBe('23:59');
    });
    it('normalizes out-of-range hours', () => {
      expect(formatHour(25.5)).toBe('01:30');
    });
  });

  describe('paletteForPeriod', () => {
    it('returns a palette per period with sane channel counts', () => {
      (['night', 'dawn', 'day', 'dusk'] as const).forEach((p) => {
        const pal = paletteForPeriod(p);
        expect(pal).toBe(DAY_PALETTES[p]);
        expect(pal.ambient).toHaveLength(3);
        expect(pal.fog).toHaveLength(3);
        expect(pal.ambientIntensity).toBeGreaterThan(0);
        expect(pal.fogDensity).toBeGreaterThan(0);
      });
    });
    it('day is brighter than night', () => {
      expect(paletteForPeriod('day').ambientIntensity)
        .toBeGreaterThan(paletteForPeriod('night').ambientIntensity);
    });
  });

  describe('GameClock class', () => {
    it('wall mode reads the injected clock', () => {
      const clock = new GameClock({ mode: 'wall', now: () => at(22, 0) });
      expect(clock.getMode()).toBe('wall');
      expect(clock.hour()).toBe(22);
      expect(clock.period()).toBe('night');
      expect(clock.label()).toBe('22:00');
    });

    it('wall mode ignores gameTimeSeconds', () => {
      const clock = new GameClock({ mode: 'wall', now: () => at(13, 0) });
      expect(clock.hour(99999)).toBe(13);
    });

    it('fixed mode advances from startHour with playtime', () => {
      const clock = new GameClock({ mode: 'fixed', startHour: 20 });
      expect(clock.hour(0)).toBe(20);
      expect(clock.hour(2 * 3600)).toBe(22);
      expect(clock.period(3 * 3600)).toBe('night'); // 23h
      expect(clock.label(0)).toBe('20:00');
    });

    it('defaults to wall mode', () => {
      const clock = new GameClock();
      expect(clock.getMode()).toBe('wall');
    });
  });
});
