import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, ScrollViewer, Control,
} from '@babylonjs/gui';
import { Inventory } from '@entities/Inventory';
import {
  itemDef, isWeapon, isArmor, itemArmorRegion, itemModelPath, ItemCategory, EquipSlot,
} from '@entities/items/ItemCatalog';
import { t } from '@systems/I18n';
import { UI } from '@systems/UiStyle';

export interface InventoryOverlayHandlers {
  /** Persist after any mutation (equip/use/drop/loot). */
  onChange?: () => void;
  /** Apply a consumable's heal to the player. */
  onHeal?: (amount: number) => void;
  /** Eat food: restore hunger (and trigger the eat animation + in-hand prop). */
  onFeed?: (itemId: string, amount: number) => void;
  /** Called when the overlay closes (unfreeze the world). */
  onClose?: () => void;
  /** Open the Adjust tool to calibrate an equipped prop's attach transform. */
  onAdjust?: (itemId: string, slot: EquipSlot) => void;
  /** Armor (head/top/bottom) equipped or removed — rebuild the avatar region. */
  onEquipArmor?: () => void;
  /** One unit of an item was dropped — place it on the ground at the player (Fase 18). */
  onDrop?: (itemId: string) => void;
}

export type InventoryMode = 'manage' | 'loot' | 'storage';

export interface InventoryRow {
  id: string;
  qty: number;
  name: string;            // i18n display name
  category: ItemCategory;
  weapon: boolean;
  /** Wearable armor piece (Phase 15) — equips to a head/top/bottom slot. */
  armor: boolean;
  consumable: boolean;
  equipped: boolean;
  /** The body slot this item is currently equipped in (for the Adjust button). */
  equippedSlot?: EquipSlot;
  /** Has a visible 3D prop → can be calibrated with the Adjust tool when equipped. */
  hasModel: boolean;
}

/**
 * Inventory overlay (key `I`) — manage the player's pack, or loot a corpse.
 *
 * The open/mode/row-listing and the mutation actions (equip/use/drop/take) are
 * pure and fully unit-tested; only the Babylon GUI build/refresh is browser-only.
 * Mutations go through the pure `Inventory` value object; a medkit heals via the
 * `onHeal` handler and `onChange` lets the scene persist.
 */
export class InventoryOverlay {
  private scene: Scene;
  private open = false;
  private mode: InventoryMode = 'manage';
  private handlers: InventoryOverlayHandlers = {};

  private player: Inventory = new Inventory();
  private source: Inventory | null = null; // the corpse in loot mode
  private sourceName = '';

  // Browser GUI handles (null in Node/Jest).
  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private listPanel: StackPanel | null = null;
  private titleBlock: TextBlock | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  setHandlers(handlers: InventoryOverlayHandlers): void { this.handlers = handlers; }

  isOpen(): boolean { return this.open; }
  getMode(): InventoryMode { return this.mode; }
  getSourceName(): string { return this.sourceName; }

  /** Open to manage the player's own pack. */
  openManage(player: Inventory): void {
    this.player = player;
    this.source = null;
    this.sourceName = '';
    this.mode = 'manage';
    this.open = true;
    this.refresh();
  }

  /** Open to loot a corpse: transfer items from `source` into the player's pack. */
  openLoot(player: Inventory, source: Inventory, sourceName: string): void {
    this.player = player;
    this.source = source;
    this.sourceName = sourceName;
    this.mode = 'loot';
    this.open = true;
    this.refresh();
  }

  /**
   * Open a home storage cabinet: bidirectional transfer between the player's pack
   * and the cabinet's (weight-capped) inventory. Deposit offloads kilos; withdraw
   * pulls them back. The cabinet's own `capacityWeight` gates deposits.
   */
  openStorage(player: Inventory, cabinet: Inventory, cabinetName: string): void {
    this.player = player;
    this.source = cabinet;
    this.sourceName = cabinetName;
    this.mode = 'storage';
    this.open = true;
    this.refresh();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.source = null;
    this.render();
    this.handlers.onClose?.();
  }

  // ─── Pure actions (also wired to GUI buttons) ────────────────────────────────

  /** Equip an owned weapon (main hand) or armor piece (its region slot). */
  equip(id: string): void {
    const armor = isArmor(id);
    const region = itemArmorRegion(id);
    const ok = armor && region ? this.player.equipToSlot(region, id) : this.player.equip(id);
    if (!ok) return;
    this.handlers.onChange?.();
    if (armor) this.handlers.onEquipArmor?.();
    this.refresh();
  }

  /**
   * Unequip an item. With no id (legacy), clears the main hand. With an armor id,
   * clears that piece's region slot (and rebuilds the avatar via onEquipArmor).
   */
  unequip(id?: string): void {
    if (id && isArmor(id)) {
      const slot = this.equippedSlotOf(id);
      if (!slot) return;
      this.player.unequipSlot(slot);
      this.handlers.onChange?.();
      this.handlers.onEquipArmor?.();
      this.refresh();
      return;
    }
    this.player.unequip();
    this.handlers.onChange?.();
    this.refresh();
  }

  /** Use one consumable: heals (medkit) and/or restores hunger (food); consumed. */
  useItem(id: string): void {
    const def = itemDef(id);
    if (!def || def.category !== 'consumable' || !this.player.has(id)) return;
    if (def.heal && def.heal > 0) this.handlers.onHeal?.(def.heal);
    if (def.hungerRestore && def.hungerRestore > 0) this.handlers.onFeed?.(id, def.hungerRestore);
    this.player.remove(id, 1);
    this.handlers.onChange?.();
    this.refresh();
  }

  /** Drop one of an item onto the ground at the player's feet (Fase 18). */
  drop(id: string): void {
    if (this.player.remove(id, 1) > 0) {
      this.handlers.onDrop?.(id);   // scene records + renders the ground pile
      this.handlers.onChange?.();
      this.refresh();
    }
  }

  /** Loot one of an item from the corpse into the player's pack (capacity-aware). */
  take(id: string): void {
    if (!this.source) return;
    if (this.source.transferTo(this.player, id, 1) > 0) { this.handlers.onChange?.(); this.refresh(); }
  }

  /** Storage: move one of an item from the player's pack INTO the cabinet
   *  (gated by the cabinet's weight capacity). */
  deposit(id: string): void {
    if (!this.source) return;
    if (this.player.transferTo(this.source, id, 1) > 0) { this.handlers.onChange?.(); this.refresh(); }
  }

  /** Storage: move one of an item OUT of the cabinet into the player's pack
   *  (gated by the pack's weight capacity). */
  withdraw(id: string): void {
    if (!this.source) return;
    if (this.source.transferTo(this.player, id, 1) > 0) { this.handlers.onChange?.(); this.refresh(); }
  }

  /** The slot an item is currently equipped in within an inventory, if any. */
  private equippedSlotIn(inv: Inventory, id: string): EquipSlot | undefined {
    const eq = inv.equipment;
    return (Object.keys(eq) as EquipSlot[]).find((s) => eq[s] === id);
  }

  /** The slot the item is equipped in on the player (for the Adjust action). */
  private equippedSlotOf(id: string): EquipSlot | undefined {
    return this.equippedSlotIn(this.player, id);
  }

  /** Open the Adjust tool for an equipped prop (closes the inventory first). */
  adjust(id: string): void {
    const slot = this.equippedSlotOf(id);
    if (!slot || !this.handlers.onAdjust) return;
    this.handlers.onAdjust(id, slot);
    this.close();
  }

  /** Loot everything the corpse carries (within capacity). */
  takeAll(): void {
    if (!this.source) return;
    let moved = 0;
    for (const stack of this.source.items) {
      moved += this.source.transferTo(this.player, stack.id, stack.qty);
    }
    if (moved > 0) { this.handlers.onChange?.(); this.refresh(); }
  }

  // ─── Row listings (pure, for the GUI + tests) ────────────────────────────────

  private rowsOf(inv: Inventory): InventoryRow[] {
    return inv.items.map((s) => {
      const def = itemDef(s.id);
      const slot = this.equippedSlotIn(inv, s.id);
      const armor = isArmor(s.id);
      return {
        id: s.id,
        qty: s.qty,
        name: def ? t(def.nameKey) : s.id,
        category: def?.category ?? 'misc',
        weapon: isWeapon(s.id),
        armor,
        consumable: def?.category === 'consumable',
        equipped: armor ? !!slot : inv.equippedWeaponId === s.id,
        equippedSlot: slot,
        hasModel: !!itemModelPath(s.id),
      };
    });
  }

  /** Rows of the player's pack. */
  playerRows(): InventoryRow[] { return this.rowsOf(this.player); }

  /** Rows of the corpse being looted (empty when not in loot mode). */
  sourceRows(): InventoryRow[] { return this.source ? this.rowsOf(this.source) : []; }

  // ─── Browser GUI (istanbul-ignored) ──────────────────────────────────────────

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

  private refresh(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.refreshBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('inventory-ui', true, this.scene);
    this.gui = gui;

    const scrim = new Rectangle('inv-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = UI.scrim; scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    const frame = new Rectangle('inv-frame');
    frame.width = '600px'; frame.height = '600px';
    frame.background = UI.frameBg; frame.color = UI.frameBorder;
    frame.thickness = 2; frame.cornerRadius = UI.cornerLg;
    scrim.addControl(frame);

    // Header with accent line and title.
    const header = new Rectangle('inv-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = UI.headerHeight;
    header.background = UI.headerBg; header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('inv-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = UI.accent; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('inv-title', '');
    title.color = UI.accent;
    title.fontSize = UI.fontTitle;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '24px';
    header.addControl(title);
    this.titleBlock = title;

    const close = Button.CreateSimpleButton('inv-close', t('inventory.close').toUpperCase());
    close.width = '116px'; close.height = '34px';
    close.color = UI.btnFg; close.background = UI.btnBg;
    close.cornerRadius = UI.cornerSm;
    close.fontSize = 13; close.fontFamily = 'monospace';
    close.thickness = 1;
    close.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    close.left = '-16px';
    close.onPointerUpObservable.add(() => this.close());
    header.addControl(close);

    // Scrollable item list inside the frame.
    const scroll = new ScrollViewer('inv-scroll');
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.top = '64px';
    scroll.width = '94%';
    scroll.height = '86%';
    scroll.thickness = 0;
    scroll.barColor = UI.accentSoft;
    scroll.barBackground = UI.accentBgSoft;
    frame.addControl(scroll);

    const list = new StackPanel('inv-list');
    list.width = '100%';
    list.spacing = 6;
    list.paddingTop = '6px';
    list.paddingBottom = '10px';
    scroll.addControl(list);
    this.listPanel = list;
  }

  /* istanbul ignore next — browser GUI only */
  private refreshBrowser(): void {
    const list = this.listPanel;
    if (!list) return;
    this.render();
    if (this.titleBlock) {
      this.titleBlock.text = this.mode === 'loot'
        ? t('inventory.lootTitle', { name: this.sourceName })
        : this.mode === 'storage'
          ? t('housing.storageTitle', { name: this.sourceName })
          : t('inventory.title');
    }
    list.clearControls();

    const addRow = (row: InventoryRow, actions: Array<{ key: string; label: string; act: () => void }>): void => {
      const line = new Rectangle(`inv-row-${row.id}`);
      line.height = '40px';
      line.thickness = 0;
      const bar = new StackPanel();
      bar.isVertical = false;
      bar.height = '40px';
      line.addControl(bar);

      const label = new TextBlock('', `${row.name} ×${row.qty}${row.equipped ? '  ◆' : ''}`);
      label.color = '#CFFAF0';
      label.fontSize = 15;
      label.fontFamily = '"Courier New", monospace';
      label.width = '240px';
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bar.addControl(label);

      for (const a of actions) {
        const btn = Button.CreateSimpleButton(`${row.id}-${a.key}`, a.label);
        btn.width = '80px';
        btn.height = '32px';
        btn.color = '#00FFCC';
        btn.background = 'rgba(0,40,50,0.9)';
        btn.fontSize = 13;
        btn.fontFamily = '"Courier New", monospace';
        btn.thickness = 1;
        btn.paddingLeft = '4px';
        btn.onPointerUpObservable.add(a.act);
        bar.addControl(btn);
      }
      list.addControl(line);
    };

    if (this.mode === 'storage') {
      // A weight readout for the offload loop: PACK then CABINET usage.
      const cap = this.source?.effectiveCapacity() ?? 0;
      const used = this.source?.totalWeight() ?? 0;
      const info = new TextBlock('inv-storage-info',
        `${t('housing.pack')}: ${this.player.totalWeight().toFixed(1)}/${this.player.effectiveCapacity().toFixed(0)} kg`
        + `    ${t('housing.cabinet')}: ${used.toFixed(1)}/${cap.toFixed(0)} kg`);
      info.color = UI.accent;
      info.fontSize = 13;
      info.fontFamily = '"Courier New", monospace';
      info.height = '28px';
      list.addControl(info);

      const head = new TextBlock('inv-storage-pack', t('housing.yourPack').toUpperCase());
      head.color = '#7FE9D8'; head.fontSize = 12; head.fontFamily = '"Courier New", monospace';
      head.height = '22px'; head.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      list.addControl(head);
      for (const row of this.playerRows()) {
        addRow(row, [{ key: 'dep', label: t('housing.deposit'), act: () => this.deposit(row.id) }]);
      }
      const head2 = new TextBlock('inv-storage-cab', t('housing.inCabinet').toUpperCase());
      head2.color = '#7FE9D8'; head2.fontSize = 12; head2.fontFamily = '"Courier New", monospace';
      head2.height = '22px'; head2.paddingTop = '8px'; head2.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      list.addControl(head2);
      for (const row of this.sourceRows()) {
        addRow(row, [{ key: 'wd', label: t('housing.withdraw'), act: () => this.withdraw(row.id) }]);
      }
    } else if (this.mode === 'loot') {
      for (const row of this.sourceRows()) {
        addRow(row, [{ key: 'take', label: t('inventory.take'), act: () => this.take(row.id) }]);
      }
      const allBtn = Button.CreateSimpleButton('inv-takeall', t('inventory.takeAll').toUpperCase());
      allBtn.width = '200px';
      allBtn.height = '36px';
      allBtn.color = '#00FFCC';
      allBtn.background = 'rgba(0,50,40,0.9)';
      allBtn.fontSize = 14;
      allBtn.fontFamily = '"Courier New", monospace';
      allBtn.thickness = 1;
      allBtn.onPointerUpObservable.add(() => this.takeAll());
      list.addControl(allBtn);
    } else {
      for (const row of this.playerRows()) {
        const actions: Array<{ key: string; label: string; act: () => void }> = [];
        if (row.weapon) {
          actions.push(row.equipped
            ? { key: 'uneq', label: t('inventory.unequip'), act: () => this.unequip() }
            : { key: 'eq', label: t('inventory.equip'), act: () => this.equip(row.id) });
        }
        if (row.armor) {
          actions.push(row.equipped
            ? { key: 'uneq', label: t('inventory.unequip'), act: () => this.unequip(row.id) }
            : { key: 'eq', label: t('inventory.equip'), act: () => this.equip(row.id) });
        }
        if (row.consumable) actions.push({ key: 'use', label: t('inventory.use'), act: () => this.useItem(row.id) });
        // Adjust the held-prop attach transform (only when equipped + has a model).
        if (row.equippedSlot && row.hasModel && this.handlers.onAdjust) {
          actions.push({ key: 'adj', label: t('inventory.adjust'), act: () => this.adjust(row.id) });
        }
        actions.push({ key: 'drop', label: t('inventory.drop'), act: () => this.drop(row.id) });
        addRow(row, actions);
      }
    }
  }

  dispose(): void {
    this.handlers = {};
    this.source = null;
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
      this.listPanel = null;
      this.titleBlock = null;
    }
  }
}
