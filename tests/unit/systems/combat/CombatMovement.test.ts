import {
  buildWalkGrid, gridPath, gridPathfinder, Obstacle, Bounds,
} from '@systems/combat/CombatMovement';

const BOUNDS: Bounds = { minX: 0, maxX: 6, minZ: 0, maxZ: 6 };

/** A vertical wall covering grid column 2 (x∈[2,3]) for z∈[zMin,zMax]. */
function wall(zCentre: number, depth: number): Obstacle {
  return { position: [2.5, 0, zCentre], size: [1, 4, depth] };
}

describe('buildWalkGrid', () => {
  it('sizes the grid from the bounds and the cell size', () => {
    const g = buildWalkGrid([], BOUNDS, 1, 0);
    expect(g.cols).toBe(6);
    expect(g.rows).toBe(6);
    expect(g.blocked.every((b) => !b)).toBe(true);
  });

  it('marks cells whose centre falls inside an obstacle footprint', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS, 1, 0); // x∈[2,3] (col 2), z∈[0,4] (rows 0..3)
    const at = (c: number, r: number) => g.blocked[r * g.cols + c];
    expect(at(2, 0)).toBe(true);
    expect(at(2, 3)).toBe(true);
    expect(at(2, 4)).toBe(false); // wall ends before row 4
    expect(at(1, 0)).toBe(false);
  });

  it('inflates obstacles by the agent half-width', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS, 1, 0.6); // x∈[1.4,3.6] → cols 1,2,3
    const at = (c: number, r: number) => g.blocked[r * g.cols + c];
    expect(at(1, 0)).toBe(true);
    expect(at(3, 0)).toBe(true);
  });

  it('uses default cell (1 m) and inflate (0.5 m) when omitted', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS); // defaults
    expect(g.cell).toBe(1);
    const at = (c: number, r: number) => g.blocked[r * g.cols + c];
    expect(at(1, 0)).toBe(true); // inflate 0.5 spreads the col-2 wall into col 1
  });

  it('clamps a degenerate (zero-size) bounds to at least one cell', () => {
    const g = buildWalkGrid([], { minX: 4, maxX: 4, minZ: 4, maxZ: 4 }, 1, 0);
    expect(g.cols).toBe(1);
    expect(g.rows).toBe(1);
  });
});

describe('gridPath', () => {
  it('routes straight across open ground and reports the length', () => {
    const g = buildWalkGrid([], BOUNDS, 1, 0);
    const path = gridPath(g, { x: 0.5, z: 0.5 }, { x: 0.5, z: 3.5 })!;
    expect(path).not.toBeNull();
    expect(path.meters).toBeCloseTo(3, 5);
    expect(path.points[0]).toEqual({ x: 0.5, z: 0.5 });
    expect(path.points[path.points.length - 1]).toEqual({ x: 0.5, z: 3.5 });
  });

  it('routes around a partial wall (longer than the straight line)', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS, 1, 0); // blocks col 2, rows 0..3
    const from = { x: 0.5, z: 0.5 };
    const to = { x: 5.5, z: 0.5 };
    const path = gridPath(g, from, to)!;
    expect(path).not.toBeNull();
    expect(path.meters).toBeGreaterThan(5); // straight line would be 5 m
  });

  it('returns null when the goal cell is blocked', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS, 1, 0);
    expect(gridPath(g, { x: 0.5, z: 0.5 }, { x: 2.5, z: 1.5 })).toBeNull();
  });

  it('returns null when the start cell is blocked', () => {
    const g = buildWalkGrid([wall(2, 4)], BOUNDS, 1, 0);
    expect(gridPath(g, { x: 2.5, z: 1.5 }, { x: 0.5, z: 0.5 })).toBeNull();
  });

  it('returns null when the goal is walled off entirely', () => {
    const g = buildWalkGrid([wall(3, 6)], BOUNDS, 1, 0); // full-height wall in col 2
    expect(gridPath(g, { x: 0.5, z: 0.5 }, { x: 5.5, z: 0.5 })).toBeNull();
  });

  it('does not cut diagonally through a wall corner', () => {
    // A wall plug forces an L-shaped detour rather than a single diagonal squeeze.
    const g = buildWalkGrid([wall(3, 6)], BOUNDS, 1, 0);
    // Same side of the wall: a short reachable hop still works.
    const path = gridPath(g, { x: 0.5, z: 0.5 }, { x: 1.5, z: 5.5 });
    expect(path).not.toBeNull();
    expect(path!.meters).toBeGreaterThan(0);
  });

  it('clamps out-of-bounds endpoints into the grid', () => {
    const g = buildWalkGrid([], BOUNDS, 1, 0);
    const path = gridPath(g, { x: -50, z: -50 }, { x: 50, z: 50 })!;
    expect(path).not.toBeNull();
    expect(path.meters).toBeGreaterThan(0);
  });

  it('detours around a single blocked cell without corner-cutting', () => {
    // One blocked cell at (1,1): a path skirting it must step orthogonally.
    const g = buildWalkGrid([{ position: [1.5, 0, 1.5], size: [1, 4, 1] }], BOUNDS, 1, 0);
    const path = gridPath(g, { x: 0.5, z: 0.5 }, { x: 2.5, z: 2.5 })!;
    expect(path).not.toBeNull();
    // The blocked cell centre (1.5,1.5) must not appear on the routed polyline.
    expect(path.points.some((p) => p.x === 1.5 && p.z === 1.5)).toBe(false);
  });
});

describe('gridPathfinder', () => {
  it('adapts the grid to the Pathfinder signature', () => {
    const find = gridPathfinder(buildWalkGrid([], BOUNDS, 1, 0));
    const r = find({ x: 0.5, z: 0.5 }, { x: 4.5, z: 0.5 });
    expect(r).not.toBeNull();
    expect(r!.meters).toBeCloseTo(4, 5);
  });
});
