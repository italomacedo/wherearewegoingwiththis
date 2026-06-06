/**
 * Pure weather state machine — no Babylon refs.
 * GameWorldScene drives it via tickWeather(dt) and applies visual effects.
 *
 * Cycle (fixed sequence, deterministic order):
 *   clear → rain → clear → snow → (repeat)
 *
 * Each state has:
 *  - A hold phase (full intensity, random duration HOLD_MIN..HOLD_MAX seconds)
 *  - A fade-out ramp (intensity 1→0 over RAMP_SECONDS)
 *  - A fade-in ramp into the next kind (intensity 0→1 over RAMP_SECONDS)
 */

export type WeatherKind = 'clear' | 'rain' | 'snow';

export interface WeatherState {
  /** Current weather kind (changes at the START of the fade-in for that kind). */
  kind: WeatherKind;
  /** Index of `kind` in WEATHER_SEQUENCE — tracks position so duplicate kinds cycle correctly. */
  seqIndex: number;
  /** 0..1 — 0 = transitioning in, 1 = fully active. */
  intensity: number;
  /** Seconds remaining in the hold phase (only meaningful when !fadingOut && !fadingIn). */
  holdSecondsRemaining: number;
  /** True while ramping intensity 1→0 before switching to nextKind. */
  fadingOut: boolean;
  /** True while ramping intensity 0→1 after switching to the new kind. */
  fadingIn: boolean;
  /** The kind we're transitioning INTO (set at fade-out start, cleared after fade-in ends). */
  nextKind: WeatherKind | null;
  /** Fog density scalar driven by weather (1.0 = no extra fog). */
  fogDensityMultiplier: number;
}

/** Fixed weather sequence — cycles from index 0 indefinitely. */
export const WEATHER_SEQUENCE: WeatherKind[] = ['clear', 'rain', 'clear', 'snow'];

/** Seconds for one intensity ramp (in or out). */
export const WEATHER_RAMP_SECONDS = 60;

/** Hold duration range in seconds. */
export const WEATHER_HOLD_MIN = 120;
export const WEATHER_HOLD_MAX = 360;

/** Maximum fog density multiplier at full intensity per kind. */
export const WEATHER_FOG_MULT: Record<WeatherKind, number> = {
  clear: 1.0,
  rain:  2.2,
  snow:  3.5,
};

/** Index of `kind` in WEATHER_SEQUENCE, or 0 if not found. */
export function seqIndexOf(kind: WeatherKind): number {
  const i = WEATHER_SEQUENCE.indexOf(kind);
  return i >= 0 ? i : 0;
}

/** The kind that comes after `kind` in the fixed sequence. */
export function nextWeatherKind(kind: WeatherKind): WeatherKind {
  return WEATHER_SEQUENCE[(seqIndexOf(kind) + 1) % WEATHER_SEQUENCE.length];
}

/** Fog density multiplier lerped by intensity for the given kind. */
export function fogMultiplierForState(state: WeatherState): number {
  const max = WEATHER_FOG_MULT[state.kind];
  return 1.0 + (max - 1.0) * state.intensity;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pick a hold duration using the provided rng (returns [0,1)). */
function pickHold(rng: () => number): number {
  return WEATHER_HOLD_MIN + rng() * (WEATHER_HOLD_MAX - WEATHER_HOLD_MIN);
}

/** Create the initial weather state (clear at seqIndex 0, fully active, random hold duration). */
export function initWeather(rng: () => number = () => 0.5): WeatherState {
  const hold = pickHold(rng);
  return {
    kind: 'clear',
    seqIndex: 0,
    intensity: 1,
    holdSecondsRemaining: hold,
    fadingOut: false,
    fadingIn: false,
    nextKind: null,
    fogDensityMultiplier: fogMultiplierForState({ kind: 'clear', seqIndex: 0, intensity: 1 } as WeatherState),
  };
}

/**
 * Advance the weather state machine by `dt` seconds.
 * Returns a new WeatherState (immutable step — pure function).
 * `rng` is called only when a new hold duration is needed (fade-in completes).
 */
export function stepWeather(
  state: WeatherState,
  dt: number,
  rng: () => number = () => 0.5,
): WeatherState {
  let { kind, seqIndex, intensity, holdSecondsRemaining, fadingOut, fadingIn, nextKind } = state;

  if (fadingOut) {
    // Ramp intensity 1 → 0
    intensity = clamp01(intensity - dt / WEATHER_RAMP_SECONDS);
    if (intensity <= 0) {
      // Advance to the next position in the sequence
      seqIndex = (seqIndex + 1) % WEATHER_SEQUENCE.length;
      kind = nextKind!;
      nextKind = null;
      fadingOut = false;
      fadingIn = true;
      intensity = 0;
    }
  } else if (fadingIn) {
    // Ramp intensity 0 → 1
    intensity = clamp01(intensity + dt / WEATHER_RAMP_SECONDS);
    if (intensity >= 1) {
      // Fully transitioned — start holding
      intensity = 1;
      fadingIn = false;
      holdSecondsRemaining = pickHold(rng);
    }
  } else {
    // Holding at full intensity — count down
    holdSecondsRemaining -= dt;
    if (holdSecondsRemaining <= 0) {
      holdSecondsRemaining = 0;
      fadingOut = true;
      // Use seqIndex+1 to pick the NEXT position (handles duplicate kinds like 'clear')
      const nextSeqIndex = (seqIndex + 1) % WEATHER_SEQUENCE.length;
      nextKind = WEATHER_SEQUENCE[nextSeqIndex];
    }
  }

  const next: WeatherState = { kind, seqIndex, intensity, holdSecondsRemaining, fadingOut, fadingIn, nextKind, fogDensityMultiplier: 1 };
  next.fogDensityMultiplier = fogMultiplierForState(next);
  return next;
}
