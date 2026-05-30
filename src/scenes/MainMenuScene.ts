import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';

export class MainMenuScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  }

  async onEnter(): Promise<void> {
    // Phase 2: build main menu UI (New Game, Load Game, Options, Quit)
  }

  async onExit(): Promise<void> {}
}
