import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, ScrollViewer, Control,
} from '@babylonjs/gui';
import { buildPdaState, PdaEntry } from '@systems/pda/Pda';
import { t } from '@systems/I18n';

/**
 * PDA overlay (Fase 20) — the player's dossier device. Lists the intel gathered by
 * scanning/hacking NPCs (the `info` skill effect). Same shell/styling as the
 * Character Sheet: pure view model (`buildPdaState`, tested) + browser-only GUI
 * (istanbul-ignored). Opened by the ActionRibbon button or the `P` key.
 */
export interface PdaHandlers {
  onClose?: () => void;
}

export class PdaOverlay {
  private scene: Scene;
  private open = false;
  private handlers: PdaHandlers = {};
  private entries: PdaEntry[] = [];
  private gui: AdvancedDynamicTexture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  isOpen(): boolean { return this.open; }
  setHandlers(h: PdaHandlers): void { this.handlers = h; }

  /** Open the PDA for the given dossiers. */
  show(entries: PdaEntry[]): void {
    if (this.open) return;
    this.entries = entries;
    this.open = true;
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildGui();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    /* istanbul ignore next */
    if (this.gui) { this.gui.dispose(); this.gui = null; }
    this.handlers.onClose?.();
  }

  dispose(): void {
    this.handlers = {};
    /* istanbul ignore next */
    if (this.gui) { this.gui.dispose(); this.gui = null; }
    this.open = false;
  }

  /* istanbul ignore next — browser GUI */
  private buildGui(): void {
    const view = buildPdaState(this.entries);
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('pda-ui', true, this.scene);

    const scrim = new Rectangle('pda-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = 'rgba(2,5,11,0.86)';
    scrim.thickness = 0;
    this.gui.addControl(scrim);

    const frame = new Rectangle('pda-frame');
    frame.width = '78%'; frame.height = '86%';
    frame.background = 'rgba(7,14,24,0.98)';
    frame.color = '#0c4d57';
    frame.thickness = 2;
    frame.cornerRadius = 12;
    scrim.addControl(frame);

    // Header
    const header = new Rectangle('pda-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = '56px';
    header.background = 'rgba(0,28,38,0.95)';
    header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('pda-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = '#00FFCC'; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('pda-title');
    title.text = t('pda.title');
    title.color = '#00FFCC';
    title.fontSize = 22;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '24px';
    header.addControl(title);

    const closeBtn = Button.CreateSimpleButton('pda-close', t('pda.close'));
    closeBtn.width = '116px'; closeBtn.height = '34px';
    closeBtn.color = '#00FFCC'; closeBtn.background = 'rgba(0,40,50,0.9)';
    closeBtn.cornerRadius = 6; closeBtn.fontSize = 13; closeBtn.fontFamily = 'monospace';
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = '-16px';
    closeBtn.onPointerUpObservable.add(() => this.hide());
    header.addControl(closeBtn);

    // Body — scrollable dossier list (or an empty note).
    const scroll = new ScrollViewer('pda-scroll');
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.top = '64px';
    scroll.width = '94%';
    scroll.height = '82%';
    scroll.thickness = 0;
    scroll.barColor = '#00FFCC55';
    scroll.barBackground = 'rgba(255,255,255,0.05)';
    frame.addControl(scroll);

    const panel = new StackPanel('pda-list');
    panel.width = '100%';
    panel.spacing = 8;
    panel.paddingTop = '6px';
    panel.paddingBottom = '12px';
    scroll.addControl(panel);

    if (view.empty) {
      const note = new TextBlock('pda-empty');
      note.text = t('pda.empty');
      note.color = '#6f879b';
      note.fontSize = 13;
      note.fontFamily = 'monospace';
      note.textWrapping = true;
      note.height = '60px';
      panel.addControl(note);
      return;
    }

    for (const e of view.entries) {
      const card = new Rectangle(`pda-card-${e.subjectId}`);
      card.width = '96%';
      card.thickness = 1;
      card.color = '#1d3b46';
      card.background = 'rgba(0,18,28,0.7)';
      card.cornerRadius = 6;
      card.adaptHeightToChildren = true;
      panel.addControl(card);

      const inner = new StackPanel(`pda-inner-${e.subjectId}`);
      inner.width = '100%';
      inner.paddingLeft = '12px'; inner.paddingRight = '12px';
      inner.paddingTop = '8px'; inner.paddingBottom = '10px';
      inner.spacing = 3;
      card.addControl(inner);

      const name = new TextBlock();
      name.text = `▸ ${e.subjectName}`;
      name.color = '#00FFCC';
      name.fontSize = 15;
      name.fontFamily = '"Courier New", monospace';
      name.fontStyle = 'bold';
      name.height = '24px';
      name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      inner.addControl(name);

      for (const line of e.lines) {
        const l = new TextBlock();
        l.text = `· ${line}`;
        l.color = '#aec4d6';
        l.fontSize = 12;
        l.fontFamily = 'monospace';
        l.textWrapping = true;
        l.resizeToFit = true;
        l.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        inner.addControl(l);
      }
    }
  }
}
