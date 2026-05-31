import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control,
} from '@babylonjs/gui';

export interface PauseMenuHandlers {
  onResume?: () => void;
  onSave?: () => void;
  onLoad?: () => void;
  onMainMenu?: () => void;
}

/**
 * In-game pause overlay (ESC). The open/close state and the action methods
 * (resume/save/load/quitToMainMenu) are pure and testable; the Babylon GUI is
 * browser-only. Save persists the current session to disk (Phase 5 in-game
 * evidence) and the menu stays open so the player can confirm the toast.
 */
export class PauseMenu {
  private scene: Scene;
  private open = false;
  private handlers: PauseMenuHandlers = {};

  // Browser GUI handles (null in Node/Jest).
  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private savedToast: TextBlock | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  setHandlers(handlers: PauseMenuHandlers): void {
    this.handlers = handlers;
  }

  isOpen(): boolean {
    return this.open;
  }

  openMenu(): void {
    this.open = true;
    this.render();
  }

  close(): void {
    this.open = false;
    this.render();
  }

  toggle(): void {
    this.open ? this.close() : this.openMenu();
  }

  // ─── Actions (wired to the GUI buttons; also callable directly in tests) ─────

  resume(): void {
    this.close();
    this.handlers.onResume?.();
  }

  save(): void {
    this.handlers.onSave?.();
    this.flashSaved();
  }

  load(): void {
    this.handlers.onLoad?.();
  }

  quitToMainMenu(): void {
    this.handlers.onMainMenu?.();
  }

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

  private flashSaved(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.flashSavedBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private flashSavedBrowser(): void {
    if (!this.savedToast) return;
    this.savedToast.text = 'Game saved ✓';
    this.savedToast.isVisible = true;
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('pause-ui', true, this.scene);
    this.gui = gui;

    const scrim = new Rectangle('pause-scrim');
    scrim.width = '100%';
    scrim.height = '100%';
    scrim.background = 'rgba(0,6,10,0.78)';
    scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    const stack = new StackPanel('pause-stack');
    stack.width = '320px';
    stack.spacing = 12;
    scrim.addControl(stack);

    const title = new TextBlock('pause-title', 'PAUSED');
    title.color = '#00FFCC';
    title.fontSize = 34;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.height = '60px';
    stack.addControl(title);

    const make = (key: string, label: string, action: () => void): Button => {
      const btn = Button.CreateSimpleButton(key, label);
      btn.width = '300px';
      btn.height = '46px';
      btn.color = '#00FFCC';
      btn.background = 'rgba(0,40,50,0.9)';
      btn.fontSize = 17;
      btn.fontFamily = '"Courier New", monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(action);
      stack.addControl(btn);
      return btn;
    };

    make('pause-resume', 'RESUME', () => this.resume());
    make('pause-save', 'SAVE GAME', () => this.save());
    make('pause-load', 'LOAD GAME', () => this.load());
    make('pause-menu', 'QUIT TO MAIN MENU', () => this.quitToMainMenu());

    const toast = new TextBlock('pause-toast', '');
    toast.color = '#9CFFE9';
    toast.fontSize = 15;
    toast.fontFamily = '"Courier New", monospace';
    toast.height = '28px';
    toast.isVisible = false;
    stack.addControl(toast);
    this.savedToast = toast;

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
      this.savedToast = null;
    }
  }
}
