/**
 * MinimapModel — pure heading-up minimap math for Roxane's dashboard LCD (the car).
 *
 * The world is the 24×24 procedural mosaic (TILE_SIZE = 60). The minimap is
 * **heading-up**: the car's forward always points to the top of the screen, the
 * surrounding tiles + NPC dots rotate around the centred car, and a North marker
 * rides the ring so the player can still read world orientation.
 *
 * Heading convention (from VehicleController.computeFlightStep): the car's world
 * forward at `heading` is `(sin h, cos h)` on (x,z) — so heading 0 faces +Z (north).
 * We rotate every world-relative offset into a screen frame where:
 *   • forward (ahead of the car) → screen UP  (negative `dy`)
 *   • the car's right            → screen RIGHT (positive `dx`)
 * with right = forward rotated −90° = `(cos h, −sin h)`.
 *
 * Screen offsets are pixels relative to the minimap centre, matching Babylon GUI's
 * `left`/`top` (positive `dx` = right, positive `dy` = down). No Babylon, no DOM —
 * 100% unit-testable; the GUI render lives in VehicleCockpit (browser-only).
 */

import { TILE_SIZE, tileOf, tileCenter, inBounds } from '@systems/world/WorldGrid';

/** Square side of the minimap on the LCD (px). */
export const MINIMAP_SIZE_PX = 210;
/** World radius (metres) shown from the centre to the minimap edge. */
export const MINIMAP_RANGE_M = 120;

export interface MinimapEntity {
  x: number;
  z: number;
  /** Defeated NPC (corpse) — drawn dimmer. */
  dead?: boolean;
}

export interface MinimapCell {
  /** Screen offset (px) of the tile CENTRE from the minimap centre. */
  dx: number;
  dy: number;
  /** Tile side in px (TILE_SIZE × scale). */
  sizePx: number;
  /** Themed ground tint [r,g,b] in 0..1. */
  color: [number, number, number];
}

export interface MinimapDot {
  dx: number;
  dy: number;
  dead: boolean;
}

export interface MinimapView {
  cells: MinimapCell[];
  dots: MinimapDot[];
  /** Screen offset (px) of the North ("N") marker, on the minimap ring. */
  north: { dx: number; dy: number };
  /** Rotation (radians) to apply to each tile cell so its world-axis edges align. */
  rotation: number;
  /** Half-side of the minimap in px (centre → edge). */
  radiusPx: number;
}

export interface MinimapParams {
  /** Player/car world position (x,z). */
  px: number;
  pz: number;
  /** Car heading (radians); forward = (sin h, cos h). */
  heading: number;
  entities: MinimapEntity[];
  themeColorAt: (tx: number, tz: number) => [number, number, number];
  rangeM?: number;
  sizePx?: number;
}

/** Rotate a world-relative offset (rx,rz) into screen px (dx right, dy down). */
function project(rx: number, rz: number, sin: number, cos: number, scale: number): { dx: number; dy: number } {
  // right = (cos, -sin), forward = (sin, cos)
  const alongRight = rx * cos - rz * sin;
  const alongFwd = rx * sin + rz * cos;
  return { dx: alongRight * scale, dy: -alongFwd * scale };
}

/**
 * Build the heading-up minimap view: visible themed tile cells, NPC dots (clamped to
 * the ring when out of range), and the rotating North marker.
 */
export function buildMinimapView(params: MinimapParams): MinimapView {
  const rangeM = params.rangeM ?? MINIMAP_RANGE_M;
  const sizePx = params.sizePx ?? MINIMAP_SIZE_PX;
  const radiusPx = sizePx / 2;
  const scale = radiusPx / rangeM; // px per metre
  const sin = Math.sin(params.heading);
  const cos = Math.cos(params.heading);
  const cellSizePx = TILE_SIZE * scale;

  // Tile cells around the player's tile. A rotated square reaches ~half-diagonal
  // beyond its centre, so keep any tile whose centre is within the ring + that reach.
  const cells: MinimapCell[] = [];
  const center = tileOf(params.px, params.pz);
  const span = Math.ceil(rangeM / TILE_SIZE) + 1;
  const keepDist = radiusPx + cellSizePx; // generous; the GUI clips to the square
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const tx = center.tx + dx;
      const tz = center.tz + dz;
      if (!inBounds(tx, tz)) continue;
      const [cx, , cz] = tileCenter(tx, tz);
      const p = project(cx - params.px, cz - params.pz, sin, cos, scale);
      if (Math.hypot(p.dx, p.dy) > keepDist) continue;
      cells.push({ dx: p.dx, dy: p.dy, sizePx: cellSizePx, color: params.themeColorAt(tx, tz) });
    }
  }

  // NPC dots — clamp out-of-range ones onto the ring so they show as a bearing.
  const dots: MinimapDot[] = params.entities.map((e) => {
    const p = project(e.x - params.px, e.z - params.pz, sin, cos, scale);
    const dist = Math.hypot(p.dx, p.dy);
    if (dist > radiusPx && dist > 0) {
      const k = radiusPx / dist;
      return { dx: p.dx * k, dy: p.dy * k, dead: e.dead ?? false };
    }
    return { dx: p.dx, dy: p.dy, dead: e.dead ?? false };
  });

  // North marker: world +Z direction projected to the ring.
  const nd = project(0, 1, sin, cos, scale);
  const nlen = Math.hypot(nd.dx, nd.dy) || 1;
  const north = { dx: (nd.dx / nlen) * radiusPx, dy: (nd.dy / nlen) * radiusPx };

  return { cells, dots, north, rotation: -params.heading, radiusPx };
}
