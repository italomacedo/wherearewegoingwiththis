import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, StackPanel } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class SplashScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    // Camera required to avoid "No camera defined" on render
    new FreeCamera('splash-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    await this.wait(3000);
    const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
    await sceneManager.loadScene('studio');
  }

  async onExit(): Promise<void> {}

  /** Creates neon logo overlay. No-op in Node.js (OffscreenCanvas unavailable). */
  private buildVisuals(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser/Electron path */
    this.buildNeonLogo();
  }

  /* istanbul ignore next */
  private buildNeonLogo(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('splash-ui', true, this.babylonScene);

    const panel = new StackPanel('panel');
    panel.verticalAlignment = 1; // center
    gui.addControl(panel);

    const logo = new TextBlock('logo');
    logo.text = 'BEIRARIO\nGAMES';
    logo.color = '#00FFCC';
    logo.fontSize = 72;
    logo.fontFamily = '"Courier New", monospace';
    logo.fontStyle = 'bold';
    logo.textHorizontalAlignment = 1; // center
    logo.height = '180px';
    logo.paddingBottom = '16px';
    panel.addControl(logo);

    const tagline = new TextBlock('tagline');
    tagline.text = '◆  2 0 8 7  ◆';
    tagline.color = '#8844FF';
    tagline.fontSize = 20;
    tagline.fontFamily = '"Courier New", monospace';
    tagline.height = '40px';
    panel.addControl(tagline);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
