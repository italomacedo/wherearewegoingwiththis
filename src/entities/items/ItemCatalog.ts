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

export type ItemCategory = 'melee' | 'consumable' | 'misc';

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

export const ITEM_REGISTRY: Readonly<Record<string, ItemDef>> = Object.freeze({
  // ── Melee weapons ──
  knife:  { id: 'knife',  nameKey: 'item.knife',  category: 'melee', weight: 0.6, stackable: false, maxStack: 1 },
  pipe:   { id: 'pipe',   nameKey: 'item.pipe',   category: 'melee', weight: 2.0, stackable: false, maxStack: 1 },
  bat:    { id: 'bat',    nameKey: 'item.bat',    category: 'melee', weight: 1.4, stackable: false, maxStack: 1 },
  // ── Consumables ──
  medkit: { id: 'medkit', nameKey: 'item.medkit', category: 'consumable', weight: 0.8, stackable: true, maxStack: 5, heal: 40 },
  // ── Loot / misc (no mechanic yet — seeds future economy) ──
  scrap:  { id: 'scrap',  nameKey: 'item.scrap',  category: 'misc', weight: 0.3, stackable: true, maxStack: 20 },
  credstick: { id: 'credstick', nameKey: 'item.credstick', category: 'misc', weight: 0.1, stackable: true, maxStack: 50 },
});

export const WEAPON_REGISTRY: Readonly<Record<string, WeaponDef>> = Object.freeze({
  knife: { id: 'knife', attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 12, variance: 6, range: 1 },
  pipe:  { id: 'pipe',  attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 15, variance: 6, range: 1 },
  bat:   { id: 'bat',   attackKind: 'melee', skill: 'combate_corpo_a_corpo', damageBase: 14, variance: 7, range: 1 },
});

const ITEM_BY_ID = new Map<string, ItemDef>(Object.values(ITEM_REGISTRY).map((d) => [d.id, d]));
const WEAPON_BY_ID = new Map<string, WeaponDef>(Object.values(WEAPON_REGISTRY).map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef | undefined { return ITEM_BY_ID.get(id); }
export function weaponDef(id: string): WeaponDef | undefined { return WEAPON_BY_ID.get(id); }

/** True when the item exists and is a wieldable weapon. */
export function isWeapon(id: string): boolean { return WEAPON_BY_ID.has(id); }

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
