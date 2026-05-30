import { NullEngine, FreeCamera, Vector3 } from '@babylonjs/core';
import { GameManager } from '../../../src/core/GameManager';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SceneManager } from '../../../src/core/SceneManager';
import { BaseScene } from '../../../src/scenes/BaseScene';

class MockScene extends BaseScene {
  async onEnter() {
    // Camera required so Scene.render() doesn't throw when update() is called
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

  it('registers engine and sceneManager in ServiceLocator after initializeWithEngine', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    expect(ServiceLocator.has('engine')).toBe(true);
    expect(ServiceLocator.has('sceneManager')).toBe(true);
    expect(ServiceLocator.has('eventBus')).toBe(true);
    engine.dispose();
  });

  it('getEngine returns null before initialization', () => {
    expect(GameManager.getInstance().getEngine()).toBeNull();
  });

  it('getEngine returns engine after initialization', () => {
    const engine = new NullEngine();
    GameManager.getInstance().initializeWithEngine(engine);
    expect(GameManager.getInstance().getEngine()).toBe(engine);
    engine.dispose();
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

  it('start sets isRunning to true and registers a render loop callback', async () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    sceneManager.register('splash', (eng) => new MockScene(eng));

    // Capture the render loop callback — invoke it AFTER the scene has loaded
    let renderCallback: (() => void) | undefined;
    jest.spyOn(engine, 'runRenderLoop').mockImplementation((cb) => {
      renderCallback = cb;
    });

    gm.start();
    expect(gm.isRunning()).toBe(true);

    // Await scene load so onEnter() adds the camera before we call update()
    await Promise.resolve();

    expect(renderCallback).toBeDefined();
    expect(() => renderCallback!()).not.toThrow();
  });

  it('stop sets isRunning to false', async () => {
    const engine = new NullEngine();
    const gm = GameManager.getInstance();
    gm.initializeWithEngine(engine);

    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    sceneManager.register('splash', (eng) => new MockScene(eng));

    jest.spyOn(engine, 'runRenderLoop').mockImplementation(() => {});

    gm.start();
    gm.stop();
    expect(gm.isRunning()).toBe(false);
  });
});
