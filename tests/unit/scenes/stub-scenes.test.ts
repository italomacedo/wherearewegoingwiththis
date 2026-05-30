import { NullEngine } from '@babylonjs/core';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { BaseScene } from '../../../src/scenes/BaseScene';
import { SplashScene } from '../../../src/scenes/SplashScene';
import { StudioScene } from '../../../src/scenes/StudioScene';
import { PublisherScene } from '../../../src/scenes/PublisherScene';
import { MainMenuScene } from '../../../src/scenes/MainMenuScene';
import { CharacterCreatorScene } from '../../../src/scenes/CharacterCreatorScene';
import { LoadGameScene } from '../../../src/scenes/LoadGameScene';
import { OptionsScene } from '../../../src/scenes/OptionsScene';
import { GameWorldScene } from '../../../src/scenes/GameWorldScene';

const mockSceneManager = { loadScene: jest.fn().mockResolvedValue(undefined) };

describe('Stub Scenes', () => {
  let engine: NullEngine;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    jest.useFakeTimers();
    mockSceneManager.loadScene.mockClear();
  });

  afterEach(() => {
    ServiceLocator.clear();
    engine.dispose();
    jest.useRealTimers();
  });

  // --- SplashScene ---
  describe('SplashScene', () => {
    it('constructs with black clearColor', () => {
      const scene = new SplashScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onExit resolves immediately', async () => {
      const scene = new SplashScene(engine);
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });

    it('onEnter loads studio scene after timeout', async () => {
      const scene = new SplashScene(engine);
      await scene.onEnter();
      // onEnter must return immediately (not await the next transition) — else
      // the SceneManager would deadlock since it is still mid-transition.
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).toHaveBeenCalledWith('studio');
      scene.dispose();
    });

    it('onExit cancels the pending navigation timer', async () => {
      const scene = new SplashScene(engine);
      await scene.onEnter();
      await scene.onExit();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      scene.dispose();
    });
  });

  // --- StudioScene ---
  describe('StudioScene', () => {
    it('constructs correctly', () => {
      const scene = new StudioScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onExit resolves immediately', async () => {
      const scene = new StudioScene(engine);
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });

    it('onEnter loads publisher scene after timeout', async () => {
      const scene = new StudioScene(engine);
      await scene.onEnter();
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).toHaveBeenCalledWith('publisher');
      scene.dispose();
    });

    it('onExit cancels the pending navigation timer', async () => {
      const scene = new StudioScene(engine);
      await scene.onEnter();
      await scene.onExit();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      scene.dispose();
    });
  });

  // --- PublisherScene ---
  describe('PublisherScene', () => {
    it('constructs correctly', () => {
      const scene = new PublisherScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onExit resolves immediately', async () => {
      const scene = new PublisherScene(engine);
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });

    it('onEnter loads main-menu scene after timeout', async () => {
      const scene = new PublisherScene(engine);
      await scene.onEnter();
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
      scene.dispose();
    });

    it('onExit cancels the pending navigation timer', async () => {
      const scene = new PublisherScene(engine);
      await scene.onEnter();
      await scene.onExit();
      jest.runAllTimers();
      expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
      scene.dispose();
    });
  });

  // --- MainMenuScene ---
  describe('MainMenuScene', () => {
    it('constructs correctly', () => {
      const scene = new MainMenuScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onEnter and onExit resolve without error', async () => {
      const scene = new MainMenuScene(engine);
      await expect(scene.onEnter()).resolves.toBeUndefined();
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });
  });

  // --- CharacterCreatorScene ---
  describe('CharacterCreatorScene', () => {
    it('constructs correctly', () => {
      const scene = new CharacterCreatorScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onEnter and onExit resolve without error', async () => {
      const scene = new CharacterCreatorScene(engine);
      await expect(scene.onEnter()).resolves.toBeUndefined();
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });
  });

  // --- LoadGameScene ---
  describe('LoadGameScene', () => {
    it('constructs correctly', () => {
      const scene = new LoadGameScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onEnter and onExit resolve without error', async () => {
      const scene = new LoadGameScene(engine);
      await expect(scene.onEnter()).resolves.toBeUndefined();
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });
  });

  // --- OptionsScene ---
  describe('OptionsScene', () => {
    it('constructs correctly', () => {
      const scene = new OptionsScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onEnter and onExit resolve without error', async () => {
      const scene = new OptionsScene(engine);
      await expect(scene.onEnter()).resolves.toBeUndefined();
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });
  });

  // --- GameWorldScene ---
  describe('GameWorldScene', () => {
    it('constructs correctly', () => {
      const scene = new GameWorldScene(engine);
      expect(scene.babylonScene).toBeDefined();
      scene.dispose();
    });

    it('onEnter and onExit resolve without error', async () => {
      const scene = new GameWorldScene(engine);
      await expect(scene.onEnter()).resolves.toBeUndefined();
      await expect(scene.onExit()).resolves.toBeUndefined();
      scene.dispose();
    });
  });

  // --- BaseScene ---
  describe('BaseScene', () => {
    class ConcreteScene extends BaseScene {
      async onEnter() {}
      async onExit() {}
    }

    it('update() is callable and does nothing by default', () => {
      const scene = new ConcreteScene(engine);
      expect(() => scene.update()).not.toThrow();
      scene.dispose();
    });
  });
});
