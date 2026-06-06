/**
 * Tactical combat movement — a pure, dependency-free A* over a uniform walkability
 * grid rasterised from the world's box colliders. Combat movement must route AROUND
 * obstacles (buildings, walls, props), so the per-metre AP cost reflects the real
 * routed path, not a straight line.
 *
 * The grid is built once per encounter from the same collider boxes the zone uses
 * for Havok (pure data in WorldAssetCatalog). `gridPath` finds the shortest routed
 * polyline between two ground points; `gridPathfinder` adapts it to the
 * `Pathfinder` shape the CombatEncounter injects. Everything is pure (same inputs →
 * same path), so it is fully unit-tested with no Babylon/Havok dependency. The
 * browser overlay renders the returned polyline as the on-ground move trail.
 */

import { Point2, PathResult, Pathfinder, distance2 } from './CombatMath';

/** An axis-aligned box obstacle (only its X/Z footprint matters for walkability). */
export interface Obstacle {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
}

/** A rectangular area of the ground plane (metres). */
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A rasterised walkability grid: row-major `blocked` flags over `cols × rows` cells. */
export interface WalkGrid {
  cols: number;
  rows: number;
  cell: number;
  minX: number;
  minZ: number;
  blocked: boolean[];
}

const SQRT2 = Math.SQRT2;

/**
 * Rasterise box obstacles into a walkability grid. A cell is blocked when its
 * centre falls inside any obstacle footprint inflated by `inflate` metres (the
 * agent's half-width, so paths keep clear of walls). `cell` is the cell size in
 * metres (smaller = finer routing, more cells).
 */
export function buildWalkGrid(
  obstacles: readonly Obstacle[],
  bounds: Bounds,
  cell = 1,
  inflate = 0.5,
): WalkGrid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const boxes = obstacles.map((o) => ({
    minX: o.position[0] - o.size[0] / 2 - inflate,
    maxX: o.position[0] + o.size[0] / 2 + inflate,
    minZ: o.position[2] - o.size[2] / 2 - inflate,
    maxZ: o.position[2] + o.size[2] / 2 + inflate,
  }));
  const blocked: boolean[] = new Array(cols * rows).fill(false);
  for (let r = 0; r < rows; r++) {
    const cz = bounds.minZ + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const cx = bounds.minX + (c + 0.5) * cell;
      blocked[r * cols + c] = boxes.some((b) => cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ);
    }
  }
  return { cols, rows, cell, minX: bounds.minX, minZ: bounds.minZ, blocked };
}

/** World centre of cell (c, r). */
function cellCentre(grid: WalkGrid, c: number, r: number): Point2 {
  return { x: grid.minX + (c + 0.5) * grid.cell, z: grid.minZ + (r + 0.5) * grid.cell };
}

/** Cell column/row containing a world point (clamped to the grid). */
function cellOf(grid: WalkGrid, p: Point2): { c: number; r: number } {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((p.x - grid.minX) / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((p.z - grid.minZ) / grid.cell)));
  return { c, r };
}

function isBlocked(grid: WalkGrid, c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return true;
  return grid.blocked[r * grid.cols + c]!;
}

/**
 * Shortest routed path between two ground points over the grid (8-connected,
 * no diagonal corner-cutting). Returns the polyline (exact `from`, cell centres,
 * exact `to`) plus its total length in metres, or null if the goal cell is
 * blocked or unreachable. The straight start/goal hops onto the grid are included
 * so the cost reflects the whole walk.
 */
export function gridPath(grid: WalkGrid, from: Point2, to: Point2): PathResult | null {
  const start = cellOf(grid, from);
  const goal = cellOf(grid, to);
  if (isBlocked(grid, goal.c, goal.r) || isBlocked(grid, start.c, start.r)) return null;

  const cols = grid.cols;
  const idx = (c: number, r: number) => r * cols + c;
  const goalCentre = cellCentre(grid, goal.c, goal.r);

  const g = new Map<number, number>([[idx(start.c, start.r), 0]]);
  const f = new Map<number, number>([[idx(start.c, start.r), distance2(cellCentre(grid, start.c, start.r), goalCentre)]]);
  const cameFrom = new Map<number, number>();
  const open = new Set<number>([idx(start.c, start.r)]);

  while (open.size > 0) {
    let current = -1;
    let bestF = Infinity;
    for (const id of open) {
      const fv = f.get(id) ?? Infinity;
      if (fv < bestF || (fv === bestF && current !== -1 && id < current)) { bestF = fv; current = id; }
    }
    if (current === -1) break;
    const cc = current % cols;
    const cr = Math.floor(current / cols);
    if (cc === goal.c && cr === goal.r) {
      return assemblePath(grid, reconstructCells(cameFrom, current, cols), from, to);
    }
    open.delete(current);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (isBlocked(grid, nc, nr)) continue;
        // No diagonal corner-cutting: both orthogonal neighbours must be open.
        if (dc !== 0 && dr !== 0 && (isBlocked(grid, cc + dc, cr) || isBlocked(grid, cc, cr + dr))) continue;
        const step = (dc !== 0 && dr !== 0 ? SQRT2 : 1) * grid.cell;
        const nid = idx(nc, nr);
        const tentative = (g.get(current) ?? Infinity) + step;
        if (tentative < (g.get(nid) ?? Infinity)) {
          cameFrom.set(nid, current);
          g.set(nid, tentative);
          f.set(nid, tentative + distance2(cellCentre(grid, nc, nr), goalCentre));
          open.add(nid);
        }
      }
    }
  }
  return null;
}

function reconstructCells(cameFrom: Map<number, number>, current: number, cols: number): Point2[] {
  const cells: number[] = [current];
  let cur = current;
  while (cameFrom.has(cur)) { cur = cameFrom.get(cur)!; cells.unshift(cur); }
  return cells.map((id) => ({ x: id % cols, z: Math.floor(id / cols) }));
}

/** Turn the cell sequence into a world polyline with exact endpoints, and total length.
 *
 * `cells` is the full A* reconstruction including BOTH the start and goal cells. We
 * skip those endpoint cells' centres — `from` and `to` already cover those positions,
 * and inserting the cell-centre would add a visible "snap" segment that pulls the
 * trail back towards the cell centre of the cell the combatant is already STANDING
 * IN (showing up as a trail leg behind the avatar when its world position is off the
 * cell centre). Only the *intermediate* cell centres carry the routing detour.
 */
function assemblePath(grid: WalkGrid, cells: Point2[], from: Point2, to: Point2): PathResult {
  const mid = cells.slice(1, -1).map((cell) => cellCentre(grid, cell.x, cell.z));
  const pts: Point2[] = [{ ...from }, ...mid, { ...to }];
  // Drop consecutive duplicates so zero-length segments don't accumulate.
  const points: Point2[] = [];
  for (const p of pts) {
    const last = points[points.length - 1];
    if (!last || distance2(last, p) > 1e-9) points.push(p);
  }
  let meters = 0;
  for (let i = 1; i < points.length; i++) meters += distance2(points[i - 1]!, points[i]!);
  return { points, meters };
}

/** Adapt a grid to the `Pathfinder` shape the CombatEncounter injects. */
export function gridPathfinder(grid: WalkGrid): Pathfinder {
  return (from, to) => gridPath(grid, from, to);
}
