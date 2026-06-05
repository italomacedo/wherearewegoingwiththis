import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { UI } from '@systems/UiStyle';

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
    scrim.width = '100%'; scrim.height = '100%';
    // Red-tinted scrim — keeps the "death" mood while sharing the centred-frame shell.
    scrim.background = 'rgba(20,0,4,0.86)'; scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    const frame = new Rectangle('gameover-frame');
    frame.width = '420px'; frame.height = '300px';
    frame.background = UI.frameBg;
    frame.color = '#5a0b1b'; // dark red border instead of teal — fits the GAME OVER mood
    frame.thickness = 2; frame.cornerRadius = UI.cornerLg;
    scrim.addControl(frame);

    // Header with red accent line.
    const header = new Rectangle('gameover-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = UI.headerHeight;
    header.background = 'rgba(40,4,10,0.95)'; header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('gameover-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = '#ff4466'; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('gameover-title', t('gameover.title'));
    title.color = '#ff5577';
    title.fontSize = UI.fontTitle;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    header.addControl(title);

    const stack = new StackPanel('gameover-stack');
    stack.width = '360px';
    stack.spacing = 12;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stack.top = '88px';
    frame.addControl(stack);

    const make = (key: string, label: string, action: () => void): void => {
      const btn = Button.CreateSimpleButton(key, label);
      btn.width = '340px';
      btn.height = '46px';
      btn.color = UI.btnFg;
      btn.background = UI.btnBg;
      btn.cornerRadius = UI.cornerSm;
      btn.fontSize = 15;
      btn.fontFamily = UI.font;
      btn.thickness = 1;
      btn.onPointerEnterObservable.add(() => { btn.background = UI.cardBgHover; });
      btn.onPointerOutObservable.add(() => { btn.background = UI.btnBg; });
      btn.onPointerUpObservable.add(action);
      stack.addControl(btn);
    };

    make('gameover-load', t('gameover.load').toUpperCase(), () => this.loadLastSave());
    make('gameover-menu', t('gameover.menu').toUpperCase(), () => this.quitToMainMenu());
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
