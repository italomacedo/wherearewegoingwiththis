/**
 * Pure inventory value object (no engine) — Phase 9 + Phase 10.
 *
 * Model (owner-locked): a flat list of stacks with a single base weight ceiling.
 * One stack entry per item id, capped at the item's `maxStack`. Phase 10 adds a
 * small **paper-doll**: items are equipped into body slots (`main_hand`, `back`).
 * A backpack on the `back` slot raises the *effective* capacity (`capacityBonus`).
 * The combat weapon is derived: the `main_hand` item, but only when it is a MELEE
 * weapon (a flashlight / cosmetic firearm in hand does not arm the fighter).
 * No spatial grid.
 */

import {
  itemWeight, itemMaxStack, isWeapon, isMeleeWeapon, itemEquipSlot, itemCapacityBonus,
  type EquipSlot,
} from '@entities/items/ItemCatalog';

export interface InventoryStack {
  id: string;
  qty: number;
}

export interface InventoryState {
  items: InventoryStack[];
  /**
   * Equipped item id per body slot. Source of truth for equipment in Phase 10.
   * `equippedWeaponId` below is kept as a derived legacy mirror (main-hand melee).
   */
  equipped?: Partial<Record<EquipSlot, string>>;
  /** Legacy/derived: the main-hand melee weapon id (null if unarmed). */
  equippedWeaponId: string | null;
  capacityWeight: number;
}

export const DEFAULT_CAPACITY_WEIGHT = 30;

/** A fresh, empty inventory state — the new-game / legacy-save default. */
export function defaultInventoryState(): InventoryState {
  return { items: [], equipped: {}, equippedWeaponId: null, capacityWeight: DEFAULT_CAPACITY_WEIGHT };
}

export class Inventory {
  private qtyById = new Map<string, number>();
  private slots = new Map<EquipSlot, string>();
  private capacity: number;

  constructor(state?: Partial<InventoryState>) {
    this.capacity = Math.max(0, state?.capacityWeight ?? DEFAULT_CAPACITY_WEIGHT);
    for (const s of state?.items ?? []) {
      if (s && s.id && s.qty > 0) {
        this.qtyById.set(s.id, (this.qtyById.get(s.id) ?? 0) + Math.floor(s.qty));
      }
    }
    // Restore equipment: prefer the slot map; fall back to the legacy weapon id.
    const equipped = state?.equipped;
    if (equipped) {
      for (const [slot, id] of Object.entries(equipped)) {
        if (id && this.qtyById.has(id) && itemEquipSlot(id) === slot) {
          this.slots.set(slot as EquipSlot, id);
        }
      }
    } else {
      const eq = state?.equippedWeaponId ?? null;
      if (eq && this.qtyById.has(eq) && isWeapon(eq)) this.slots.set('main_hand', eq);
    }
  }

  // ── Queries ──
  get capacityWeight(): number { return this.capacity; }

  /** The main-hand item only when it is a melee weapon (else null → bare fists). */
  get equippedWeaponId(): string | null {
    const main = this.slots.get('main_hand') ?? null;
    return main && isMeleeWeapon(main) ? main : null;
  }

  /** The item equipped in a given body slot (null if empty). */
  equippedIn(slot: EquipSlot): string | null { return this.slots.get(slot) ?? null; }

  /** All occupied slots → item id (a shallow copy). */
  get equipment(): Partial<Record<EquipSlot, string>> {
    return Object.fromEntries(this.slots) as Partial<Record<EquipSlot, string>>;
  }

  /** Effective carry capacity: base ceiling + the bonus of every equipped item. */
  effectiveCapacity(): number {
    let cap = this.capacity;
    for (const id of this.slots.values()) cap += itemCapacityBonus(id);
    return cap;
  }

  /** Stacks, sorted by id for stable output. */
  get items(): readonly InventoryStack[] {
    return [...this.qtyById.entries()]
      .map(([id, qty]) => ({ id, qty }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  isEmpty(): boolean { return this.qtyById.size === 0; }
  count(id: string): number { return this.qtyById.get(id) ?? 0; }
  has(id: string, qty = 1): boolean { return this.count(id) >= qty; }

  totalWeight(): number {
    let w = 0;
    for (const [id, qty] of this.qtyById) w += itemWeight(id) * qty;
    return w;
  }

  remainingCapacity(): number { return this.effectiveCapacity() - this.totalWeight(); }
  isOverweight(): boolean { return this.totalWeight() > this.effectiveCapacity(); }

  /** How many of `id` could be accepted, honouring both stack cap and weight. */
  acceptableQty(id: string, requested: number): number {
    if (requested <= 0) return 0;
    const stackRoom = Math.max(0, itemMaxStack(id) - this.count(id));
    const w = itemWeight(id);
    const weightRoom = w > 0 ? Math.floor(this.remainingCapacity() / w) : Infinity;
    return Math.max(0, Math.min(requested, stackRoom, weightRoom));
  }

  // ── Mutations ──

  /** Add up to the stack cap (ignores weight). Returns the amount actually added. */
  add(id: string, qty = 1): number {
    if (qty <= 0) return 0;
    const cur = this.count(id);
    const next = Math.min(itemMaxStack(id), cur + qty);
    const added = next - cur;
    if (added > 0) this.qtyById.set(id, next);
    return added;
  }

  /** Add only what fits within both the stack cap and the weight ceiling. */
  addRespectingCapacity(id: string, qty = 1): number {
    return this.add(id, this.acceptableQty(id, qty));
  }

  /** Remove up to `qty`. Returns the amount actually removed; unequips if depleted. */
  remove(id: string, qty = 1): number {
    if (qty <= 0) return 0;
    const cur = this.count(id);
    const removed = Math.min(cur, qty);
    const next = cur - removed;
    if (next > 0) this.qtyById.set(id, next);
    else {
      this.qtyById.delete(id);
      // Drop it from any slot it occupied.
      for (const [slot, equippedId] of this.slots) {
        if (equippedId === id) this.slots.delete(slot);
      }
    }
    return removed;
  }

  /**
   * Equip an owned item into a body slot. Validates ownership and that the item
   * belongs in that slot (`itemEquipSlot`). Returns whether it succeeded.
   */
  equipToSlot(slot: EquipSlot, id: string): boolean {
    if (!this.has(id) || itemEquipSlot(id) !== slot) return false;
    this.slots.set(slot, id);
    return true;
  }

  /** Clear a body slot. */
  unequipSlot(slot: EquipSlot): void { this.slots.delete(slot); }

  /** Equip an owned weapon into its natural slot (legacy convenience). */
  equip(weaponId: string): boolean {
    const slot = isWeapon(weaponId) ? itemEquipSlot(weaponId) : undefined;
    if (!slot) return false;
    return this.equipToSlot(slot, weaponId);
  }

  /** Clear the main-hand slot (legacy convenience). */
  unequip(): void { this.slots.delete('main_hand'); }

  /**
   * Move up to `qty` of `id` into `target`, honouring the target's capacity.
   * Returns the amount transferred. Used by corpse loot.
   */
  transferTo(target: Inventory, id: string, qty = 1): number {
    const movable = Math.min(qty, this.count(id));
    const accepted = target.acceptableQty(id, movable);
    if (accepted <= 0) return 0;
    target.add(id, accepted);
    this.remove(id, accepted);
    return accepted;
  }

  // ── Serialization ──
  toState(): InventoryState {
    return {
      items: this.items.map((s) => ({ ...s })),
      equipped: this.equipment,
      equippedWeaponId: this.equippedWeaponId,
      capacityWeight: this.capacity,
    };
  }

  static fromState(state?: Partial<InventoryState>): Inventory {
    return new Inventory(state);
  }
}
