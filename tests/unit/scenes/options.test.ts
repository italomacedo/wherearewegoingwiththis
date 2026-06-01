import { NullEngine } from '@babylonjs/core';
import { OptionsScene } from '../../../src/scenes/OptionsScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SettingsService, DEFAULT_SETTINGS } from '../../../src/systems/SettingsService';
import { resetLocale } from '../../../src/systems/I18n';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

describe('OptionsScene', () => {
  let engine: NullEngine;
  let scene: OptionsScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    SettingsService.clearMemoryStore();
    scene = new OptionsScene(engine);
    mockSceneManager.loadScene.mockClear();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
    SettingsService.reset();
    SettingsService.clearMemoryStore();
    resetLocale();
  });

  it('constructs without error', () => {
    expect(scene.babylonScene).toBeDefined();
  });

  it('onEnter resolves without error', async () => {
    await expect(scene.onEnter()).resolves.toBeUndefined();
  });

  it('onExit resolves without error', async () => {
    await expect(scene.onExit()).resolves.toBeUndefined();
  });

  it('starts on game tab by default', () => {
    expect(scene.getActiveTab()).toBe('game');
  });

  it('cycleLanguage toggles en ↔ pt-BR and persists', () => {
    expect(scene.cycleLanguage()).toBe('pt-BR');
    expect(SettingsService.get('language')).toBe('pt-BR');
    expect(scene.cycleLanguage()).toBe('en');
  });

  it('default skill-gain multiplier is 1x', () => {
    expect(DEFAULT_SETTINGS.skillGainMultiplier).toBe(1);
    expect(scene.getSetting('skillGainMultiplier')).toBe(1);
  });

  it('cycleSkillGainMultiplier steps 1 → 3 → 10 → 1 and persists', () => {
    expect(scene.cycleSkillGainMultiplier()).toBe(3);
    expect(scene.cycleSkillGainMultiplier()).toBe(10);
    expect(scene.cycleSkillGainMultiplier()).toBe(1);
    expect(SettingsService.get('skillGainMultiplier')).toBe(1);
  });

  it('selectTab changes active tab', () => {
    scene.selectTab('audio');
    expect(scene.getActiveTab()).toBe('audio');
  });

  it('selectTab can switch to all 4 tabs', () => {
    const tabs = ['game', 'display', 'video', 'audio'] as const;
    tabs.forEach((tab) => {
      scene.selectTab(tab);
      expect(scene.getActiveTab()).toBe(tab);
    });
  });

  it('getSetting returns current setting value', async () => {
    await scene.onEnter();
    expect(scene.getSetting('difficulty')).toBe(DEFAULT_SETTINGS.difficulty);
  });

  it('setSetting updates an individual setting', () => {
    scene.setSetting('difficulty', 'hard');
    expect(scene.getSetting('difficulty')).toBe('hard');
  });

  it('setSetting does not mutate other settings', () => {
    scene.setSetting('masterVolume', 0.3);
    expect(scene.getSetting('musicVolume')).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('validateAndSaveClaudePath accepts valid path', () => {
    const result = scene.validateAndSaveClaudePath('claude');
    expect(result.valid).toBe(true);
    expect(scene.getSetting('claudeCliPath')).toBe('claude');
  });

  it('validateAndSaveClaudePath rejects empty path and does not update setting', () => {
    const before = scene.getSetting('claudeCliPath');
    const result = scene.validateAndSaveClaudePath('');
    expect(result.valid).toBe(false);
    expect(scene.getSetting('claudeCliPath')).toBe(before);
  });

  it('onBack saves settings and navigates to main-menu', () => {
    scene.setSetting('masterVolume', 0.5);
    scene.onBack();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
    expect(SettingsService.get('masterVolume')).toBe(0.5);
  });
});
