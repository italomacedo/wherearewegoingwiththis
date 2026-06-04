import {
  TILE_SIZE, GRID_MIN, GRID_MAX, GRID_SIZE,
  tileKey, inBounds, tileOf, tileCenter, tileLocalToWorld,
  neighbors3x3, ringDiff, isBorderEdge,
} from '@systems/world/WorldGrid';

describe('WorldGrid (pure)', () => {
  it('TILE_SIZE = 60 and the grid is 24×24', () => {
    expect(TILE_SIZE).toBe(60);
    expect(GRID_MIN).toBe(0);
    expect(GRID_MAX).toBe(23);
    expect(GRID_SIZE).toBe(24);
  });

  describe('tileOf', () => {
    it('maps origin and tile centres', () => {
      expect(tileOf(0, 0)).toEqual({ tx: 0, tz: 0 });
      expect(tileOf(60, 60)).toEqual({ tx: 1, tz: 1 });
      expect(tileOf(120, 0)).toEqual({ tx: 2, tz: 0 });
    });
    it('boundary at +30 belongs to the next tile; just under stays', () => {
      expect(tileOf(30, 0).tx).toBe(1);
      expect(tileOf(29.999, 0).tx).toBe(0);
      expect(tileOf(-30, 0).tx).toBe(0);
      expect(tileOf(-30.001, 0).tx).toBe(0); // clamped to grid min
    });
    it('clamps out-of-world coordinates into the grid', () => {
      expect(tileOf(99999, 99999)).toEqual({ tx: 23, tz: 23 });
      expect(tileOf(-99999, -99999)).toEqual({ tx: 0, tz: 0 });
    });
  });

  describe('tileCenter / tileLocalToWorld', () => {
    it('centres at multiples of TILE_SIZE', () => {
      expect(tileCenter(0, 0)).toEqual([0, 0, 0]);
      expect(tileCenter(3, 5)).toEqual([180, 0, 300]);
    });
    it('offsets a local position by the tile centre', () => {
      expect(tileLocalToWorld(0, 0, [5, 1, -2])).toEqual([5, 1, -2]);
      expect(tileLocalToWorld(2, 1, [5, 1, -2])).toEqual([125, 1, 58]);
    });
    it('round-trips: tileOf(centre) === tile', () => {
      const [x, , z] = tileCenter(7, 11);
      expect(tileOf(x, z)).toEqual({ tx: 7, tz: 11 });
    });
  });

  describe('inBounds / tileKey', () => {
    it('inBounds respects the 24×24 grid', () => {
      expect(inBounds(0, 0)).toBe(true);
      expect(inBounds(23, 23)).toBe(true);
      expect(inBounds(-1, 0)).toBe(false);
      expect(inBounds(24, 0)).toBe(false);
      expect(inBounds(0, 24)).toBe(false);
    });
    it('tileKey is stable', () => {
      expect(tileKey(3, 5)).toBe('3,5');
    });
  });

  describe('neighbors3x3', () => {
    it('interior tile has 9 neighbors', () => {
      expect(neighbors3x3(5, 5)).toHaveLength(9);
    });
    it('corner tile (0,0) has 4', () => {
      const n = neighbors3x3(0, 0);
      expect(n).toHaveLength(4);
      expect(n.every((c) => c.tx >= 0 && c.tz >= 0)).toBe(true);
    });
    it('edge tile has 6', () => {
      expect(neighbors3x3(0, 5)).toHaveLength(6);
      expect(neighbors3x3(23, 5)).toHaveLength(6);
    });
  });

  describe('ringDiff', () => {
    it('crossing east loads a column and unloads a column', () => {
      const prev = neighbors3x3(5, 5);
      const next = neighbors3x3(6, 5);
      const { toLoad, toUnload } = ringDiff(prev, next);
      expect(toLoad).toHaveLength(3);
      expect(toUnload).toHaveLength(3);
      expect(toLoad.every((c) => c.tx === 7)).toBe(true);
      expect(toUnload.every((c) => c.tx === 4)).toBe(true);
    });
    it('no movement → empty diff', () => {
      const ring = neighbors3x3(5, 5);
      const { toLoad, toUnload } = ringDiff(ring, ring);
      expect(toLoad).toHaveLength(0);
      expect(toUnload).toHaveLength(0);
    });
    it('from empty loads the whole next ring', () => {
      const next = neighbors3x3(0, 0);
      const { toLoad, toUnload } = ringDiff([], next);
      expect(toLoad).toHaveLength(4);
      expect(toUnload).toHaveLength(0);
    });
  });

  describe('isBorderEdge', () => {
    it('corner (0,0) is west + south', () => {
      expect(isBorderEdge(0, 0)).toEqual({ west: true, east: false, south: true, north: false });
    });
    it('corner (23,23) is east + north', () => {
      expect(isBorderEdge(23, 23)).toEqual({ west: false, east: true, south: false, north: true });
    });
    it('interior tile has no border edges', () => {
      expect(isBorderEdge(10, 10)).toEqual({ west: false, east: false, south: false, north: false });
    });
  });
});
