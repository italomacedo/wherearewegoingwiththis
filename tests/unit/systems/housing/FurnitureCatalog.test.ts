import {
  FURNITURE_REGISTRY, FURNITURE_REFUND_RATE, furnitureDef, furniturePrice,
  isStorageFurniture, storageCapacityOf, furnitureModel, refundFor, furnitureList,
} from '../../../../src/systems/housing/FurnitureCatalog';

describe('FurnitureCatalog (pure)', () => {
  it('every entry has a model under world/interior, a positive price, and a name key', () => {
    for (const def of Object.values(FURNITURE_REGISTRY)) {
      expect(def.model).toMatch(/^world\/interior\/.+\.glb$/);
      expect(def.price).toBeGreaterThan(0);
      expect(def.nameKey).toMatch(/^furniture\./);
      if (def.storageCapacity !== undefined) expect(def.storageCapacity).toBeGreaterThan(0);
    }
  });

  it('furnitureDef returns the entry or null', () => {
    expect(furnitureDef('kitchen_cabinet1')?.id).toBe('kitchen_cabinet1');
    expect(furnitureDef('nope')).toBeNull();
  });

  it('furniturePrice / furnitureModel are 0/null for unknown ids', () => {
    expect(furniturePrice('bookshelf')).toBe(180);
    expect(furniturePrice('nope')).toBe(0);
    expect(furnitureModel('bookshelf')).toBe('world/interior/bookshelf.glb');
    expect(furnitureModel('nope')).toBeNull();
  });

  it('storage helpers distinguish cabinets from decor', () => {
    expect(isStorageFurniture('kitchen_cabinet1')).toBe(true);
    expect(storageCapacityOf('kitchen_cabinet1')).toBe(60);
    expect(isStorageFurniture('chair_1')).toBe(false);
    expect(storageCapacityOf('chair_1')).toBe(0);
    expect(isStorageFurniture('nope')).toBe(false);
  });

  it('refundFor is the floored fraction of the price', () => {
    expect(FURNITURE_REFUND_RATE).toBe(0.5);
    expect(refundFor('bookshelf')).toBe(90);          // 180 * 0.5
    expect(refundFor('kitchen_cabinetsmall')).toBe(60); // 120 * 0.5
    expect(refundFor('nope')).toBe(0);
  });

  it('furnitureList is stable: storage pieces first, then by ascending price', () => {
    const list = furnitureList();
    expect(list.length).toBe(Object.keys(FURNITURE_REGISTRY).length);
    const firstDecor = list.findIndex((d) => d.storageCapacity === undefined);
    // All storage entries precede the first decor entry.
    expect(list.slice(0, firstDecor).every((d) => d.storageCapacity !== undefined)).toBe(true);
    expect(list.slice(firstDecor).every((d) => d.storageCapacity === undefined)).toBe(true);
    // Within each group, price is non-decreasing.
    const storage = list.slice(0, firstDecor);
    const decor = list.slice(firstDecor);
    for (let i = 1; i < storage.length; i++) expect(storage[i].price).toBeGreaterThanOrEqual(storage[i - 1].price);
    for (let i = 1; i < decor.length; i++) expect(decor[i].price).toBeGreaterThanOrEqual(decor[i - 1].price);
  });
});
