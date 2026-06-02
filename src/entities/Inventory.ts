/**
 * Pure inventory value object (no engine) — Phase 9.
 *
 * Model (owner-locked): a flat list of stacks with a single weight ceiling.
 * One stack entry per item id, capped at the item's `maxStack`; a single
 * `equippedWeaponId` (melee only this phase). No spatial grid.
 */

import {
  itemWeight, itemMaxStack, isWeapon,
} from '@entities/items/ItemCatalog';

export interface InventoryStack {
  id: string;
  qty: number;
}

export interface InventoryState {
  items: InventoryStack[];
  equippedWeaponId: string | null;
  capacityWeight: number;
}

export const DEFAULT_CAPACITY_WEIGHT = 30;

export class Inventory {
  private qtyById = new Map<string, number>();
  private equipped: string | null = null;
  private capacity: number;

  constructor(state?: Partial<InventoryState>) {
    this.capacity = Math.max(0, state?.capacityWeight ?? DEFAULT_CAPACITY_WEIGHT);
    for (const s of state?.items ?? []) {
      if (s && s.id && s.qty > 0) {
        this.qtyById.set(s.id, (this.qtyById.get(s.id) ?? 0) + Math.floor(s.qty));
      }
    }
    const eq = state?.equippedWeaponId ?? null;
    if (eq && this.qtyById.has(eq) && isWeapon(eq)) this.equipped = eq;
  }

  // ── Queries ──
  get capacityWeight(): number { return this.capacity; }
  get equippedWeaponId(): string | null { return this.equipped; }

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

  remainingCapacity(): number { return this.capacity - this.totalWeight(); }
  isOverweight(): boolean { return this.totalWeight() > this.capacity; }

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
      if (this.equipped === id) this.equipped = null;
    }
    return removed;
  }

  /** Equip an owned melee weapon. Returns whether it succeeded. */
  equip(weaponId: string): boolean {
    if (!isWeapon(weaponId) || !this.has(weaponId)) return false;
    this.equipped = weaponId;
    return true;
  }

  unequip(): void { this.equipped = null; }

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
      equippedWeaponId: this.equipped,
      capacityWeight: this.capacity,
    };
  }

  static fromState(state?: Partial<InventoryState>): Inventory {
    return new Inventory(state);
  }
}
