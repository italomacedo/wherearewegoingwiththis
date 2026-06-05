/**
 * "Adjust" tool overlay (Phase 10.4b) — live calibration of a held prop's attach
 * transform (pos/rot/scale + bone), saved permanently into the game's save.
 *
 * Pure state + the operations the UI fires (open/close, nudge, cycle field/bone,
 * save) are unit-tested; the Babylon GUI is browser-only / istanbul-ignored. The
 * scene wires `onApply` (live preview on the HeldItemRig) and `onSave` (persist the
 * override into SaveGame.heldAttach + re-sync the rig).
 */

import type { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control,
} from '@babylonjs/gui';
import type { ItemAttach, EquipSlot } from '@entities/items/ItemCatalog';
import { UI } from '@systems/UiStyle';
import { AttachAdjuster } from '@systems/AttachAdjuster';

export interface AdjustHandlers {
  /** Live preview while tuning (apply working transform to the attached prop). */
  onApply?: (slot: EquipSlot, attach: ItemAttach) => void;
  /** Persist the tuned override for this item id and re-sync. */
  onSave?: (itemId: string, slot: EquipSlot, attach: ItemAttach) => void;
  /** Called when the overlay closes (restore camera). */
  onClose?: () => void;
}

export class AdjustOverlay {
  private scene: Scene;
  private opened = false;
  private adjuster: AttachAdjuster | null = null;
  private slot: EquipSlot = 'main_hand';
  private handlers: AdjustHandlers = {};

  constructor(scene: Scene) {
    this.scene = scene;
  }

  setHandlers(h: AdjustHandlers): void { this.handlers = h; }

  isOpen(): boolean { return this.opened; }
  getAdjuster(): AttachAdjuster | null { return this.adjuster; }
  getSlot(): EquipSlot { return this.slot; }

  /** Open the tool for one item: seed the adjuster from its current transform. */
  open(itemId: string, slot: EquipSlot, base: ItemAttach, bones: string[]): void {
    this.slot = slot;
    this.adjuster = new AttachAdjuster(itemId, base, bones);
    this.opened = true;
    this.preview();
    this.buildUIBrowser();
    this.refreshBrowser();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.adjuster = null;
    this.handlers.onClose?.();
    this.teardownBrowser();
  }

  private preview(): void {
    if (this.adjuster) this.handlers.onApply?.(this.slot, this.adjuster.value());
  }

  cycleField(dir: number): void { this.adjuster?.cycleField(dir); this.refreshBrowser(); }

  nudge(dir: number): void {
    this.adjuster?.nudge(dir);
    this.preview();
    this.refreshBrowser();
  }

  cycleBone(dir: number): void {
    this.adjuster?.cycleBone(dir);
    this.preview();
    this.refreshBrowser();
  }

  /** Persist the working transform as this item's override. */
  save(): void {
    if (!this.adjuster) return;
    this.handlers.onSave?.(this.adjuster.itemId, this.slot, this.adjuster.value());
    this.refreshBrowser();
  }

  // ── Browser GUI (istanbul-ignored) ──
  /* istanbul ignore next */
  private gui: unknown = null;
  /* istanbul ignore next */
  private readout: unknown = null;

  /* istanbul ignore next — Babylon GUI, browser/Electron only */
  private buildUIBrowser(): void {
    if (typeof document === 'undefined' || this.gui) return;
    const ui = AdvancedDynamicTexture.CreateFullscreenUI('adjust-ui', true, this.scene);
    const panel = new Rectangle('adjust-panel');
    panel.width = '580px';
    panel.height = '180px';
    panel.cornerRadius = UI.cornerLg;
    panel.thickness = 2;
    panel.color = UI.frameBorder;
    panel.background = UI.frameBg;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.top = '-90px';
    ui.addControl(panel);

    const col = new StackPanel();
    col.paddingTop = '10px';
    col.spacing = 4;
    panel.addControl(col);

    const title = new TextBlock('adjust-title', 'ADJUST — held prop');
    title.color = UI.accent;
    title.height = '22px';
    title.fontSize = 14;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    col.addControl(title);

    const readout = new TextBlock('adjust-readout', '');
    readout.color = UI.textBody;
    readout.height = '40px';
    readout.fontSize = 12;
    readout.fontFamily = UI.font;
    readout.textWrapping = true;
    col.addControl(readout);
    this.readout = readout;

    const row = (controls: Array<{ label: string; act: () => void }>): void => {
      const bar = new StackPanel();
      bar.isVertical = false;
      bar.height = '40px';
      bar.spacing = 6;
      for (const c of controls) {
        const b = Button.CreateSimpleButton(`adj-${c.label}`, c.label);
        b.width = '96px';
        b.height = '32px';
        b.color = UI.btnFg;
        b.background = UI.btnBg;
        b.cornerRadius = UI.cornerSm;
        b.fontSize = 12;
        b.fontFamily = UI.font;
        b.thickness = 1;
        b.onPointerEnterObservable.add(() => { b.background = UI.cardBgHover; });
        b.onPointerOutObservable.add(() => { b.background = UI.btnBg; });
        b.onPointerUpObservable.add(() => c.act());
        bar.addControl(b);
      }
      col.addControl(bar);
    };

    row([
      { label: 'Field ◄', act: () => this.cycleField(-1) },
      { label: 'Field ▶', act: () => this.cycleField(1) },
      { label: '  −  ', act: () => this.nudge(-1) },
      { label: '  +  ', act: () => this.nudge(1) },
    ]);
    row([
      { label: 'Bone ◄', act: () => this.cycleBone(-1) },
      { label: 'Bone ▶', act: () => this.cycleBone(1) },
      { label: 'Save', act: () => this.save() },
      { label: 'Close', act: () => this.close() },
    ]);

    this.gui = ui;
  }

  /* istanbul ignore next — browser only */
  private refreshBrowser(): void {
    if (this.readout && this.adjuster) {
      (this.readout as { text: string }).text = this.adjuster.summary();
    }
  }

  /* istanbul ignore next — browser only */
  private teardownBrowser(): void {
    (this.gui as { dispose?: () => void } | null)?.dispose?.();
    this.gui = null;
    this.readout = null;
  }

  /* istanbul ignore next — browser only */
  dispose(): void {
    this.teardownBrowser();
    this.opened = false;
    this.adjuster = null;
  }
}
