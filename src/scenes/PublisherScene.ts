import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class PublisherScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('publisher-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    await this.wait(2500);
    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    await sceneManager.loadScene('main-menu');
  }

  async onExit(): Promise<void> {}

  private buildVisuals(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildPublisherScreen();
  }

  /* istanbul ignore next */
  private buildPublisherScreen(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdvancedDynamicTexture, TextBlock, StackPanel } = require('@babylonjs/gui') as typeof import('@babylonjs/gui');

    const gui = AdvancedDynamicTexture.CreateFullscreenUI('publisher-ui', true, this.babylonScene);
    const panel = new StackPanel('panel');
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

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
