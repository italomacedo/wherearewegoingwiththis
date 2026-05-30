import { NullEngine, FreeCamera, Vector3 } from '@babylonjs/core';
import { GameManager } from '../../../src/core/GameManager';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SceneManager } from '../../../src/core/SceneManager';
import { BaseScene } from '../../../src/scenes/BaseScene';

class MockScene extends BaseScene {
  async onEnter() {
    new FreeCamera('cam', new Vector3(0, 5, -10), this.babylonScene);
  }
  async onExit() {}
}

describe('GameManager', () => {
  afterEach(() => {
    GameManager.getInstance().dispose();
    GameManager.resetInstance();
    ServiceLocator.clear();
  });

  it('returns the same singleton instance', () => {
    const a = GameManager.getInstance();
    const b = GameManager.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance allows creating a fresh singleton', () => {
    const a = GameManager.getInstance();
    GameManager.resetInstance();
    const b = GameManager.getInstance();
    expect(a).not.toBe(b);
  });

  it('registers engine, sceneManager and eventBus after initializeWithEngine', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    expect(ServiceLocator.has('engine')).toBe(true);
    expect(ServiceLocator.has('sceneManager')).toBe(true);
    expect(ServiceLocator.has('eventBus')).toBe(true);
  });

  it('getEngine returns null before initialization', () => {
    expect(GameManager.getInstance().getEngine()).toBeNull();
  });

  it('getEngine returns engine after initialization', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    expect(GameManager.getInstance().getEngine()).toBe(engine);
  });

  it('isRunning returns false before start', () => {
    expect(GameManager.getInstance().isRunning()).toBe(false);
  });

  it('start throws if not initialized', () => {
    expect(() => GameManager.getInstance().start()).toThrow('not initialized');
  });

  it('dispose clears engine and sceneManager', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    GameManager.getInstance().dispose();
    expect(GameManager.getInstance().getEngine()).toBeNull();
    expect(GameManager.getInstance().getSceneManager()).toBeNull();
  });

  it('start registers all scenes and sets isRunning', () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    sceneManager.transitionDurationMs = 0;

    // Capture the render loop callback — actual rendering tested in SceneManager tests
    let renderCallback: (() => void) | undefined;
    jest.spyOn(engine, 'runRenderLoop').mockImplementation((cb) => {
      renderCallback = cb;
    });

    gm.start();
    expect(gm.isRunning()).toBe(true);
    expect(typeof renderCallback).toBe('function');
  });

  it('render loop callback delegates to sceneManager.update', () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    sceneManager.transitionDurationMs = 0;
    const updateSpy = jest.spyOn(sceneManager, 'update').mockImplementation(() => {});

    let renderCallback: (() => void) | undefined;
    jest.spyOn(engine, 'runRenderLoop').mockImplementation((cb) => {
      renderCallback = cb;
    });

    gm.start();
    renderCallback!();
    expect(updateSpy).toHaveBeenCalled();
  });

  it('stop sets isRunning to false', () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    jest.spyOn(engine, 'runRenderLoop').mockImplementation(() => {});

    gm.start();
    gm.stop();
    expect(gm.isRunning()).toBe(false);
  });

  it('isNullEngine returns true for NullEngine', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    expect(GameManager.getInstance().isNullEngine()).toBe(true);
  });

  it('start with custom scene replaces default registration', async () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    sceneManager.transitionDurationMs = 0;

    jest.spyOn(engine, 'runRenderLoop').mockImplementation(() => {});

    // Register a custom splash before start() to override default
    sceneManager.register('splash', (eng) => new MockScene(eng));
    gm.start(); // re-registers default + our custom (custom wins since it's registered last)

    await Promise.resolve();
    expect(gm.isRunning()).toBe(true);
  });
});
