import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class StudioScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    // Phase 2: "A BeiraRio Games game" animation
    await this.wait(2500);
    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    await sceneManager.loadScene('publisher');
  }

  async onExit(): Promise<void> {}

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
