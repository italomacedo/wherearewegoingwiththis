import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Button, StackPanel, Control,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';

/**
 * The main action ribbon (Phase 11): a always-visible bar at the bottom-centre of
 * the world HUD with Attack Ranged · Attack Melee · Talk · Inventory. Clicking an
 * attack enters out-of-combat surprise-attack aiming; Talk opens the chat;
 * Inventory opens the pack overlay.
 *
 * The button set + enabled gating is pure/testable (`ribbonButtons`); the Babylon
 * GUI is browser-only. Attack Ranged is enabled only with a firearm in hand.
 */

export interface ActionRibbonHandlers {
  onAttackRanged?: () => void;
  onAttackMelee?: () => void;
  onTalk?: () => void;
  onInventory?: () => void;
  onCharacterSheet?: () => void;
  onPda?: () => void;
}

export type RibbonKey = 'attackRanged' | 'attackMelee' | 'talk' | 'inventory' | 'characterSheet' | 'pda';

export interface RibbonButton {
  key: RibbonKey;
  labelKey: string;
  enabled: boolean;
}

/**
 * Pure: the ordered ribbon buttons with their enabled state. Attack Ranged needs a
 * firearm equipped; the rest are always available (melee falls back to fists).
 */
export function ribbonButtons(hasFirearm: boolean): RibbonButton[] {
  return [
    { key: 'attackRanged', labelKey: 'ribbon.attackRanged', enabled: hasFirearm },
    { key: 'attackMelee', labelKey: 'ribbon.attackMelee', enabled: true },
    { key: 'talk', labelKey: 'ribbon.talk', enabled: true },
    { key: 'inventory', labelKey: 'ribbon.inventory', enabled: true },
    { key: 'characterSheet', labelKey: 'ribbon.characterSheet', enabled: true },
    { key: 'pda', labelKey: 'ribbon.pda', enabled: true },
  ];
}

export class ActionRibbon {
  private scene: Scene;
  private handlers: ActionRibbonHandlers = {};
  private hasFirearm = false;
  private visible = true;

  private gui: AdvancedDynamicTexture | null = null;
  private bar: StackPanel | null = null;
  private buttonsByKey = new Map<RibbonKey, Button>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  setHandlers(handlers: ActionRibbonHandlers): void {
    this.handlers = handlers;
  }

  /** Reflect the player's loadout: a firearm in hand enables Attack Ranged. */
  setFirearmEquipped(hasFirearm: boolean): void {
    if (this.hasFirearm === hasFirearm) return;
    this.hasFirearm = hasFirearm;
    this.refresh();
  }

  /** Show/hide the whole ribbon (hidden during combat/dialog/overlays/vehicle). */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.refresh();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Dispatch a button press (pure-callable in tests). */
  press(key: RibbonKey): void {
    const enabled = ribbonButtons(this.hasFirearm).find((b) => b.key === key)?.enabled;
    if (!enabled) return;
    if (key === 'attackRanged') this.handlers.onAttackRanged?.();
    else if (key === 'attackMelee') this.handlers.onAttackMelee?.();
    else if (key === 'talk') this.handlers.onTalk?.();
    else if (key === 'inventory') this.handlers.onInventory?.();
    else if (key === 'characterSheet') this.handlers.onCharacterSheet?.();
    else if (key === 'pda') this.handlers.onPda?.();
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  private refresh(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.refreshBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private refreshBrowser(): void {
    if (this.bar) this.bar.isVisible = this.visible;
    const states = ribbonButtons(this.hasFirearm);
    for (const b of states) {
      const btn = this.buttonsByKey.get(b.key);
      if (!btn) continue;
      btn.isEnabled = b.enabled;
      btn.alpha = b.enabled ? 1 : 0.4;
      btn.color = b.enabled ? '#00FFCC' : '#557';
    }
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('ribbon-ui', true, this.scene);
    this.gui = gui;

    const bar = new StackPanel('action-ribbon');
    bar.isVertical = false;
    bar.height = '40px';
    bar.spacing = 8;
    bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bar.top = '-44px'; // above the control-hint line (-12px); prompt sits above this
    gui.addControl(bar);
    this.bar = bar;

    for (const b of ribbonButtons(this.hasFirearm)) {
      const btn = Button.CreateSimpleButton(`ribbon-${b.key}`, t(b.labelKey));
      btn.width = '150px';
      btn.height = '36px';
      btn.color = '#00FFCC';
      btn.background = 'rgba(0,40,50,0.9)';
      btn.fontSize = 14;
      btn.fontFamily = '"Courier New", monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(() => this.press(b.key));
      bar.addControl(btn);
      this.buttonsByKey.set(b.key, btn);
    }
    this.refreshBrowser();
  }

  dispose(): void {
    this.handlers = {};
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.bar = null;
      this.buttonsByKey.clear();
    }
  }
}
