import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, StackPanel, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class PublisherScene extends BaseScene {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('publisher-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    this.timer = setTimeout(() => {
      const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
      void sceneManager.loadScene('main-menu');
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
    this.buildPublisherScreen();
  }

  /* istanbul ignore next */
  private buildPublisherScreen(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('publisher-ui', true, this.babylonScene);
    const panel = new StackPanel('panel');
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.width = '500px';
    gui.addControl(panel);

    const line1 = new TextBlock('line1');
    line1.text = 'Published by';
    line1.color = '#AAAAAA';
    line1.fontSize = 18;
    line1.fontFamily = '"Courier New", monospace';
    line1.height = '30px';
    panel.addControl(line1);

    const publisher = new TextBlock('publisher');
    publisher.text = 'BEIRARIO GAMES';
    publisher.color = '#00FFCC';
    publisher.fontSize = 36;
    publisher.fontFamily = '"Courier New", monospace';
    publisher.fontStyle = 'bold';
    publisher.height = '60px';
    panel.addControl(publisher);
  }
}
