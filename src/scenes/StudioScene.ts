import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, StackPanel, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class StudioScene extends BaseScene {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('studio-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    this.timer = setTimeout(() => {
      const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
      void sceneManager.loadScene('publisher');
    }, 2500);
  }

  async onExit(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private buildVisuals(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildStudioScreen();
  }

  /* istanbul ignore next */
  private buildStudioScreen(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('studio-ui', true, this.babylonScene);
    const panel = new StackPanel('panel');
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.width = '500px';
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
}
