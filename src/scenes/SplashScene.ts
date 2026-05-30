import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, StackPanel, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class SplashScene extends BaseScene {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0, 0, 0, 1);
  }

  async onEnter(): Promise<void> {
    // Camera required to avoid "No camera defined" on render
    new FreeCamera('splash-cam', Vector3.Zero(), this.babylonScene);
    this.buildVisuals();
    // Fire-and-forget: schedule the next scene AFTER this transition completes,
    // otherwise the SceneManager is still 'transitioning' and the call is ignored.
    this.timer = setTimeout(() => {
      const sceneManager = ServiceLocator.get<SceneManager>('sceneManager');
      void sceneManager.loadScene('studio');
    }, 3000);
  }

  async onExit(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

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
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.width = '600px';
    gui.addControl(panel);

    const logo = new TextBlock('logo');
    logo.text = 'BEIRARIO\nGAMES';
    logo.color = '#00FFCC';
    logo.fontSize = 72;
    logo.fontFamily = '"Courier New", monospace';
    logo.fontStyle = 'bold';
    logo.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    logo.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    logo.height = '200px';
    logo.paddingBottom = '16px';
    panel.addControl(logo);

    const tagline = new TextBlock('tagline');
    tagline.text = '◆  2 0 8 7  ◆';
    tagline.color = '#8844FF';
    tagline.fontSize = 20;
    tagline.fontFamily = '"Courier New", monospace';
    tagline.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    tagline.height = '40px';
    panel.addControl(tagline);
  }
}
