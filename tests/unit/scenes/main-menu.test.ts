import { NullEngine } from '@babylonjs/core';
import { MainMenuScene } from '../../../src/scenes/MainMenuScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SceneManager } from '../../../src/core/SceneManager';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

describe('MainMenuScene', () => {
  let engine: NullEngine;
  let scene: MainMenuScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    scene = new MainMenuScene(engine);
    mockSceneManager.loadScene.mockClear();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
  });

  it('constructs without error', () => {
    expect(scene.babylonScene).toBeDefined();
  });

  it('onEnter resolves without error', async () => {
    await expect(scene.onEnter()).resolves.toBeUndefined();
  });

  it('onExit resolves without error', async () => {
    await scene.onEnter();
    await expect(scene.onExit()).resolves.toBeUndefined();
  });

  it('onNewGame navigates to character-creator', () => {
    scene.onNewGame();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('character-creator');
  });

  it('onLoadGame navigates to load-game', () => {
    scene.onLoadGame();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('load-game');
  });

  it('onOptions navigates to options', () => {
    scene.onOptions();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('options');
  });

  it('onQuit does not throw in Node.js environment (no window.electronAPI)', () => {
    // In Node.js, window is undefined so the Electron IPC branch is skipped
    expect(() => scene.onQuit()).not.toThrow();
  });
});
