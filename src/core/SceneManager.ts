import { Engine } from '@babylonjs/core';
import { BaseScene } from '@scenes/BaseScene';

export type SceneName =
  | 'splash'
  | 'studio'
  | 'publisher'
  | 'main-menu'
  | 'character-creator'
  | 'load-game'
  | 'options'
  | 'game-world';

type SceneFactory = (engine: Engine) => BaseScene;

export class SceneManager {
  private engine: Engine;
  private currentScene: BaseScene | null = null;
  private currentSceneName: SceneName | null = null;
  private registry = new Map<SceneName, SceneFactory>();
  private transitioning = false;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  register(name: SceneName, factory: SceneFactory): void {
    this.registry.set(name, factory);
  }

  async loadScene(name: SceneName): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;

    const prevName = this.currentSceneName;

    if (this.currentScene) {
      await this.currentScene.onExit();
      this.currentScene.dispose();
      this.currentScene = null;
    }

    const factory = this.registry.get(name);
    if (!factory) {
      this.transitioning = false;
      throw new Error(`Scene '${name}' not registered. Register it before loading.`);
    }

    const scene = factory(this.engine);
    this.currentScene = scene;
    this.currentSceneName = name;

    await scene.onEnter();
    this.transitioning = false;

    void prevName; // used for transition events in Phase 1
  }

  update(): void {
    if (this.currentScene) {
      this.currentScene.babylonScene.render();
      this.currentScene.update();
    }
  }

  getCurrentSceneName(): SceneName | null {
    return this.currentSceneName;
  }

  getCurrentScene(): BaseScene | null {
    return this.currentScene;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  dispose(): void {
    this.currentScene?.dispose();
    this.currentScene = null;
    this.registry.clear();
  }
}
