import { Engine, NullEngine } from '@babylonjs/core';
import { SceneManager } from './SceneManager';
import { ServiceLocator } from './ServiceLocator';
import { EventBus } from './EventBus';
import { AudioManager } from '@systems/AudioManager';
import { SplashScene } from '@scenes/SplashScene';
import { StudioScene } from '@scenes/StudioScene';
import { PublisherScene } from '@scenes/PublisherScene';
import { MainMenuScene } from '@scenes/MainMenuScene';
import { CharacterCreatorScene } from '@scenes/CharacterCreatorScene';
import { LoadGameScene } from '@scenes/LoadGameScene';
import { OptionsScene } from '@scenes/OptionsScene';
import { GameWorldScene } from '@scenes/GameWorldScene';

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
    this.setupServices();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.engine?.resize());
    }
  }

  /** Used in tests with NullEngine */
  initializeWithEngine(engine: Engine): void {
    this.engine = engine;
    this.setupServices();
  }

  private setupServices(): void {
    ServiceLocator.register('engine', this.engine!);
    const eventBus = new EventBus();
    ServiceLocator.register('eventBus', eventBus);
    ServiceLocator.register('audio', new AudioManager(eventBus));
    this.sceneManager = new SceneManager(this.engine!);
    ServiceLocator.register('sceneManager', this.sceneManager);
  }

  private registerScenes(): void {
    const sm = this.sceneManager!;
    /* istanbul ignore next */ sm.register('splash', (eng) => new SplashScene(eng));
    /* istanbul ignore next */ sm.register('studio', (eng) => new StudioScene(eng));
    /* istanbul ignore next */ sm.register('publisher', (eng) => new PublisherScene(eng));
    /* istanbul ignore next */ sm.register('main-menu', (eng) => new MainMenuScene(eng));
    /* istanbul ignore next */ sm.register('character-creator', (eng) => new CharacterCreatorScene(eng));
    /* istanbul ignore next */ sm.register('load-game', (eng) => new LoadGameScene(eng));
    /* istanbul ignore next */ sm.register('options', (eng) => new OptionsScene(eng));
    /* istanbul ignore next */ sm.register('game-world', (eng) => new GameWorldScene(eng));
  }

  start(): void {
    if (!this.engine || !this.sceneManager) {
      throw new Error('GameManager not initialized. Call initialize() first.');
    }
    this.registerScenes();
    this.running = true;
    void this.sceneManager.loadScene('splash');
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

  /** Expose for test-only NullEngine detection */
  isNullEngine(): boolean {
    return this.engine instanceof NullEngine;
  }
}
