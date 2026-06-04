import {
  TILE_SIZE, GRID_MIN, GRID_MAX, GRID_SIZE,
  tileKey, inBounds, tileOf, tileCenter, tileLocalToWorld,
  neighbors3x3, ringDiff, isBorderEdge,
  borderWallColliders, worldFloorBox, worldCenter, WORLD_HALF_EXTENT,
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

  describe('borderWallColliders', () => {
    it('interior tile has no walls', () => {
      expect(borderWallColliders(10, 10)).toEqual([]);
    });
    it('corner (0,0) gets a west + south wall at the world edge', () => {
      const walls = borderWallColliders(0, 0);
      expect(walls.map((w) => w.key).sort()).toEqual(['wall-0-0-s', 'wall-0-0-w']);
      const west = walls.find((w) => w.key === 'wall-0-0-w')!;
      expect(west.position[0]).toBe(-30); // x = centre(0) - ZONE_HALF
      const south = walls.find((w) => w.key === 'wall-0-0-s')!;
      expect(south.position[2]).toBe(-30);
    });
    it('corner (23,23) gets east + north walls at the far world edge', () => {
      const walls = borderWallColliders(23, 23);
      expect(walls.map((w) => w.key).sort()).toEqual(['wall-23-23-e', 'wall-23-23-n']);
      const east = walls.find((w) => w.key === 'wall-23-23-e')!;
      expect(east.position[0]).toBe(23 * 60 + 30);
    });
    it('edge tile (0,5) gets only the west wall', () => {
      const walls = borderWallColliders(0, 5);
      expect(walls).toHaveLength(1);
      expect(walls[0].key).toBe('wall-0-5-w');
      expect(walls[0].position[2]).toBe(5 * 60); // centred on the tile's z
    });
  });

  describe('world extents', () => {
    it('worldCenter is the midpoint of tiles 0..23', () => {
      expect(worldCenter()).toEqual([690, 0, 690]);
    });
    it('WORLD_HALF_EXTENT covers half the 24×24 span', () => {
      expect(WORLD_HALF_EXTENT).toBe((24 * 60) / 2);
    });
    it('worldFloorBox spans the whole world, centred, 1 thick below y=0', () => {
      const f = worldFloorBox();
      expect(f.key).toBe('col-world-floor');
      expect(f.size).toEqual([1440, 1, 1440]);
      expect(f.position).toEqual([690, -0.5, 690]);
    });
  });
});
