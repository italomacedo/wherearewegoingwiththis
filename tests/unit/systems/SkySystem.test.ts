import {
  SkyState,
  lerpColor,
  lerpDayPalette,
  sunElevationRad,
  celestialDirection,
  sunColorForElevation,
  starOpacityForHour,
  computeSkyState,
} from '../../../src/systems/SkySystem';
import { DAY_PALETTES } from '../../../src/systems/GameClock';

describe('SkySystem — pure math', () => {

  describe('lerpColor', () => {
    it('returns a at t=0', () => {
      expect(lerpColor([1, 0, 0], [0, 1, 0], 0)).toEqual([1, 0, 0]);
    });
    it('returns b at t=1', () => {
      expect(lerpColor([1, 0, 0], [0, 1, 0], 1)).toEqual([0, 1, 0]);
    });
    it('returns midpoint at t=0.5', () => {
      const r = lerpColor([0, 0, 0], [1, 1, 1], 0.5);
      expect(r[0]).toBeCloseTo(0.5);
      expect(r[1]).toBeCloseTo(0.5);
      expect(r[2]).toBeCloseTo(0.5);
    });
    it('clamps t to [0,1]', () => {
      expect(lerpColor([0, 0, 0], [1, 1, 1], -0.5)).toEqual([0, 0, 0]);
      expect(lerpColor([0, 0, 0], [1, 1, 1], 2)).toEqual([1, 1, 1]);
    });
  });

  describe('lerpDayPalette', () => {
    const a = DAY_PALETTES.night;
    const b = DAY_PALETTES.day;

    it('returns a at t=0', () => {
      const r = lerpDayPalette(a, b, 0);
      expect(r.ambientIntensity).toBeCloseTo(a.ambientIntensity);
      expect(r.fogDensity).toBeCloseTo(a.fogDensity);
    });
    it('returns b at t=1', () => {
      const r = lerpDayPalette(a, b, 1);
      expect(r.ambientIntensity).toBeCloseTo(b.ambientIntensity);
      expect(r.fogDensity).toBeCloseTo(b.fogDensity);
    });
    it('returns the midpoint at t=0.5', () => {
      const r = lerpDayPalette(a, b, 0.5);
      expect(r.ambientIntensity).toBeCloseTo((a.ambientIntensity + b.ambientIntensity) / 2);
    });
  });

  describe('sunElevationRad', () => {
    it('is approximately 0 at hour 6 (sunrise)', () => {
      expect(Math.abs(sunElevationRad(6))).toBeLessThan(0.01);
    });
    it('is approximately 0 at hour 18 (sunset)', () => {
      expect(Math.abs(sunElevationRad(18))).toBeLessThan(0.01);
    });
    it('is positive at noon (sun above horizon)', () => {
      expect(sunElevationRad(12)).toBeGreaterThan(0);
    });
    it('is negative at midnight (sun below horizon)', () => {
      expect(sunElevationRad(0)).toBeLessThan(0);
      expect(sunElevationRad(24)).toBeLessThan(0);
    });
    it('peaks at solar noon', () => {
      const noon = sunElevationRad(12);
      expect(noon).toBeGreaterThan(sunElevationRad(10));
      expect(noon).toBeGreaterThan(sunElevationRad(14));
    });
    it('normalizes hour > 24', () => {
      // hour 25 → same as hour 1
      expect(sunElevationRad(25)).toBeCloseTo(sunElevationRad(1), 5);
    });
  });

  describe('celestialDirection', () => {
    it('returns a unit vector', () => {
      const dirs: Array<[number, number]> = [
        [Math.PI / 4, 0],
        [0, Math.PI / 2],
        [-Math.PI / 6, Math.PI],
        [Math.PI / 2, 0],
      ];
      for (const [el, az] of dirs) {
        const d = celestialDirection(el, az);
        const len = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
        expect(len).toBeCloseTo(1, 5);
      }
    });
    it('elevation 90° (π/2) points straight up', () => {
      const d = celestialDirection(Math.PI / 2, 0);
      expect(d[1]).toBeCloseTo(1, 5);
    });
    it('elevation 0° at azimuth 0 (north) points along +Z', () => {
      const d = celestialDirection(0, 0);
      expect(d[2]).toBeCloseTo(1, 5);
      expect(d[1]).toBeCloseTo(0, 5);
    });
    it('elevation 0° at azimuth π/2 (east) points along +X', () => {
      const d = celestialDirection(0, Math.PI / 2);
      expect(d[0]).toBeCloseTo(1, 5);
    });
    it('negative elevation gives negative Y', () => {
      const d = celestialDirection(-Math.PI / 4, 0);
      expect(d[1]).toBeLessThan(0);
    });
  });

  describe('sunColorForElevation', () => {
    it('returns yellow-ish at high elevation (noon)', () => {
      const c = sunColorForElevation(Math.PI / 3); // 60°
      expect(c[0]).toBeCloseTo(1.0);
      expect(c[2]).toBeGreaterThan(0.5); // warm yellow has significant blue
    });
    it('returns reddish-orange near the horizon', () => {
      const c = sunColorForElevation(0.02); // ~1°, just above horizon
      expect(c[0]).toBeCloseTo(1.0);
      expect(c[1]).toBeLessThan(0.5); // low green = more red/orange
    });
    it('blends between red and yellow in the 5°–30° band', () => {
      const low  = sunColorForElevation(5  * (Math.PI / 180));
      const high = sunColorForElevation(30 * (Math.PI / 180));
      const mid  = sunColorForElevation(17.5 * (Math.PI / 180));
      expect(mid[1]).toBeGreaterThan(low[1]);
      expect(mid[1]).toBeLessThan(high[1]);
    });
  });

  describe('starOpacityForHour', () => {
    it('is 1 during deep night (22:00)', () => {
      expect(starOpacityForHour(22)).toBe(1);
    });
    it('is 1 at midnight (0:00)', () => {
      expect(starOpacityForHour(0)).toBe(1);
    });
    it('is 0 at midday (12:00)', () => {
      expect(starOpacityForHour(12)).toBe(0);
    });
    it('is 0 at 10:00 (well into day)', () => {
      expect(starOpacityForHour(10)).toBe(0);
    });
    it('ramps in during dusk (18→20)', () => {
      expect(starOpacityForHour(18)).toBeCloseTo(0);
      expect(starOpacityForHour(19)).toBeCloseTo(0.5, 5);
      expect(starOpacityForHour(20)).toBeCloseTo(1, 2);
    });
    it('ramps out during dawn (5→8)', () => {
      expect(starOpacityForHour(5)).toBeCloseTo(1, 2);
      expect(starOpacityForHour(6.5)).toBeCloseTo(0.5, 5);
      expect(starOpacityForHour(8)).toBeCloseTo(0, 5);
    });
    it('clamps within [0,1]', () => {
      for (let h = 0; h < 24; h += 0.5) {
        const op = starOpacityForHour(h);
        expect(op).toBeGreaterThanOrEqual(0);
        expect(op).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeSkyState', () => {
    it('returns an object with all required fields', () => {
      const s: SkyState = computeSkyState(12);
      expect(s).toHaveProperty('zenithColor');
      expect(s).toHaveProperty('horizonColor');
      expect(s).toHaveProperty('sunDirection');
      expect(s).toHaveProperty('sunColor');
      expect(s).toHaveProperty('sunVisibility');
      expect(s).toHaveProperty('moonDirection');
      expect(s).toHaveProperty('moonVisibility');
      expect(s).toHaveProperty('starOpacity');
      expect(s).toHaveProperty('palette');
    });

    it('sun is above horizon at noon', () => {
      const s = computeSkyState(12);
      expect(s.sunDirection[1]).toBeGreaterThan(0);
      expect(s.sunVisibility).toBeGreaterThan(0.5);
    });

    it('sun is below horizon at midnight', () => {
      const s = computeSkyState(2);
      expect(s.sunDirection[1]).toBeLessThan(0);
      expect(s.sunVisibility).toBeCloseTo(0, 2);
    });

    it('moon is roughly opposite the sun', () => {
      // At noon: sun Y > 0, moon Y < 0
      const noon = computeSkyState(12);
      expect(noon.moonDirection[1]).toBeLessThan(0);
      expect(noon.moonVisibility).toBeCloseTo(0, 2);
      // At midnight: moon Y > 0
      const mid = computeSkyState(2);
      expect(mid.moonDirection[1]).toBeGreaterThan(0);
      expect(mid.moonVisibility).toBeGreaterThan(0.5);
    });

    it('stars are fully visible at night', () => {
      expect(computeSkyState(2).starOpacity).toBe(1);
    });

    it('stars are invisible during the day', () => {
      expect(computeSkyState(12).starOpacity).toBe(0);
    });

    it('starOpacity matches starOpacityForHour', () => {
      for (const h of [0, 6, 10, 19, 22]) {
        expect(computeSkyState(h).starOpacity).toBeCloseTo(starOpacityForHour(h), 5);
      }
    });

    it('sunVisibility transitions around 6:00 (sunrise)', () => {
      const before = computeSkyState(5.5);
      const after  = computeSkyState(6.5);
      expect(after.sunVisibility).toBeGreaterThan(before.sunVisibility);
    });

    it('sun and moon are never simultaneously fully visible', () => {
      for (let h = 0; h < 24; h++) {
        const s = computeSkyState(h);
        // At least one should be near zero (they're on opposite hemispheres)
        const bothVisible = s.sunVisibility > 0.8 && s.moonVisibility > 0.8;
        expect(bothVisible).toBe(false);
      }
    });

    it('palette is a valid DayPalette object', () => {
      const s = computeSkyState(10);
      expect(s.palette).toHaveProperty('ambientIntensity');
      expect(s.palette).toHaveProperty('fogDensity');
      expect(s.palette.ambientIntensity).toBeGreaterThan(0);
    });

    it('all color components are in [0,1]', () => {
      for (const h of [0, 3, 6, 9, 12, 15, 18, 21]) {
        const s = computeSkyState(h);
        for (const ch of [...s.zenithColor, ...s.horizonColor, ...s.sunColor]) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1.01); // tiny float epsilon ok
        }
      }
    });

    it('sunDirection is approximately normalized', () => {
      const s = computeSkyState(12);
      const d = s.sunDirection;
      const len = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
      expect(len).toBeCloseTo(1, 4);
    });
  });
});
