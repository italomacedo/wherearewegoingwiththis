export interface GameSettings {
  // Game Options
  /** UI + NPC language (single setting). */
  language: 'en' | 'pt-BR';
  difficulty: 'easy' | 'normal' | 'hard';
  npcLanguage: 'en';
  subtitles: boolean;
  claudeCliPath: string;
  autosaveInterval: 0 | 5 | 10 | 30;
  /** Multiplier on the +0.1% per-use skill/attribute growth (anti-grind pacing). */
  skillGainMultiplier: 1 | 3 | 10;
  /** Master switch for autonomous NPC behaviour (deliberation, gossip, reactions). */
  npcAutonomy: boolean;
  /** Minutes between a single NPC's proactive reflections (deliberation cooldown). */
  npcReflectionMinutes: 4 | 8 | 15;
  /** Scene-wide ceiling on autonomous Claude calls per minute (cost throttle). */
  npcCallsPerMinute: 4 | 8 | 12;
  /** Turn-based combat economy (owner-tunable). AP = round(Dexterity / apPerDexterity). */
  combatApPerDexterity: 5 | 10 | 20;
  /** AP cost of a primary combat action (attack / aimed shot). */
  combatPrimaryCost: 1 | 2 | 3;
  /** AP cost of a secondary combat action (take cover / hunker / reload / item). */
  combatSecondaryCost: 1 | 2;
  /** AP spent per metre of combat movement (0.5 = 1 AP moves 2 m). */
  combatMoveApPerMeter: 0.5 | 1;

  // Display
  resolution: '1280x720' | '1920x1080' | '2560x1440' | '3840x2160';
  windowMode: 'windowed' | 'fullscreen' | 'borderless';
  vsync: boolean;
  cameraAngleDeg: number; // 30–60

  // Video
  shadowQuality: 'off' | 'low' | 'medium' | 'high';
  antiAliasing: 'off' | 'fxaa' | 'msaa2x' | 'msaa4x';
  postProcessing: 'off' | 'low' | 'high';
  drawDistance: number; // 50–500

  // Audio
  masterVolume: number; // 0–1
  musicVolume: number;
  sfxVolume: number;
  npcVoiceVolume: number;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  language: 'en',
  difficulty: 'normal',
  npcLanguage: 'en',
  subtitles: true,
  claudeCliPath: 'claude',
  autosaveInterval: 10,
  skillGainMultiplier: 1,
  npcAutonomy: true,
  npcReflectionMinutes: 8,
  npcCallsPerMinute: 8,
  combatApPerDexterity: 10,
  combatPrimaryCost: 2,
  combatSecondaryCost: 1,
  combatMoveApPerMeter: 0.5,

  resolution: '1920x1080',
  windowMode: 'windowed',
  vsync: true,
  cameraAngleDeg: 45,

  shadowQuality: 'medium',
  antiAliasing: 'fxaa',
  postProcessing: 'low',
  drawDistance: 200,

  masterVolume: 1,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  npcVoiceVolume: 1,
};

const STORAGE_KEY = 'beirario-settings';

export class SettingsService {
  private static memoryStore: GameSettings | null = null;

  static load(): GameSettings {
    /* istanbul ignore next — localStorage unavailable in Node.js/Jest */
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {
        // corrupted storage — return defaults
      }
    }
    return { ...(SettingsService.memoryStore ?? DEFAULT_SETTINGS) };
  }

  static save(settings: GameSettings): void {
    SettingsService.memoryStore = { ...settings };
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }

  static reset(): void {
    SettingsService.memoryStore = null;
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  static get<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return SettingsService.load()[key];
  }

  static set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    const current = SettingsService.load();
    SettingsService.save({ ...current, [key]: value });
  }

  /** Basic validation: path must be non-empty string */
  static validateClaudePath(path: string): { valid: boolean; reason?: string } {
    if (!path || path.trim().length === 0) {
      return { valid: false, reason: 'Path cannot be empty' };
    }
    return { valid: true };
  }

  /** For test isolation: wipes the in-memory store without touching localStorage */
  static clearMemoryStore(): void {
    SettingsService.memoryStore = null;
  }
}
