import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';

export class GameWorldScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.01, 0.03, 1);
  }

  async onEnter(): Promise<void> {
    // Phase 6+: isometric world, player, NPCs
  }

  async onExit(): Promise<void> {}
}
