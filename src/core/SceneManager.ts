import { Engine } from '@babylonjs/core';
import { BaseScene } from '@scenes/BaseScene';
import { EventBus, GameEvents } from '@core/EventBus';
import { ServiceLocator } from '@core/ServiceLocator';
import { FadeController } from '@core/FadeController';

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

  /** Duration in ms for fade-in and fade-out. Set to 0 in tests. */
  transitionDurationMs = 300;

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
    const eventBus = ServiceLocator.tryGet<EventBus>('eventBus');
    eventBus?.emit(
      'scene:transition-start',
      { from: prevName ?? '', to: name } as GameEvents['scene:transition-start']
    );

    // Fade out current scene
    if (this.currentScene) {
      const fadeOut = SceneManager.createFade(this.currentScene, 0);
      await fadeOut.fadeOut(this.transitionDurationMs);
      await this.currentScene.onExit();
      this.currentScene.dispose();
      this.currentScene = null;
    }

    const factory = this.registry.get(name);
    if (!factory) {
      this.transitioning = false;
      throw new Error(`Scene '${name}' not registered. Register it before loading.`);
    }

    // Load and enter new scene
    const scene = factory(this.engine);
    this.currentScene = scene;
    this.currentSceneName = name;

    await scene.onEnter();

    // Fade in new scene (starts opaque → transparent)
    const fadeIn = SceneManager.createFade(scene, 1);
    await fadeIn.fadeIn(this.transitionDurationMs);

    this.transitioning = false;

    eventBus?.emit('scene:transition-end', { sceneName: name });
    eventBus?.emit('scene:loaded', { sceneName: name });
  }

  /**
   * Creates a FadeController for the scene's GUI overlay.
   * Falls back to a no-op controller in Node.js/NullEngine where OffscreenCanvas
   * is unavailable (AdvancedDynamicTexture requires a real WebGL context).
   */
  /**
   * Creates a FadeController backed by a GUI overlay in browser/Electron.
   * In Node.js (Jest), `document` is undefined so we return a no-op controller —
   * the fade logic (alpha tracking) still runs but no visual is created,
   * keeping tests free of browser-only APIs (OffscreenCanvas).
   */
  private static createFade(scene: BaseScene, initialAlpha: number): FadeController {
    if (typeof document === 'undefined') {
      return new FadeController(() => {}, initialAlpha);
    }
    /* istanbul ignore next — browser/Electron path, tested via Electron smoke test */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdvancedDynamicTexture, Rectangle } = require('@babylonjs/gui') as typeof import('@babylonjs/gui');
    /* istanbul ignore next */
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('fade', true, scene.babylonScene);
    /* istanbul ignore next */
    const overlay = new Rectangle('fade-rect');
    /* istanbul ignore next */
    overlay.width = '100%';
    /* istanbul ignore next */
    overlay.height = '100%';
    /* istanbul ignore next */
    overlay.background = 'black';
    /* istanbul ignore next */
    overlay.thickness = 0;
    /* istanbul ignore next */
    overlay.isPointerBlocker = true;
    /* istanbul ignore next */
    gui.addControl(overlay);
    /* istanbul ignore next */
    return new FadeController((alpha) => { overlay.alpha = alpha; }, initialAlpha);
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
