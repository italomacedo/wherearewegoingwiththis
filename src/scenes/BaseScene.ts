import { Engine, Scene } from '@babylonjs/core';

export abstract class BaseScene {
  readonly babylonScene: Scene;
  protected engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.babylonScene = new Scene(engine);
  }

  /** Called when the scene becomes active */
  abstract onEnter(): Promise<void>;

  /** Called when the scene is about to be replaced */
  abstract onExit(): Promise<void>;

  /** Called every frame by SceneManager */
  update(): void {
    // override in subclasses if needed
  }

  dispose(): void {
    this.babylonScene.dispose();
  }
}
