import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, StackPanel } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class StudioScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('studio-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    await this.wait(2500);
    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    await sceneManager.loadScene('publisher');
  }

  async onExit(): Promise<void> {}

  private buildVisuals(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildStudioScreen();
  }

  /* istanbul ignore next */
  private buildStudioScreen(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('studio-ui', true, this.babylonScene);
    const panel = new StackPanel('panel');
    gui.addControl(panel);

    const line1 = new TextBlock('line1');
    line1.text = 'A';
    line1.color = '#AAAAAA';
    line1.fontSize = 18;
    line1.fontFamily = '"Courier New", monospace';
    line1.height = '30px';
    panel.addControl(line1);

    const studio = new TextBlock('studio');
    studio.text = 'BEIRARIO GAMES';
    studio.color = '#00FFCC';
    studio.fontSize = 36;
    studio.fontFamily = '"Courier New", monospace';
    studio.fontStyle = 'bold';
    studio.height = '60px';
    panel.addControl(studio);

    const line2 = new TextBlock('line2');
    line2.text = 'game';
    line2.color = '#AAAAAA';
    line2.fontSize = 18;
    line2.fontFamily = '"Courier New", monospace';
    line2.height = '30px';
    panel.addControl(line2);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
