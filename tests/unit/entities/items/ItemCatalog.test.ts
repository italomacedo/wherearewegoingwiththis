import {
  ITEM_REGISTRY, WEAPON_REGISTRY,
  itemDef, weaponDef, isWeapon, itemWeight, itemMaxStack,
} from '../../../../src/entities/items/ItemCatalog';

describe('ItemCatalog', () => {
  it('every weapon id has a matching item entry', () => {
    for (const id of Object.keys(WEAPON_REGISTRY)) {
      expect(ITEM_REGISTRY[id]).toBeDefined();
      expect(ITEM_REGISTRY[id].category).toBe('melee');
    }
  });

  it('all weapons are melee this phase (no firearms shipped)', () => {
    for (const w of Object.values(WEAPON_REGISTRY)) {
      expect(w.attackKind).toBe('melee');
    }
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
});
