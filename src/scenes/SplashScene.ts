import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class SplashScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    // Phase 2 will add BeiraRio Games logo animation
    await this.wait(3000);
    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    await sceneManager.loadScene('studio');
  }

  async onExit(): Promise<void> {
    // fade out handled in Phase 2
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
