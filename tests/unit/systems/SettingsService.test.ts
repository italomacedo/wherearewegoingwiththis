import { SettingsService, DEFAULT_SETTINGS, GameSettings } from '../../../src/systems/SettingsService';

describe('SettingsService', () => {
  beforeEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  afterEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  it('load returns defaults when nothing is saved', () => {
    const settings = SettingsService.load();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('save and load round-trip', () => {
    const custom: GameSettings = {
      ...DEFAULT_SETTINGS,
      difficulty: 'hard',
      claudeCliPath: '/usr/local/bin/claude',
      masterVolume: 0.5,
    };
    SettingsService.save(custom);
    const loaded = SettingsService.load();
    expect(loaded.difficulty).toBe('hard');
    expect(loaded.claudeCliPath).toBe('/usr/local/bin/claude');
    expect(loaded.masterVolume).toBe(0.5);
  });

  it('load merges with defaults (partial save)', () => {
    SettingsService.save({ ...DEFAULT_SETTINGS, difficulty: 'easy' });
    const loaded = SettingsService.load();
    expect(loaded.difficulty).toBe('easy');
    expect(loaded.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('reset restores defaults', () => {
    SettingsService.save({ ...DEFAULT_SETTINGS, difficulty: 'hard' });
    SettingsService.reset();
    SettingsService.clearMemoryStore();
    const loaded = SettingsService.load();
    expect(loaded.difficulty).toBe('normal');
  });

  it('get retrieves a single setting', () => {
    SettingsService.save({ ...DEFAULT_SETTINGS, masterVolume: 0.3 });
    expect(SettingsService.get('masterVolume')).toBe(0.3);
  });

  it('set updates a single setting', () => {
    SettingsService.set('difficulty', 'easy');
    expect(SettingsService.get('difficulty')).toBe('easy');
  });

  it('set preserves other settings', () => {
    SettingsService.set('musicVolume', 0.2);
    expect(SettingsService.get('sfxVolume')).toBe(DEFAULT_SETTINGS.sfxVolume);
  });

  it('multiple sequential sets accumulate', () => {
    SettingsService.set('masterVolume', 0.7);
    SettingsService.set('difficulty', 'hard');
    expect(SettingsService.get('masterVolume')).toBe(0.7);
    expect(SettingsService.get('difficulty')).toBe('hard');
  });

  describe('validateClaudePath', () => {
    it('returns valid for non-empty path', () => {
      expect(SettingsService.validateClaudePath('claude')).toEqual({ valid: true });
    });

    it('returns valid for absolute path', () => {
      expect(SettingsService.validateClaudePath('/usr/local/bin/claude')).toEqual({ valid: true });
    });

    it('returns invalid for empty string', () => {
      const result = SettingsService.validateClaudePath('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('returns invalid for whitespace-only string', () => {
      const result = SettingsService.validateClaudePath('   ');
      expect(result.valid).toBe(false);
    });
  });

  it('load handles corrupted localStorage gracefully', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('beirario-settings', 'not-valid-json{{{');
      const settings = SettingsService.load();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    } else {
      // Node.js: no localStorage, just verify defaults
      expect(SettingsService.load()).toEqual(DEFAULT_SETTINGS);
    }
  });
});
