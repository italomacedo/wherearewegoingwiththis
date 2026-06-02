/**
 * Item / weapon catalog — pure data + lookups (no engine). Phase 9 foundation.
 *
 * Scope (owner-locked): melee weapons + consumables + loot/misc only. Firearms +
 * ammo are deferred to a future phase, but `WeaponDef.attackKind` already models
 * `'ranged'` so a gun can be added later without reshaping the data.
 *
 * Mirrors the registry pattern of `CharacterStats.SKILLS`/`skillDef` and
 * `CharacterData.SLOT_REGISTRY`: frozen records keyed by id + a lookup helper.
 */

import type { AttackKind, WeaponProfile } from '@systems/combat/CombatMath';
import { FIST_PROFILE } from '@systems/combat/CombatMath';
import type { SkillId } from '@entities/CharacterStats';
import type { CombatClipState } from '@assets/AvatarMeshCatalog';

export type ItemCategory = 'melee' | 'consumable' | 'misc';

/** Body slots of the paper-doll (Phase 10). main_hand = held; back = backpack. */
export type EquipSlot = 'main_hand' | 'back';

/** Transform of a held item relative to the hand bone (tuned in Electron). */
export interface ItemAttach {
  /** Local position offset [x,y,z]. */
  pos: [number, number, number];
  /** Local euler rotation [x,y,z] in radians. */
  rot: [number, number, number];
  /** Uniform scale. */
  scale: number;
}

export interface ItemDef {
  id: string;
  /** i18n key for the display name (translated by the UI / overlay). */
  nameKey: string;
  category: ItemCategory;
  /** Per-unit weight; capacity is a single weight ceiling on the inventory. */
  weight: number;
  /** Whether multiple units share one stack entry. */
  stackable: boolean;
  /** Max units per stack entry (1 for non-stackable). */
  maxStack: number;
  /** Consumable effect: HP restored when used (consumables only). */
  heal?: number;
  // ── Phase 10: visual / equipment / survival fields (all optional) ──
  /** GLB path under /assets/ for the visible held/worn prop (Phase 10). */
  modelPath?: string;
  /** Paper-doll slot this item occupies when equipped. Weapons default to main_hand. */
  equipSlot?: EquipSlot;
  /** Extra carry capacity (kg) granted while equipped — e.g. a backpack on the back. */
  capacityBonus?: number;
  /** Consumable effect: hunger restored when eaten (food). */
  hungerRestore?: number;
  /** Hand-bone attach transform for the held prop (defaults applied if absent). */
  attach?: ItemAttach;
  /** Combat clip key this weapon swings with (defaults by attack kind if absent). */
  holdClip?: CombatClipState;
}

export interface WeaponDef {
  id: string; // matches the ItemDef id
  attackKind: AttackKind;
  /** Governing skill for the to-hit power-ratio (Phase 3 / CombatMath). */
  skill: SkillId;
  /** Base damage before attribute scaling + variance. */
  damageBase: number;
  /** Variance window: a d(0..variance-1) is added to each hit. */
  variance: number;
  /** Reach in metres (melee gate). */
  range: number;
}

/**
 * Held-prop transform helper. `scale` is derived from each GLB's measured bounding
 * box so the prop reads at a realistic size in the avatar's hand (the Survival/Food
 * pack source meshes are authored large — e.g. the knife is ~0.79 u, the axe ~29 u).
 * pos/rot default to origin; fine-tuned in Electron.
 */
const hold = (scale: number, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ItemAttach =>
  ({ pos, rot, scale });

export const ITEM_REGISTRY: Readonly<Record<string, ItemDef>> = Object.freeze({
  // ── Melee weapons (Phase 9 legacy + Phase 10 Survival Pack models) ──
  knife:   { id: 'knife',   nameKey: 'item.knife',   category: 'melee', weight: 0.6, stackable: false, maxStack: 1, modelPath: 'items/knife.glb', attach: hold(0.38) },
  pipe:    { id: 'pipe',    nameKey: 'item.pipe',    category: 'melee', weight: 2.0, stackable: false, maxStack: 1 }, // legacy, no pack model
  bat:     { id: 'bat',     nameKey: 'item.bat',     category: 'melee', weight: 1.4, stackable: false, maxStack: 1 }, // legacy, no pack model
  axe:     { id: 'axe',     nameKey: 'item.axe',     category: 'melee', weight: 2.4, stackable: false, maxStack: 1, modelPath: 'items/axe.glb', attach: hold(0.03) },
  shovel:  { id: 'shovel',  nameKey: 'item.shovel',  category: 'melee', weight: 2.6, stackable: false, maxStack: 1, modelPath: 'items/shovel.glb', attach: hold(0.5) },
  // ── Firearms (Phase 10: COSMETIC only — attach to hand, no shooting/ammo yet) ──
  pistol:  { id: 'pistol',  nameKey: 'item.pistol',  category: 'misc', weight: 1.0, stackable: false, maxStack: 1, equipSlot: 'main_hand', modelPath: 'items/pistol_1.glb', attach: hold(0.14) },
  revolver:{ id: 'revolver',nameKey: 'item.revolver',category: 'misc', weight: 1.2, stackable: false, maxStack: 1, equipSlot: 'main_hand', modelPath: 'items/revolver_1.glb', attach: hold(0.14) },
  shotgun: { id: 'shotgun', nameKey: 'item.shotgun', category: 'misc', weight: 3.5, stackable: false, maxStack: 1, equipSlot: 'main_hand', modelPath: 'items/shotgun_1.glb', attach: hold(0.18) },
  // ── Equipment ──
  backpack:   { id: 'backpack',   nameKey: 'item.backpack',   category: 'misc', weight: 1.5, stackable: false, maxStack: 1, equipSlot: 'back', capacityBonus: 20, modelPath: 'items/backpack.glb', attach: hold(0.33) },
  flashlight: { id: 'flashlight', nameKey: 'item.flashlight', category: 'misc', weight: 0.4, stackable: false, maxStack: 1, equipSlot: 'main_hand', modelPath: 'items/torch.glb', attach: hold(0.2) },
  phone:      { id: 'phone',      nameKey: 'item.phone',      category: 'misc', weight: 0.2, stackable: false, maxStack: 1, modelPath: 'items/phone.glb', attach: hold(0.33) },
  // ── Consumables ──
  medkit: { id: 'medkit', nameKey: 'item.medkit', category: 'consumable', weight: 0.8, stackable: true, maxStack: 5, heal: 40, modelPath: 'items/firstaidkit.glb', attach: hold(0.32) },
  // ── Food (consumable — restores hunger; eaten with an in-hand prop) ──
  burger:      { id: 'burger',      nameKey: 'item.burger',      category: 'consumable', weight: 0.4, stackable: true, maxStack: 5, hungerRestore: 40, heal: 5, modelPath: 'items/food/burger.glb', attach: hold(0.08) },
  cheeseburger:{ id: 'cheeseburger',nameKey: 'item.cheeseburger',category: 'consumable', weight: 0.4, stackable: true, maxStack: 5, hungerRestore: 45, heal: 6, modelPath: 'items/food/cheeseburger.glb', attach: hold(0.08) },
  hotdog:      { id: 'hotdog',      nameKey: 'item.hotdog',      category: 'consumable', weight: 0.3, stackable: true, maxStack: 5, hungerRestore: 30, modelPath: 'items/food/hotdog.glb', attach: hold(0.1) },
  apple:       { id: 'apple',       nameKey: 'item.apple',       category: 'consumable', weight: 0.2, stackable: true, maxStack: 10, hungerRestore: 15, modelPath: 'items/food/apple.glb', attach: hold(0.14) },
  banana:      { id: 'banana',      nameKey: 'item.banana',      category: 'consumable', weight: 0.2, stackable: true, maxStack: 10, hungerRestore: 12, modelPath: 'items/food/banana.glb', attach: hold(0.13) },
  bread:       { id: 'bread',       nameKey: 'item.bread',       category: 'consumable', weight: 0.3, stackable: true, maxStack: 5, hungerRestore: 25, modelPath: 'items/food/bread.glb', attach: hold(0.13) },
  donut:       { id: 'donut',       nameKey: 'item.donut',       category: 'consumable', weight: 0.2, stackable: true, maxStack: 8, hungerRestore: 18, modelPath: 'items/food/donut1.glb', attach: hold(0.14) },
  sushi:       { id: 'sushi',       nameKey: 'item.sushi',       category: 'consumable', weight: 0.3, stackable: true, maxStack: 6, hungerRestore: 22, modelPath: 'items/food/sushi_roll1.glb', attach: hold(0.27) },
  // ── Loot / misc (no mechanic yet — seeds future economy) ──
  scrap:  { id: 'scrap',  nameKey: 'item.scrap',  category: 'misc', weight: 0.3, stackable: true, maxStack: 20 },
  credstick: { id: 'credstick', nameKey: 'item.credstick', category: 'misc', weight: 0.1, stackable: true, maxStack: 50 },
});

export const WEAPON_REGISTRY: Readonly<Record<string, WeaponDef>> = Object.freeze({
  knife:   { id: 'knife',   attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 12, variance: 6, range: 1 },
  pipe:    { id: 'pipe',    attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 15, variance: 6, range: 1 },
  bat:     { id: 'bat',     attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 14, variance: 7, range: 1 },
  axe:     { id: 'axe',     attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 18, variance: 8, range: 1 },
  shovel:  { id: 'shovel',  attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 15, variance: 8, range: 1 },
  // Firearms model `ranged` for a FUTURE phase; cosmetic-only now (combat stays melee).
  pistol:  { id: 'pistol',  attackKind: 'ranged', skill: 'armas_de_fogo', damageBase: 18, variance: 6, range: 20 },
  revolver:{ id: 'revolver',attackKind: 'ranged', skill: 'armas_de_fogo', damageBase: 22, variance: 8, range: 22 },
  shotgun: { id: 'shotgun', attackKind: 'ranged', skill: 'armas_de_fogo', damageBase: 30, variance: 12, range: 12 },
});

const ITEM_BY_ID = new Map<string, ItemDef>(Object.values(ITEM_REGISTRY).map((d) => [d.id, d]));
const WEAPON_BY_ID = new Map<string, WeaponDef>(Object.values(WEAPON_REGISTRY).map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef | undefined { return ITEM_BY_ID.get(id); }
export function weaponDef(id: string): WeaponDef | undefined { return WEAPON_BY_ID.get(id); }

/** True when the item exists and is a wieldable weapon (melee or ranged). */
export function isWeapon(id: string): boolean { return WEAPON_BY_ID.has(id); }

/** True when the item is a MELEE weapon — i.e. it drives the melee combat profile. */
export function isMeleeWeapon(id: string): boolean {
  return WEAPON_BY_ID.get(id)?.attackKind === 'melee';
}

/** GLB model path for the item's visible held/worn prop (undefined if it has none). */
export function itemModelPath(id: string): string | undefined { return ITEM_BY_ID.get(id)?.modelPath; }

/**
 * The paper-doll slot an item occupies when equipped. Explicit `equipSlot` wins;
 * otherwise any weapon defaults to the main hand. Returns undefined for items that
 * cannot be equipped to a body slot (loot, consumables, the transient phone).
 */
export function itemEquipSlot(id: string): EquipSlot | undefined {
  const def = ITEM_BY_ID.get(id);
  if (!def) return undefined;
  if (def.equipSlot) return def.equipSlot;
  return isWeapon(id) ? 'main_hand' : undefined;
}

/** Extra carry capacity (kg) this item grants while equipped (0 if none). */
export function itemCapacityBonus(id: string): number { return ITEM_BY_ID.get(id)?.capacityBonus ?? 0; }

/** Hunger restored when this food is eaten (0 if it is not food). */
export function itemHungerRestore(id: string): number { return ITEM_BY_ID.get(id)?.hungerRestore ?? 0; }

/** The hand-attach transform for an item, or undefined to let the renderer default it. */
export function itemAttach(id: string): ItemAttach | undefined { return ITEM_BY_ID.get(id)?.attach; }

/** Weight of one unit of an item (0 for unknown ids). */
export function itemWeight(id: string): number { return ITEM_BY_ID.get(id)?.weight ?? 0; }

/** Max units per stack entry for an item (1 for unknown / non-stackable). */
export function itemMaxStack(id: string): number {
  const def = ITEM_BY_ID.get(id);
  return def ? (def.stackable ? Math.max(1, def.maxStack) : 1) : 1;
}

/**
 * The combat profile (damage/variance/reach) for an equipped weapon id. Returns the
 * bare-fist profile for null/undefined/unknown/non-weapon ids — so an unarmed
 * fighter behaves exactly as before Phase 9.
 */
export function weaponProfile(weaponId: string | null | undefined): WeaponProfile {
  const def = weaponId ? WEAPON_BY_ID.get(weaponId) : undefined;
  if (!def) return FIST_PROFILE;
  return { attackKind: def.attackKind, damageBase: def.damageBase, variance: def.variance, range: def.range };
}
