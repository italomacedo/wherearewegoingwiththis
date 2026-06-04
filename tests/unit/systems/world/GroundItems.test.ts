import {
  GroundItem, addGroundItem, groundItemsForTile, removeGroundItemAt, nearestGroundItemIndex,
} from '../../../../src/systems/world/GroundItems';

const mk = (tile: [number, number], pos: [number, number, number], id: string, qty = 1): GroundItem =>
  ({ tile, pos, id, qty });

describe('GroundItems', () => {
  it('addGroundItem appends immutably without merging piles', () => {
    const a = mk([0, 0], [1, 0, 2], 'knife');
    const list1 = addGroundItem([], a);
    const list2 = addGroundItem(list1, mk([0, 0], [1, 0, 2], 'knife'));
    expect(list1).toHaveLength(1);
    expect(list2).toHaveLength(2);            // distinct piles, even same id/pos
    expect(list1).not.toBe(list2);            // immutable
  });

  it('groundItemsForTile filters by mosaic tile', () => {
    const items = [mk([0, 0], [1, 0, 1], 'knife'), mk([1, 0], [61, 0, 1], 'medkit'), mk([0, 0], [2, 0, 2], 'phone')];
    expect(groundItemsForTile(items, 0, 0).map((g) => g.id)).toEqual(['knife', 'phone']);
    expect(groundItemsForTile(items, 1, 0).map((g) => g.id)).toEqual(['medkit']);
    expect(groundItemsForTile(items, 5, 5)).toEqual([]);
  });

  it('removeGroundItemAt drops one index immutably; out-of-range = unchanged', () => {
    const items = [mk([0, 0], [0, 0, 0], 'a'), mk([0, 0], [0, 0, 0], 'b'), mk([0, 0], [0, 0, 0], 'c')];
    expect(removeGroundItemAt(items, 1).map((g) => g.id)).toEqual(['a', 'c']);
    expect(removeGroundItemAt(items, -1)).toBe(items);
    expect(removeGroundItemAt(items, 9)).toBe(items);
  });

  it('nearestGroundItemIndex returns the closest pile within radius, else -1', () => {
    const items = [mk([0, 0], [10, 0, 0], 'far'), mk([0, 0], [1, 0, 0.5], 'near'), mk([0, 0], [3, 0, 0], 'mid')];
    expect(nearestGroundItemIndex(items, 0, 0, 2)).toBe(1);   // 'near' (~1.1m) within 2m
    expect(nearestGroundItemIndex(items, 0, 0, 0.5)).toBe(-1); // nothing within 0.5m
    expect(nearestGroundItemIndex([], 0, 0, 5)).toBe(-1);
  });
});
