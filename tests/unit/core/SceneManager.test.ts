import { NullEngine, FreeCamera, Vector3 } from '@babylonjs/core';
import { SceneManager } from '../../../src/core/SceneManager';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { BaseScene } from '../../../src/scenes/BaseScene';

class MockScene extends BaseScene {
  onEnterCalled = false;
  onExitCalled = false;
  disposeCalled = false;

  async onEnter(): Promise<void> {
    this.onEnterCalled = true;
    // Camera required so Scene.render() doesn't throw
    new FreeCamera('cam', new Vector3(0, 5, -10), this.babylonScene);
  }

  async onExit(): Promise<void> {
    this.onExitCalled = true;
  }

  dispose(): void {
    this.disposeCalled = true;
    super.dispose();
  }
}

describe('SceneManager', () => {
  let engine: NullEngine;
  let manager: SceneManager;

  beforeEach(() => {
    engine = new NullEngine();
    manager = new SceneManager(engine);
    ServiceLocator.register('sceneManager', manager);
  });

  afterEach(() => {
    manager.dispose();
    engine.dispose();
    ServiceLocator.clear();
  });

  it('starts with no current scene', () => {
    expect(manager.getCurrentSceneName()).toBeNull();
    expect(manager.getCurrentScene()).toBeNull();
  });

  it('loads a registered scene', async () => {
    let created: MockScene | null = null;
    manager.register('main-menu', (eng) => {
      created = new MockScene(eng);
      return created;
    });
    await manager.loadScene('main-menu');
    expect(manager.getCurrentSceneName()).toBe('main-menu');
    expect(created!.onEnterCalled).toBe(true);
  });

  it('throws when loading an unregistered scene', async () => {
    await expect(manager.loadScene('splash')).rejects.toThrow("Scene 'splash' not registered");
  });

  it('calls onExit and dispose on previous scene when loading new one', async () => {
    let prev: MockScene | null = null;
    manager.register('splash', (eng) => {
      prev = new MockScene(eng);
      return prev;
    });
    manager.register('main-menu', (eng) => new MockScene(eng));

    await manager.loadScene('splash');
    await manager.loadScene('main-menu');

    expect(prev!.onExitCalled).toBe(true);
    expect(prev!.disposeCalled).toBe(true);
    expect(manager.getCurrentSceneName()).toBe('main-menu');
  });

  it('isTransitioning is false after load completes', async () => {
    manager.register('splash', (eng) => new MockScene(eng));
    await manager.loadScene('splash');
    expect(manager.isTransitioning()).toBe(false);
  });

  it('dispose clears current scene', async () => {
    manager.register('splash', (eng) => new MockScene(eng));
    await manager.loadScene('splash');
    manager.dispose();
    expect(manager.getCurrentScene()).toBeNull();
  });

  it('ignores concurrent loadScene call while transitioning', async () => {
    let resolveEnter!: () => void;
    const slowScene = new (class extends BaseScene {
      async onEnter() {
        await new Promise<void>((r) => { resolveEnter = r; });
      }
      async onExit() {}
    })(engine);

    manager.register('splash', () => slowScene);
    manager.register('main-menu', (eng) => new MockScene(eng));

    // Start loading splash (will hang in onEnter until resolveEnter is called)
    const firstLoad = manager.loadScene('splash');
    expect(manager.isTransitioning()).toBe(true);

    // currentSceneName is set before onEnter() in SceneManager
    expect(manager.getCurrentSceneName()).toBe('splash');

    // Second load is ignored while transitioning
    await manager.loadScene('main-menu');
    expect(manager.isTransitioning()).toBe(true); // still in first transition

    // Complete the first load
    resolveEnter();
    await firstLoad;
    expect(manager.getCurrentSceneName()).toBe('splash');
    expect(manager.isTransitioning()).toBe(false);
  });

  it('update renders current scene', async () => {
    manager.register('splash', (eng) => new MockScene(eng));
    await manager.loadScene('splash');
    expect(() => manager.update()).not.toThrow();
  });

  it('update does nothing when no scene loaded', () => {
    expect(() => manager.update()).not.toThrow();
  });
});
