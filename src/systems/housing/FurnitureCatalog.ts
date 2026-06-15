/**
 * FurnitureCatalog — pure data + lookups for the in-game housing system (no engine).
 *
 * Mirrors the registry pattern of `ItemCatalog`/`Economy`: a frozen record keyed by
 * id + lookup helpers. Each entry is a buyable furniture piece curated from the
 * Quaternius CC0 interior pack already on disk (`public/assets/world/interior/*.glb`).
 *
 * A piece with `storageCapacity` (kg) is a **storage** piece (cabinet/drawer/…): it
 * holds its own weight-capped Inventory so the player can offload extra kilos at
 * home. A piece without it is pure decor. Prices are FIXED (no market); resale
 * refunds a fixed fraction.
 */

/** Fraction of the purchase price refunded when a placed piece is sold/removed. */
export const FURNITURE_REFUND_RATE = 0.5;

export interface FurnitureDef {
  id: string;
  /** i18n key for the display name. */
  nameKey: string;
  /** GLB path under /assets/ (same space as SceneDoc `prop.model`). */
  model: string;
  /** Fixed purchase price in credits. */
  price: number;
  /** Weight ceiling (kg) of this piece's storage. Present ⇒ it is a storage piece. */
  storageCapacity?: number;
  /** Optional default uniform scale applied when first placed. */
  defaultScale?: number;
}

export const FURNITURE_REGISTRY: Readonly<Record<string, FurnitureDef>> = Object.freeze({
  // ── Storage (have a storageCapacity → functional cabinets) ──
  kitchen_cabinet1:    { id: 'kitchen_cabinet1',    nameKey: 'furniture.kitchen_cabinet1',    model: 'world/interior/kitchen_cabinet1.glb',    price: 220, storageCapacity: 60 },
  kitchen_cabinet2:    { id: 'kitchen_cabinet2',    nameKey: 'furniture.kitchen_cabinet2',    model: 'world/interior/kitchen_cabinet2.glb',    price: 240, storageCapacity: 60 },
  kitchen_cabinetsmall:{ id: 'kitchen_cabinetsmall',nameKey: 'furniture.kitchen_cabinetsmall',model: 'world/interior/kitchen_cabinetsmall.glb',price: 120, storageCapacity: 30, defaultScale: 1.2 },
  drawer_1:            { id: 'drawer_1',            nameKey: 'furniture.drawer_1',            model: 'world/interior/drawer_1.glb',            price: 150, storageCapacity: 40 },
  drawer_2:            { id: 'drawer_2',            nameKey: 'furniture.drawer_2',            model: 'world/interior/drawer_2.glb',            price: 160, storageCapacity: 45 },
  nightstand_1:        { id: 'nightstand_1',        nameKey: 'furniture.nightstand_1',        model: 'world/interior/nightstand_1.glb',        price: 80,  storageCapacity: 20 },
  nightstand_2:        { id: 'nightstand_2',        nameKey: 'furniture.nightstand_2',        model: 'world/interior/nightstand_2.glb',        price: 85,  storageCapacity: 20 },
  bookshelf:           { id: 'bookshelf',           nameKey: 'furniture.bookshelf',           model: 'world/interior/bookshelf.glb',           price: 180, storageCapacity: 50 },
  shelf_large:         { id: 'shelf_large',         nameKey: 'furniture.shelf_large',         model: 'world/interior/shelf_large.glb',         price: 140, storageCapacity: 40 },
  kitchen_fridge:      { id: 'kitchen_fridge',      nameKey: 'furniture.kitchen_fridge',      model: 'world/interior/kitchen_fridge.glb',      price: 300, storageCapacity: 50 },

  // ── Decor (no storage) ──
  bed_single:          { id: 'bed_single',          nameKey: 'furniture.bed_single',          model: 'world/interior/bed_single.glb',          price: 250 },
  bed_king:            { id: 'bed_king',            nameKey: 'furniture.bed_king',            model: 'world/interior/bed_king.glb',            price: 450 },
  couch_small1:        { id: 'couch_small1',        nameKey: 'furniture.couch_small1',        model: 'world/interior/couch_small1.glb',        price: 200 },
  couch_medium1:       { id: 'couch_medium1',       nameKey: 'furniture.couch_medium1',       model: 'world/interior/couch_medium1.glb',       price: 300 },
  couch_large1:        { id: 'couch_large1',        nameKey: 'furniture.couch_large1',        model: 'world/interior/couch_large1.glb',        price: 400 },
  chair_1:             { id: 'chair_1',             nameKey: 'furniture.chair_1',             model: 'world/interior/chair_1.glb',             price: 60 },
  chair_2:             { id: 'chair_2',             nameKey: 'furniture.chair_2',             model: 'world/interior/chair_2.glb',             price: 60 },
  stool:               { id: 'stool',               nameKey: 'furniture.stool',               model: 'world/interior/stool.glb',               price: 30 },
  table_roundsmall:    { id: 'table_roundsmall',    nameKey: 'furniture.table_roundsmall',    model: 'world/interior/table_roundsmall.glb',    price: 90 },
  table_roundlarge:    { id: 'table_roundlarge',    nameKey: 'furniture.table_roundlarge',    model: 'world/interior/table_roundlarge.glb',    price: 160 },
  houseplant_1:        { id: 'houseplant_1',        nameKey: 'furniture.houseplant_1',        model: 'world/interior/houseplant_1.glb',        price: 40 },
  houseplant_3:        { id: 'houseplant_3',        nameKey: 'furniture.houseplant_3',        model: 'world/interior/houseplant_3.glb',        price: 40 },
  carpet_1:            { id: 'carpet_1',            nameKey: 'furniture.carpet_1',            model: 'world/interior/carpet_1.glb',            price: 70 },
  carpet_round:        { id: 'carpet_round',        nameKey: 'furniture.carpet_round',        model: 'world/interior/carpet_round.glb',        price: 70 },
  light_floor1:        { id: 'light_floor1',        nameKey: 'furniture.light_floor1',        model: 'world/interior/light_floor1.glb',        price: 80 },
  light_stand1:        { id: 'light_stand1',        nameKey: 'furniture.light_stand1',        model: 'world/interior/light_stand1.glb',        price: 80 },
  fireplace:           { id: 'fireplace',           nameKey: 'furniture.fireplace',           model: 'world/interior/fireplace.glb',           price: 350 },
});

/** The furniture definition for an id (null if unknown). */
export function furnitureDef(id: string): FurnitureDef | null {
  return FURNITURE_REGISTRY[id] ?? null;
}

/** Fixed purchase price for a furniture id (0 if unknown). */
export function furniturePrice(id: string): number {
  return FURNITURE_REGISTRY[id]?.price ?? 0;
}

/** Whether a furniture id is a storage piece (has a weight capacity). */
export function isStorageFurniture(id: string): boolean {
  return typeof FURNITURE_REGISTRY[id]?.storageCapacity === 'number';
}

/** Storage weight capacity (kg) for a furniture id (0 if not a storage piece). */
export function storageCapacityOf(id: string): number {
  return FURNITURE_REGISTRY[id]?.storageCapacity ?? 0;
}

/** GLB model path for a furniture id (null if unknown). */
export function furnitureModel(id: string): string | null {
  return FURNITURE_REGISTRY[id]?.model ?? null;
}

/** Credits refunded when selling/removing a placed piece (floored fraction of price). */
export function refundFor(id: string): number {
  return Math.floor(furniturePrice(id) * FURNITURE_REFUND_RATE);
}

/** All catalog entries in a stable order for the shop list (storage first, then by price). */
export function furnitureList(): FurnitureDef[] {
  return Object.values(FURNITURE_REGISTRY).sort((a, b) => {
    const sa = a.storageCapacity ? 0 : 1;
    const sb = b.storageCapacity ? 0 : 1;
    return sa !== sb ? sa - sb : a.price - b.price;
  });
}
