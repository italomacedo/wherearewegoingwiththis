/**
 * CityFrame — pure geometry for the "city-grid" urban tile layout (Fase 17G).
 *
 * The mosaic's ROADS are the grid (the tile edges): each URBAN tile (downtown/
 * market) is a block — a themed interior ringed by sidewalk, with asphalt on the
 * outer frame that, joined with neighbours, forms the street grid. Crosswalks
 * cross the road at each edge centre; manholes dot the asphalt. Nature tiles
 * (park/forest/desert) are OFF the grid (full-tile themed ground, no frame).
 *
 * All output is WORLD-positioned via tileLocalToWorld. No Babylon/DOM — 100%
 * unit-testable; TileScenery/MercadoSombrasZone draw the returned primitives.
 *
 * Layout (local |coord| ≤ 30): asphalt 60 (full) ▸ sidewalk ring 22..26 ▸ road
 * ring 26..30 (seam with a neighbour ⇒ ~8 u, 2 lanes) ▸ interior 44 (content).
 */

import { TILE_SIZE, tileLocalToWorld } from '@systems/world/WorldGrid';
import { type RollFn } from '@systems/SkillCheck';

export const URBAN_FRAME = {
  asphalt: TILE_SIZE, // 60 — full tile (the road shows on the outer ring)
  sidewalk: 52,       // sidewalk plane edge → ring 26..30 stays asphalt (road)
  interior: 44,       // content plane edge → ring 22..26 stays sidewalk
  asphaltY: 0.0,
  sidewalkY: 0.02,
  interiorY: 0.04,
  roadInner: 26,      // asphalt visible from |coord| 26..30
  sidewalkInner: 22,  // content kept inside |coord| ≤ 22
} as const;

export type FramePlaneKind = 'asphalt' | 'sidewalk' | 'interior';
export interface FramePlane {
  key: string;
  kind: FramePlaneKind;
  /** World centre [x,y,z]. */
  center: [number, number, number];
  /** Ground size [width(x), depth(z)]. */
  size: [number, number];
}

/** The 3 stacked ground planes of an urban tile (asphalt ▸ sidewalk ▸ interior). */
export function framePlanes(tx: number, tz: number): FramePlane[] {
  const f = URBAN_FRAME;
  const mk = (kind: FramePlaneKind, edge: number, y: number): FramePlane => ({
    key: `tile-${kind}-${tx}-${tz}`,
    kind,
    center: tileLocalToWorld(tx, tz, [0, y, 0]),
    size: [edge, edge],
  });
  return [
    mk('asphalt', f.asphalt, f.asphaltY),
    mk('sidewalk', f.sidewalk, f.sidewalkY),
    mk('interior', f.interior, f.interiorY),
  ];
}

export interface Stripe {
  key: string;
  center: [number, number, number];
  size: [number, number]; // [width(x), depth(z)]
}

const STRIPE_Y = 0.05; // just above the asphalt/sidewalk planes
const ROAD_MID = (URBAN_FRAME.roadInner + URBAN_FRAME.asphalt / 2) / 2; // centre of the 26..30 road band = 28
const CROSSWALK_BARS = 5;

/** Emissive zebra crosswalk bars crossing the road at the centre of each of the 4 edges. */
export function crosswalkStripes(tx: number, tz: number): Stripe[] {
  const out: Stripe[] = [];
  const span = 4;     // bar length across the road band (26..30)
  const barThin = 0.4;
  const gap = 0.9;
  const half = ((CROSSWALK_BARS - 1) * gap) / 2;
  // North (+z) and south (-z): road runs along X → bars thin in x, long in z.
  for (const [tag, zc] of [['n', ROAD_MID], ['s', -ROAD_MID]] as const) {
    for (let i = 0; i < CROSSWALK_BARS; i++) {
      const lx = -half + i * gap;
      out.push({ key: `tile-xw-${tx}-${tz}-${tag}-${i}`, center: tileLocalToWorld(tx, tz, [lx, STRIPE_Y, zc]), size: [barThin, span] });
    }
  }
  // East (+x) and west (-x): road runs along Z → bars thin in z, long in x.
  for (const [tag, xc] of [['e', ROAD_MID], ['w', -ROAD_MID]] as const) {
    for (let i = 0; i < CROSSWALK_BARS; i++) {
      const lz = -half + i * gap;
      out.push({ key: `tile-xw-${tx}-${tz}-${tag}-${i}`, center: tileLocalToWorld(tx, tz, [xc, STRIPE_Y, lz]), size: [span, barThin] });
    }
  }
  return out;
}

/** A few manhole-cover spots on the asphalt road ring (deterministic via rng). */
export function manholeSpots(tx: number, tz: number, rng: RollFn): Array<[number, number, number]> {
  const n = 2 + Math.floor(rng() * 3); // 2..4
  const out: Array<[number, number, number]> = [];
  // Place along the four road-band centrelines at a seeded offset.
  const edges: Array<[number, number]> = [[0, ROAD_MID], [0, -ROAD_MID], [ROAD_MID, 0], [-ROAD_MID, 0]];
  for (let i = 0; i < n; i++) {
    const [ex, ez] = edges[i % edges.length];
    const along = (rng() - 0.5) * 36; // slide along the road band
    const lx = ex === 0 ? along : ex;
    const lz = ez === 0 ? along : ez;
    out.push(tileLocalToWorld(tx, tz, [lx, 0.05, lz]));
  }
  return out;
}

export interface BuildingSlot {
  key: string;
  /** World position (feet at y=0). */
  position: [number, number, number];
  /** Y rotation (faces the central plaza). */
  rotationY: number;
  /** Max footprint (x/z) that fits the slot without overlapping neighbours. */
  footprint: number;
}

const SLOT_FOOTPRINT = 11; // ≤ the 14-spacing below ⇒ no overlap
const SLOT_XS = [-14, 0, 14];
const SLOT_ROWS: Array<['n' | 's', number, number]> = [
  ['n', 14, Math.PI], // north row faces -z (toward centre)
  ['s', -14, 0],      // south row faces +z
];

/**
 * Non-overlapping building slots inside the interior (|local| ≤ 22): two rows
 * (north/south) of three, leaving a central plaza corridor. Fixes the old
 * overlapping ring placement. World-positioned.
 */
export function interiorBuildingSlots(tx: number, tz: number): BuildingSlot[] {
  const out: BuildingSlot[] = [];
  for (const [tag, lz, rot] of SLOT_ROWS) {
    for (let i = 0; i < SLOT_XS.length; i++) {
      out.push({
        key: `slot-${tx}-${tz}-${tag}-${i}`,
        position: tileLocalToWorld(tx, tz, [SLOT_XS[i], 0, lz]),
        rotationY: rot,
        footprint: SLOT_FOOTPRINT,
      });
    }
  }
  return out;
}
