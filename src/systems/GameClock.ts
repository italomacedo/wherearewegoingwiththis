/**
 * In-world time of day. There is intentionally NO on-screen clock (immersion) —
 * the time is consulted diegetically (a "check the time" emote) and drives the
 * scene's light/fog tint per period.
 *
 * Two modes (config-flippable):
 *  - 'wall'  → the game clock mirrors the player's real local clock (max "real
 *              time" immersion; independent of playtime/saves).
 *  - 'fixed' → starts at `startHour` and advances 1 game-second per real second,
 *              accumulating via the persisted `gameTimeSeconds` (a full cycle
 *              takes ~24 real hours).
 *
 * All math is pure + injectable (`now`), so it is fully unit-testable without a
 * real clock.
 */

export type DayPeriod = 'night' | 'dawn' | 'day' | 'dusk';

/** Hour-of-day boundaries (24h) used to classify a period. */
export const PERIOD_BOUNDS = {
  dawnStart: 5,
  dayStart: 8,
  duskStart: 18,
  nightStart: 20,
} as const;

/** Normalize any hour into [0, 24). */
export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

/** Classify an hour-of-day into a day period. */
export function periodForHour(hour: number): DayPeriod {
  const h = normalizeHour(hour);
  if (h >= PERIOD_BOUNDS.nightStart || h < PERIOD_BOUNDS.dawnStart) return 'night';
  if (h < PERIOD_BOUNDS.dayStart) return 'dawn';
  if (h < PERIOD_BOUNDS.duskStart) return 'day';
  return 'dusk';
}

/** Hour-of-day (float) from a Date — wall-clock mode. */
export function hourFromDate(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Hour-of-day (float) from a fixed start + accumulated playtime — fixed mode. */
export function hourFromPlaytime(startHour: number, gameTimeSeconds: number): number {
  return normalizeHour(startHour + gameTimeSeconds / 3600);
}

/** "HH:MM" for an hour-of-day float. */
export function formatHour(hour: number): string {
  const h = normalizeHour(hour);
  const whole = Math.floor(h);
  const mins = Math.floor((h - whole) * 60);
  return `${pad2(whole)}:${pad2(mins)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Per-period scene palette (rgb channels 0..1) for the light/fog tint. */
export interface DayPalette {
  ambientIntensity: number;
  ambient: [number, number, number];
  ground: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
}

export const DAY_PALETTES: Record<DayPeriod, DayPalette> = {
  night: {
    ambientIntensity: 0.45,
    ambient: [0.34, 0.4, 0.56],
    ground: [0.12, 0.12, 0.18],
    fog: [0.02, 0.03, 0.06],
    fogDensity: 0.013,
  },
  dawn: {
    ambientIntensity: 0.6,
    ambient: [0.7, 0.56, 0.56],
    ground: [0.2, 0.18, 0.2],
    fog: [0.16, 0.11, 0.13],
    fogDensity: 0.01,
  },
  day: {
    ambientIntensity: 0.85,
    ambient: [0.68, 0.71, 0.78],
    ground: [0.22, 0.22, 0.26],
    fog: [0.5, 0.55, 0.6],
    fogDensity: 0.006,
  },
  dusk: {
    ambientIntensity: 0.6,
    ambient: [0.72, 0.5, 0.44],
    ground: [0.2, 0.16, 0.16],
    fog: [0.26, 0.15, 0.12],
    fogDensity: 0.01,
  },
};

export function paletteForPeriod(period: DayPeriod): DayPalette {
  return DAY_PALETTES[period];
}

export interface GameClockConfig {
  /** 'wall' mirrors the real local clock; 'fixed' uses startHour + playtime. */
  mode: 'wall' | 'fixed';
  /** Starting hour for 'fixed' mode (cyberpunk night by default). */
  startHour: number;
  /** Injectable clock source (for tests). */
  now: () => Date;
}

export const DEFAULT_GAME_CLOCK_CONFIG: GameClockConfig = {
  mode: 'wall',
  startHour: 20,
  now: () => new Date(),
};

/**
 * Resolves the current in-world hour/period/label from the configured mode.
 * `gameTimeSeconds` is only used in 'fixed' mode.
 */
export class GameClock {
  private config: GameClockConfig;

  constructor(config: Partial<GameClockConfig> = {}) {
    this.config = { ...DEFAULT_GAME_CLOCK_CONFIG, ...config };
  }

  getMode(): 'wall' | 'fixed' {
    return this.config.mode;
  }

  hour(gameTimeSeconds = 0): number {
    return this.config.mode === 'wall'
      ? hourFromDate(this.config.now())
      : hourFromPlaytime(this.config.startHour, gameTimeSeconds);
  }

  period(gameTimeSeconds = 0): DayPeriod {
    return periodForHour(this.hour(gameTimeSeconds));
  }

  /** "HH:MM" label of the current in-world time. */
  label(gameTimeSeconds = 0): string {
    return formatHour(this.hour(gameTimeSeconds));
  }
}
