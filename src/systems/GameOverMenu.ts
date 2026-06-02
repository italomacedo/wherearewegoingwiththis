import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';

export interface GameOverHandlers {
  /** Reload the player's last save and re-enter the world. */
  onLoad?: () => void;
  /** Abandon the run and return to the main menu. */
  onMainMenu?: () => void;
}

/**
 * Game-over overlay shown when the hero dies. The open/close flag + the action
 * methods (loadLastSave / quitToMainMenu) are pure and testable; the Babylon GUI
 * is browser-only (mirrors PauseMenu). Two choices only: Load last save, or
 * Return to main menu.
 */
export class GameOverMenu {
  private scene: Scene;
  private open = false;
  private handlers: GameOverHandlers = {};

  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  setHandlers(handlers: GameOverHandlers): void { this.handlers = handlers; }
  isOpen(): boolean { return this.open; }

  openMenu(): void {
    this.open = true;
    this.render();
  }

  close(): void {
    this.open = false;
    this.render();
  }

  // ─── Actions (wired to the GUI buttons; also callable directly in tests) ─────

  loadLastSave(): void { this.handlers.onLoad?.(); }
  quitToMainMenu(): void { this.handlers.onMainMenu?.(); }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  private render(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    if (this.panel) this.panel.isVisible = this.open;
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('gameover-ui', true, this.scene);
    this.gui = gui;

    const scrim = new Rectangle('gameover-scrim');
    scrim.width = '100%';
    scrim.height = '100%';
    scrim.background = 'rgba(20,0,4,0.82)';
    scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    const stack = new StackPanel('gameover-stack');
    stack.width = '360px';
    stack.spacing = 14;
    scrim.addControl(stack);

    const title = new TextBlock('gameover-title', t('gameover.title'));
    title.color = '#FF4466';
    title.fontSize = 40;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.height = '70px';
    stack.addControl(title);

    const make = (key: string, label: string, action: () => void): void => {
      const btn = Button.CreateSimpleButton(key, label);
      btn.width = '340px';
      btn.height = '48px';
      btn.color = '#00FFCC';
      btn.background = 'rgba(0,40,50,0.9)';
      btn.fontSize = 17;
      btn.fontFamily = '"Courier New", monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(action);
      stack.addControl(btn);
    };

    make('gameover-load', t('gameover.load').toUpperCase(), () => this.loadLastSave());
    make('gameover-menu', t('gameover.menu').toUpperCase(), () => this.quitToMainMenu());

    scrim.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    scrim.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  }

  dispose(): void {
    this.handlers = {};
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
    }
  }
}
