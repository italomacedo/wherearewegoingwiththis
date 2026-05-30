import { Engine, NullEngine } from '@babylonjs/core';
import { SceneManager } from './SceneManager';
import { ServiceLocator } from './ServiceLocator';
import { EventBus } from './EventBus';

export class GameManager {
  private static instance: GameManager | null = null;
  private engine: Engine | null = null;
  private sceneManager: SceneManager | null = null;
  private running = false;

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  /** For testing only — resets the singleton */
  static resetInstance(): void {
    GameManager.instance = null;
  }

  /* istanbul ignore next — requires browser canvas, tested via Electron smoke test */
  initialize(canvas: HTMLCanvasElement): void {
    this.engine = new Engine(canvas, true, { stencil: true });

    ServiceLocator.register('engine', this.engine);
    ServiceLocator.register('eventBus', new EventBus());

    this.sceneManager = new SceneManager(this.engine);
    ServiceLocator.register('sceneManager', this.sceneManager);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.engine?.resize());
    }
  }

  /** Used in tests with NullEngine */
  initializeWithEngine(engine: Engine): void {
    this.engine = engine;
    ServiceLocator.register('engine', this.engine);
    ServiceLocator.register('eventBus', new EventBus());
    this.sceneManager = new SceneManager(this.engine);
    ServiceLocator.register('sceneManager', this.sceneManager);
  }

  start(): void {
    if (!this.engine || !this.sceneManager) {
      throw new Error('GameManager not initialized. Call initialize() first.');
    }
    this.running = true;
    this.sceneManager.loadScene('splash');
    this.engine.runRenderLoop(() => {
      this.sceneManager?.update();
    });
  }

  stop(): void {
    this.running = false;
    this.engine?.stopRenderLoop();
  }

  dispose(): void {
    this.stop();
    this.sceneManager?.dispose();
    this.engine?.dispose();
    this.engine = null;
    this.sceneManager = null;
    ServiceLocator.clear();
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  getSceneManager(): SceneManager | null {
    return this.sceneManager;
  }

  isRunning(): boolean {
    return this.running;
  }
}
