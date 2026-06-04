import {
  ITEM_REGISTRY, WEAPON_REGISTRY,
  itemDef, weaponDef, isWeapon, isMeleeWeapon, isFirearm, itemWeight, itemMaxStack, weaponProfile,
  itemEquipSlot, itemCapacityBonus, itemHungerRestore, itemModelPath, itemAttach,
} from '../../../../src/entities/items/ItemCatalog';
import { FIST_PROFILE } from '../../../../src/systems/combat/CombatMath';

describe('ItemCatalog', () => {
  it('every weapon id has a matching item entry', () => {
    for (const id of Object.keys(WEAPON_REGISTRY)) {
      expect(ITEM_REGISTRY[id]).toBeDefined();
    }
  });

  it('melee weapon items are in the melee category (or are tools that double as one)', () => {
    for (const w of Object.values(WEAPON_REGISTRY)) {
      if (w.attackKind !== 'melee') continue;
      const def = ITEM_REGISTRY[w.id];
      // Dedicated melee weapons are 'melee'; a tool-weapon (e.g. flashlight) keeps its
      // own category but must declare an equip slot so it can be wielded.
      expect(def.category === 'melee' || !!def.equipSlot).toBe(true);
    }
  });

  it('firearms are modelled ranged but ship as cosmetic misc items (Phase 10)', () => {
    expect(weaponDef('pistol')?.attackKind).toBe('ranged');
    expect(ITEM_REGISTRY.pistol.category).toBe('misc');
    expect(isMeleeWeapon('pistol')).toBe(false); // never arms the melee fighter
    expect(isMeleeWeapon('knife')).toBe(true);
    expect(isFirearm('pistol')).toBe(true);
    expect(isFirearm('knife')).toBe(false);
  });

  it('equip slots / capacity bonus / hunger / model path expose Phase 10 fields', () => {
    expect(itemEquipSlot('knife')).toBe('main_hand');     // weapon defaults to main hand
    expect(itemEquipSlot('backpack')).toBe('back');
    expect(itemEquipSlot('flashlight')).toBe('main_hand');
    expect(itemEquipSlot('phone')).toBeUndefined();        // transient, no fixed slot
    expect(itemEquipSlot('scrap')).toBeUndefined();
    expect(itemCapacityBonus('backpack')).toBe(20);
    expect(itemCapacityBonus('knife')).toBe(0);
    expect(itemHungerRestore('burger')).toBe(40);
    expect(itemHungerRestore('medkit')).toBe(0);
    expect(itemModelPath('knife')).toBe('items/knife.glb');
    expect(itemModelPath('scrap')).toBeUndefined();
    expect(itemAttach('knife')?.scale).toBeCloseTo(0.34, 5); // owner-tuned hand scale
    expect(itemAttach('pipe')).toBeUndefined();              // legacy, no model/transform
    expect(itemAttach('ghost')).toBeUndefined();
  });

  it('itemDef / weaponDef look up by id and return undefined for unknown', () => {
    expect(itemDef('knife')?.category).toBe('melee');
    expect(itemDef('nope')).toBeUndefined();
    expect(weaponDef('pipe')?.damageBase).toBe(15);
    expect(weaponDef('medkit')).toBeUndefined();
  });

  it('isWeapon distinguishes weapons from other items', () => {
    expect(isWeapon('knife')).toBe(true);
    expect(isWeapon('medkit')).toBe(false);
    expect(isWeapon('unknown')).toBe(false);
  });

  it('itemWeight returns the unit weight, 0 for unknown', () => {
    expect(itemWeight('pipe')).toBe(2.0);
    expect(itemWeight('ghost')).toBe(0);
  });

  it('itemMaxStack is 1 for non-stackable, the cap for stackable, 1 for unknown', () => {
    expect(itemMaxStack('knife')).toBe(1);      // non-stackable
    expect(itemMaxStack('medkit')).toBe(5);     // stackable
    expect(itemMaxStack('ghost')).toBe(1);      // unknown
  });

  it('medkit is a consumable that heals', () => {
    expect(ITEM_REGISTRY.medkit.heal).toBe(40);
    expect(ITEM_REGISTRY.medkit.category).toBe('consumable');
  });

  it('weaponProfile resolves a weapon, and falls back to the fist otherwise', () => {
    expect(weaponProfile('knife')).toEqual({ attackKind: 'melee', damageBase: 12, variance: 6, range: 1 });
    expect(weaponProfile(null)).toBe(FIST_PROFILE);
    expect(weaponProfile(undefined)).toBe(FIST_PROFILE);
    expect(weaponProfile('medkit')).toBe(FIST_PROFILE); // not a weapon
    expect(weaponProfile('ghost')).toBe(FIST_PROFILE);   // unknown
  });
});
