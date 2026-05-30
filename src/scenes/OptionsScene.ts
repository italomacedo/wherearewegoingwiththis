import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';

export class OptionsScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  }

  async onEnter(): Promise<void> {
    // Phase 3: tabs Game Options / Display / Video / Audio
  }

  async onExit(): Promise<void> {}
}
