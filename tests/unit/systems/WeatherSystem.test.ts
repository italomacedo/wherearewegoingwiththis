import {
  WeatherState,
  WeatherKind,
  WEATHER_SEQUENCE,
  WEATHER_RAMP_SECONDS,
  WEATHER_HOLD_MIN,
  WEATHER_HOLD_MAX,
  WEATHER_FOG_MULT,
  seqIndexOf,
  nextWeatherKind,
  fogMultiplierForState,
  initWeather,
  stepWeather,
} from '../../../src/systems/WeatherSystem';

// Deterministic RNG helpers
const rng0 = () => 0;      // always picks HOLD_MIN
const rngMid = () => 0.5;  // picks midpoint of hold range
const rng1 = () => 0.9999; // always picks close to HOLD_MAX

describe('WeatherSystem — pure state machine', () => {

  describe('seqIndexOf', () => {
    it('returns the index of a known kind', () => {
      expect(seqIndexOf('clear')).toBe(0);
      expect(seqIndexOf('rain')).toBe(1);
      expect(seqIndexOf('snow')).toBe(3);
    });
    it('returns 0 for an unknown kind (fallback)', () => {
      expect(seqIndexOf('unknown' as WeatherKind)).toBe(0);
    });
  });

  describe('nextWeatherKind', () => {
    it('cycles through WEATHER_SEQUENCE', () => {
      expect(nextWeatherKind('clear')).toBe('rain');   // clear→rain
      expect(nextWeatherKind('rain')).toBe('clear');   // rain→clear
      expect(nextWeatherKind('snow')).toBe('clear');   // snow wraps to clear
    });
    it('wraps around to the beginning', () => {
      // Last element (snow, index 3) → index 0 (clear)
      expect(nextWeatherKind(WEATHER_SEQUENCE[WEATHER_SEQUENCE.length - 1])).toBe(WEATHER_SEQUENCE[0]);
    });
  });

  describe('fogMultiplierForState', () => {
    it('returns 1.0 for clear at any intensity', () => {
      expect(fogMultiplierForState({ kind: 'clear', intensity: 1 } as WeatherState)).toBeCloseTo(1.0);
      expect(fogMultiplierForState({ kind: 'clear', intensity: 0 } as WeatherState)).toBeCloseTo(1.0);
    });
    it('returns max fog for rain at intensity=1', () => {
      expect(fogMultiplierForState({ kind: 'rain', intensity: 1 } as WeatherState))
        .toBeCloseTo(WEATHER_FOG_MULT.rain);
    });
    it('returns max fog for snow at intensity=1', () => {
      expect(fogMultiplierForState({ kind: 'snow', intensity: 1 } as WeatherState))
        .toBeCloseTo(WEATHER_FOG_MULT.snow);
    });
    it('interpolates between 1 and max at fractional intensity', () => {
      const half = fogMultiplierForState({ kind: 'rain', intensity: 0.5 } as WeatherState);
      expect(half).toBeCloseTo(1.0 + (WEATHER_FOG_MULT.rain - 1.0) * 0.5);
    });
    it('returns 1.0 at intensity=0 for any kind', () => {
      expect(fogMultiplierForState({ kind: 'rain', intensity: 0 } as WeatherState)).toBeCloseTo(1.0);
      expect(fogMultiplierForState({ kind: 'snow', intensity: 0 } as WeatherState)).toBeCloseTo(1.0);
    });
  });

  describe('initWeather', () => {
    it('starts as clear with full intensity', () => {
      const s = initWeather(rngMid);
      expect(s.kind).toBe('clear');
      expect(s.intensity).toBe(1);
    });
    it('hold time is within [HOLD_MIN, HOLD_MAX]', () => {
      const s0 = initWeather(rng0);
      expect(s0.holdSecondsRemaining).toBeCloseTo(WEATHER_HOLD_MIN);
      const s1 = initWeather(rng1);
      expect(s1.holdSecondsRemaining).toBeGreaterThan(WEATHER_HOLD_MIN);
      expect(s1.holdSecondsRemaining).toBeLessThanOrEqual(WEATHER_HOLD_MAX);
    });
    it('is not fading in or out', () => {
      const s = initWeather(rngMid);
      expect(s.fadingOut).toBe(false);
      expect(s.fadingIn).toBe(false);
      expect(s.nextKind).toBeNull();
    });
    it('fogDensityMultiplier is 1 for clear', () => {
      const s = initWeather(rngMid);
      expect(s.fogDensityMultiplier).toBeCloseTo(1.0);
    });
  });

  describe('stepWeather — hold phase', () => {
    it('decrements holdSecondsRemaining each step', () => {
      const s0 = initWeather(rng0);
      const s1 = stepWeather(s0, 10, rng0);
      expect(s1.holdSecondsRemaining).toBeCloseTo(s0.holdSecondsRemaining - 10);
      expect(s1.kind).toBe('clear');
      expect(s1.fadingOut).toBe(false);
    });
    it('does not ramp intensity during hold', () => {
      const s0 = initWeather(rng0);
      const s1 = stepWeather(s0, 10, rng0);
      expect(s1.intensity).toBe(1);
    });
    it('begins fading out when hold expires', () => {
      const s0: WeatherState = {
        kind: 'clear', seqIndex: 0, intensity: 1, holdSecondsRemaining: 5,
        fadingOut: false, fadingIn: false, nextKind: null, fogDensityMultiplier: 1,
      };
      const s1 = stepWeather(s0, 10, rng0); // overshoot by 5s
      expect(s1.fadingOut).toBe(true);
      expect(s1.nextKind).toBe('rain'); // clear(seqIndex 0) → rain(seqIndex 1)
    });
  });

  describe('stepWeather — fade-out phase', () => {
    function makeFadingOut(kind: WeatherKind, seqIndex = 1): WeatherState {
      return {
        kind, seqIndex, intensity: 1, holdSecondsRemaining: 0,
        fadingOut: true, fadingIn: false,
        nextKind: nextWeatherKind(kind),
        fogDensityMultiplier: WEATHER_FOG_MULT[kind],
      };
    }

    it('ramps intensity 1→0 over RAMP_SECONDS', () => {
      let s = makeFadingOut('rain');
      s = stepWeather(s, WEATHER_RAMP_SECONDS / 2, rng0);
      expect(s.fadingOut).toBe(true);
      expect(s.intensity).toBeCloseTo(0.5, 2);
    });

    it('switches to nextKind when intensity hits 0', () => {
      let s = makeFadingOut('rain');
      s = stepWeather(s, WEATHER_RAMP_SECONDS, rng0);
      expect(s.fadingOut).toBe(false);
      expect(s.fadingIn).toBe(true);
      expect(s.kind).toBe('clear'); // rain → clear
      expect(s.intensity).toBe(0);
      expect(s.nextKind).toBeNull();
    });

    it('fog multiplier decreases as intensity drops', () => {
      let s = makeFadingOut('rain');
      const beforeFog = s.fogDensityMultiplier;
      s = stepWeather(s, WEATHER_RAMP_SECONDS / 2, rng0);
      expect(s.fogDensityMultiplier).toBeLessThan(beforeFog);
    });
  });

  describe('stepWeather — fade-in phase', () => {
    function makeFadingIn(kind: WeatherKind, seqIndex = 1): WeatherState {
      return {
        kind, seqIndex, intensity: 0, holdSecondsRemaining: 0,
        fadingOut: false, fadingIn: true,
        nextKind: null,
        fogDensityMultiplier: 1,
      };
    }

    it('ramps intensity 0→1 over RAMP_SECONDS', () => {
      let s = makeFadingIn('rain');
      s = stepWeather(s, WEATHER_RAMP_SECONDS / 2, rng0);
      expect(s.fadingIn).toBe(true);
      expect(s.intensity).toBeCloseTo(0.5, 2);
    });

    it('transitions to hold when intensity hits 1', () => {
      let s = makeFadingIn('rain');
      s = stepWeather(s, WEATHER_RAMP_SECONDS, rng0);
      expect(s.fadingIn).toBe(false);
      expect(s.fadingOut).toBe(false);
      expect(s.intensity).toBe(1);
      expect(s.holdSecondsRemaining).toBeGreaterThanOrEqual(WEATHER_HOLD_MIN);
    });

    it('new hold duration comes from rng', () => {
      const sMin = makeFadingIn('rain');
      const sMax = makeFadingIn('rain');
      const stateMin = stepWeather(sMin, WEATHER_RAMP_SECONDS, rng0);
      const stateMax = stepWeather(sMax, WEATHER_RAMP_SECONDS, rng1);
      expect(stateMin.holdSecondsRemaining).toBeCloseTo(WEATHER_HOLD_MIN, 0);
      expect(stateMax.holdSecondsRemaining).toBeGreaterThan(stateMin.holdSecondsRemaining);
    });
    it('uses the default rng when none is provided', () => {
      // default rng returns 0.5 → hold = HOLD_MIN + 0.5*(HOLD_MAX-HOLD_MIN)
      const s = makeFadingIn('rain');
      const result = stepWeather(s, WEATHER_RAMP_SECONDS); // no rng arg → default () => 0.5
      expect(result.fadingIn).toBe(false);
      expect(result.holdSecondsRemaining).toBeCloseTo(
        WEATHER_HOLD_MIN + 0.5 * (WEATHER_HOLD_MAX - WEATHER_HOLD_MIN), 0,
      );
    });
  });

  describe('stepWeather — full cycle', () => {
    it('cycles through WEATHER_SEQUENCE in order', () => {
      // Large dt completes each ramp in one step and drains the hold quickly.
      const FAST_DT = WEATHER_HOLD_MIN + WEATHER_RAMP_SECONDS + 1;
      const kindsSeen: WeatherKind[] = [];

      let s = initWeather(rng0);
      kindsSeen.push(s.kind); // 'clear'

      // Detect when fadingIn → hold transition completes (new kind's hold starts)
      for (let iteration = 0; iteration < 800; iteration++) {
        const wasFadingIn = s.fadingIn;
        s = stepWeather(s, FAST_DT, rng0);
        // A hold phase just began: fadingIn ended AND we are now holding
        if (wasFadingIn && !s.fadingIn && !s.fadingOut) {
          kindsSeen.push(s.kind);
          if (kindsSeen.length >= WEATHER_SEQUENCE.length + 1) break;
        }
      }

      // Should have seen: clear, rain, clear, snow (then back to clear)
      expect(kindsSeen.slice(0, 4)).toEqual(['clear', 'rain', 'clear', 'snow']);
    });
  });

  describe('stepWeather — no mutation', () => {
    it('returns a new object (immutable step)', () => {
      const s0 = initWeather(rng0);
      const s1 = stepWeather(s0, 10, rng0);
      expect(s1).not.toBe(s0);
    });
  });
});
