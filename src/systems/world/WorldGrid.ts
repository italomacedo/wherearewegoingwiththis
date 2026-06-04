/**
 * WorldGrid — pure tile math for the 24×24 procedural mosaic (Fase 17).
 *
 * The world is one continuous coordinate space; tile (tx,tz) ∈ [0,23]² has its
 * CENTRE at world (tx*TILE_SIZE, 0, tz*TILE_SIZE) and spans ±ZONE_HALF around it.
 * So tile (0,0)'s centre is the world origin (0,0,0) — exactly where the static
 * downtown street (`MercadoSombrasZone`) is already authored, so it loads as-is
 * with a zero offset.
 *
 * No Babylon, no DOM — 100% unit-testable. Tuples are [x,y,z] to match the rest
 * of the data layer (`WorldProp`/`ColliderBox`).
 *
 * Edge naming: −X = west, +X = east, −Z = south, +Z = north.
 */

import { ZONE_HALF, type ColliderBox } from '@assets/WorldAssetCatalog';

/** Each tile is the same size as the current zone (ZONE_HALF*2 = 60). */
export const TILE_SIZE = ZONE_HALF * 2;
/** Inclusive grid bounds. */
export const GRID_MIN = 0;
export const GRID_MAX = 23;
export const GRID_SIZE = GRID_MAX - GRID_MIN + 1;

export interface TileCoord {
  tx: number;
  tz: number;
}

export interface BorderEdges {
  west: boolean;
  east: boolean;
  south: boolean;
  north: boolean;
}

export interface RingDiff {
  toLoad: TileCoord[];
  toUnload: TileCoord[];
}

/** Stable string key for a tile (for Maps / the save delta store). */
export function tileKey(tx: number, tz: number): string {
  return `${tx},${tz}`;
}

/** Is (tx,tz) inside the 24×24 grid? */
export function inBounds(tx: number, tz: number): boolean {
  return tx >= GRID_MIN && tx <= GRID_MAX && tz >= GRID_MIN && tz <= GRID_MAX;
}

/** Clamp a raw index into [GRID_MIN, GRID_MAX]. */
function clampIndex(i: number): number {
  return Math.max(GRID_MIN, Math.min(GRID_MAX, i));
}

/** Tile index for one world axis (centres at multiples of TILE_SIZE). */
function indexOf(coord: number): number {
  return clampIndex(Math.floor((coord + ZONE_HALF) / TILE_SIZE));
}

/** Which tile a continuous world (x,z) falls in (clamped to the grid). */
export function tileOf(worldX: number, worldZ: number): TileCoord {
  return { tx: indexOf(worldX), tz: indexOf(worldZ) };
}

/** World-space centre of tile (tx,tz). */
export function tileCenter(tx: number, tz: number): [number, number, number] {
  return [tx * TILE_SIZE, 0, tz * TILE_SIZE];
}

/** Convert a tile-local [x,y,z] (authored around origin) to world space. */
export function tileLocalToWorld(
  tx: number,
  tz: number,
  local: [number, number, number],
): [number, number, number] {
  return [local[0] + tx * TILE_SIZE, local[1], local[2] + tz * TILE_SIZE];
}

/** The ≤9 in-grid tiles of the 3×3 ring centred on (tx,tz). */
export function neighbors3x3(tx: number, tz: number): TileCoord[] {
  const out: TileCoord[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (inBounds(nx, nz)) out.push({ tx: nx, tz: nz });
    }
  }
  return out;
}

/**
 * Set difference of two tile lists: which tiles to LOAD (in next, not in prev)
 * and to UNLOAD (in prev, not in next). The streaming core.
 */
export function ringDiff(prev: readonly TileCoord[], next: readonly TileCoord[]): RingDiff {
  const prevKeys = new Set(prev.map((c) => tileKey(c.tx, c.tz)));
  const nextKeys = new Set(next.map((c) => tileKey(c.tx, c.tz)));
  const toLoad = next.filter((c) => !prevKeys.has(tileKey(c.tx, c.tz)));
  const toUnload = prev.filter((c) => !nextKeys.has(tileKey(c.tx, c.tz)));
  return { toLoad, toUnload };
}

/**
 * Which OUTER edges of this tile are world borders (need an invisible wall).
 * Interior tile edges are open (all false there).
 */
export function isBorderEdge(tx: number, tz: number): BorderEdges {
  return {
    west: tx === GRID_MIN,
    east: tx === GRID_MAX,
    south: tz === GRID_MIN,
    north: tz === GRID_MAX,
  };
}

/** Invisible-wall geometry for world borders. */
export const WALL_HEIGHT = 14;
export const WALL_THICKNESS = 2;

/**
 * Static box colliders for the world-border edges of tile (tx,tz) — only the
 * OUTER edges of border tiles get a wall; interior tiles return []. World-positioned.
 */
export function borderWallColliders(tx: number, tz: number): ColliderBox[] {
  const [cx, , cz] = tileCenter(tx, tz);
  const edges = isBorderEdge(tx, tz);
  const h = WALL_HEIGHT;
  const t = WALL_THICKNESS;
  const out: ColliderBox[] = [];
  if (edges.west) {
    out.push({ key: `wall-${tx}-${tz}-w`, position: [cx - ZONE_HALF, h / 2, cz], size: [t, h, TILE_SIZE] });
  }
  if (edges.east) {
    out.push({ key: `wall-${tx}-${tz}-e`, position: [cx + ZONE_HALF, h / 2, cz], size: [t, h, TILE_SIZE] });
  }
  if (edges.south) {
    out.push({ key: `wall-${tx}-${tz}-s`, position: [cx, h / 2, cz - ZONE_HALF], size: [TILE_SIZE, h, t] });
  }
  if (edges.north) {
    out.push({ key: `wall-${tx}-${tz}-n`, position: [cx, h / 2, cz + ZONE_HALF], size: [TILE_SIZE, h, t] });
  }
  return out;
}

/** Half-extent (X/Z) of the whole 24×24 world from its centre — for vehicle confinement. */
export const WORLD_HALF_EXTENT = (GRID_SIZE * TILE_SIZE) / 2;

/** Centre of the whole world (midpoint of tiles 0..23). */
export function worldCenter(): [number, number, number] {
  const c = (GRID_MAX * TILE_SIZE) / 2;
  return [c, 0, c];
}

/** One big static floor box covering the whole world (no per-tile floor seams). */
export function worldFloorBox(): ColliderBox {
  const [cx, , cz] = worldCenter();
  const span = GRID_SIZE * TILE_SIZE;
  return { key: 'col-world-floor', position: [cx, -0.5, cz], size: [span, 1, span] };
}
