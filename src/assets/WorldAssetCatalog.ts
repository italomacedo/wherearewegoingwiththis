/**
 * World asset catalog — Mercado das Sombras as a **linear downtown street**
 * (Quaternius Downtown City MegaKit + Ultimate packs, all CC0).
 *
 * Pure data + pure helpers (no Babylon scene), fully unit-testable. The zone's
 * `loadRealAssets` (browser-only) iterates `MERCADO_PROPS`, loads each GLB, applies
 * the placement transform via a `TransformNode` holder, and hides the procedural
 * market placeholders wholesale. A missing/failed GLB leaves the procedural fallback.
 *
 * Layout (street runs along ±X): the road is flanked by buildings on both ±Z sides
 * with sidewalks between. The LEFT end (−X) is a dead end (a building walls it off);
 * the RIGHT end (+X) is the scene exit (a future zone transition). A sidewalk vendor
 * stall (shelf + food) stands beside Zara. See gap #4 (iter. 2).
 */

export interface WorldProp {
  /** Unique placement id (also the loaded holder's name). */
  key: string;
  /** GLB path relative to /assets/. */
  model: string;
  /** World position [x, y, z]. */
  position: [number, number, number];
  /** Y rotation (radians); default 0. */
  rotationY?: number;
  /** Uniform scale (number) or per-axis [x,y,z]; default 1. */
  scale?: number | [number, number, number];
}

/** Half-extent of the Mercado zone bounds (matches MercadoSombrasZone.getBounds). */
export const ZONE_HALF = 30;

/** Faces a prop at [x,z] toward the block centre (origin). Kept for reuse. */
export function facingCenter(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

const DT = 'world/downtown/';

// Orientation constants (tune in Electron — depend on each model's authored front).
// MegaKit buildings have their origin at the FRONT (local z≈0) with the body
// extending to −z, so placing a building at a Z line puts its facade on that line.
const NORTH_ROT = Math.PI;     // +Z-side buildings face −Z (toward the street)
const SOUTH_ROT = 0;           // −Z-side buildings face +Z
const DEADEND_ROT = -Math.PI / 2; // far-left building faces +X, walling the street

const ROAD_HALF = 4.5;  // road spans z ∈ [−4.5, 4.5] (9 wide, matches asphalt tile)
const SIDEWALK_Z = 7.25; // sidewalk centre — fills road-edge (4.5) → building front (~10)
const BUILDING_Z = 10;   // building facade line (front origin sits here)
const BACKDROP_Z = 20;   // textured-pack backdrops behind the facade

// --- Road: continuous asphalt. Tile origin is a corner ([-9,0]×[-9,0]); place at
//     z = +ROAD_HALF so it spans [−4.5, 4.5], stepping 9 along X for a seamless strip. ---
const ROADS: readonly WorldProp[] = [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5].map((x, i) => ({
  key: `road-${i}`,
  model: `${DT}street_asphalt_9x9.glb`,
  position: [x, 0.02, ROAD_HALF] as [number, number, number],
}));

// --- Buildings lining both sides of the street, facades toward the road. ---
const NORTH_BUILDINGS: ReadonlyArray<[number, string]> = [
  [-22, 'building_medium_2_001'], [-2, 'building_large_2'], [18, 'building_small_1'],
];
const SOUTH_BUILDINGS: ReadonlyArray<[number, string]> = [
  [-22, 'building_small_1'], [-2, 'building_medium_2_001'], [18, 'building_large_2'],
];
const LINING_BUILDINGS: readonly WorldProp[] = [
  ...NORTH_BUILDINGS.map(([x, m], i) => ({
    key: `bld-n-${i}`, model: `${DT}${m}.glb`, position: [x, 0, BUILDING_Z] as [number, number, number], rotationY: NORTH_ROT,
  })),
  ...SOUTH_BUILDINGS.map(([x, m], i) => ({
    key: `bld-s-${i}`, model: `${DT}${m}.glb`, position: [x, 0, -BUILDING_Z] as [number, number, number], rotationY: SOUTH_ROT,
  })),
];

// Dead end: a building walling off the far-left (−X) end of the street.
const DEAD_END: readonly WorldProp[] = [
  { key: 'bld-deadend', model: `${DT}building_large_2.glb`, position: [-29, 0, 0], rotationY: DEADEND_ROT },
];

// Textured-pack buildings (Phase B GLBs, ~2u → scale 4) as skyline depth behind the facade.
const BACKDROP_BUILDINGS: readonly WorldProp[] = [
  { key: 'bld-back-n0', model: 'world/buildings/6story_stack_mat.glb', position: [-14, 0, BACKDROP_Z], rotationY: NORTH_ROT, scale: 4 },
  { key: 'bld-back-n1', model: 'world/buildings/4story_mat.glb', position: [10, 0, BACKDROP_Z], rotationY: NORTH_ROT, scale: 4 },
  { key: 'bld-back-s0', model: 'world/buildings/3story_small_mat.glb', position: [-14, 0, -BACKDROP_Z], rotationY: SOUTH_ROT, scale: 4 },
  { key: 'bld-back-s1', model: 'world/buildings/2story_balcony_mat.glb', position: [10, 0, -BACKDROP_Z], rotationY: SOUTH_ROT, scale: 4 },
];

// --- Sidewalks: continuous strips against the buildings on both sides. The 3×3
//     tile is centred; scale it [2,1,~1.8] (6 long × ~5.4 wide) and step 6 in X. ---
const SIDEWALK_SCALE: [number, number, number] = [2, 1, 1.8];
const SIDEWALKS: readonly WorldProp[] = [-24, -18, -12, -6, 0, 6, 12, 18, 24].flatMap((x, i) => [
  { key: `sidewalk-n-${i}`, model: `${DT}sidewalk_straight_3m.glb`, position: [x, 0.03, SIDEWALK_Z] as [number, number, number], scale: SIDEWALK_SCALE },
  { key: `sidewalk-s-${i}`, model: `${DT}sidewalk_straight_3m.glb`, position: [x, 0.03, -SIDEWALK_Z] as [number, number, number], scale: SIDEWALK_SCALE },
]);

// --- Street props (decorative). ---
const PROPS: readonly WorldProp[] = [
  { key: 'prop-manhole', model: `${DT}prop_manholecover.glb`, position: [-6, 0.03, 0] },
  { key: 'prop-drain', model: `${DT}prop_drain.glb`, position: [8, 0.03, 3] },
  { key: 'prop-bollard-0', model: `${DT}prop_bollard.glb`, position: [-12, 0, 5.5] },
  { key: 'prop-bollard-1', model: `${DT}prop_bollard.glb`, position: [12, 0, 5.5] },
  { key: 'prop-bollard-2', model: `${DT}prop_bollard.glb`, position: [-12, 0, -5.5] },
  { key: 'prop-bollard-3', model: `${DT}prop_bollard.glb`, position: [12, 0, -5.5] },
  { key: 'prop-planter', model: `${DT}prop_planter_single.glb`, position: [-6, 0, 7.5] },
  { key: 'prop-acunit', model: `${DT}prop_acunit.glb`, position: [9, 0, 9.5], rotationY: NORTH_ROT },
];

/** Where Zara (and her stall) stand — on the north sidewalk, near the spawn. */
export const VENDOR_SPOT: [number, number, number] = [3, 0, 6];

// --- Sidewalk vendor stall (Ultimate shelf + food) on the calçada beside Zara. ---
const SHELF_Z = 8.6; // on the sidewalk, just in front of the building facade
const VENDOR: readonly WorldProp[] = [
  { key: 'vendor-shelf', model: 'world/props/props_shelf_tall.glb', position: [VENDOR_SPOT[0], 0, SHELF_Z], rotationY: NORTH_ROT },
  { key: 'vendor-food-0', model: 'world/food/apple.glb', position: [VENDOR_SPOT[0] - 0.4, 1.35, SHELF_Z], scale: 0.4 },
  { key: 'vendor-food-1', model: 'world/food/bread.glb', position: [VENDOR_SPOT[0] + 0.4, 1.35, SHELF_Z], scale: 0.4 },
];

// --- Perimeter walls: continuous brick backing wall per side, just behind the
//     building line, so the gaps (becos) between buildings show wall, not void.
//     Mostly occluded by the buildings → the X/Y stretch isn't noticeable. The
//     −X end is a brick dead-end wall; the +X end is the black exit (procedural). ---
const WALL_HALF_LEN = ZONE_HALF;       // backing walls span the full street length
const WALL_TALL: [number, number, number] = [WALL_HALF_LEN, 6.5, 1]; // panel is 2×3 → ~60×19.5
const WALLS: readonly WorldProp[] = [
  { key: 'wall-n', model: `${DT}brick_plain_3.glb`, position: [0, 0, BUILDING_Z + 1], rotationY: NORTH_ROT, scale: WALL_TALL },
  { key: 'wall-s', model: `${DT}brick_plain_3.glb`, position: [0, 0, -(BUILDING_Z + 1)], rotationY: SOUTH_ROT, scale: WALL_TALL },
  { key: 'wall-deadend', model: `${DT}brick_plain_3.glb`, position: [-ZONE_HALF, 0, 0], rotationY: Math.PI / 2, scale: [BUILDING_Z + 1, 6.5, 1] },
];

/** The black wall closing the +X end — built procedurally (no MegaKit black piece).
 *  Touching it will trigger the next-street transition (future). */
export const EXIT_WALL = {
  key: 'exit-wall',
  position: [ZONE_HALF, 7.5, 0] as [number, number, number],
  size: [1, 15, (BUILDING_Z + 1) * 2] as [number, number, number],
};

/** Box collider (AABB) data — the closed corridor perimeter. Phase G builds a
 *  static PhysicsAggregate box per entry; pure data so it's unit-testable. */
export interface ColliderBox {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
}
const WALL_H = 14;
export const CORRIDOR_COLLIDERS: readonly ColliderBox[] = [
  { key: 'col-n', position: [0, WALL_H / 2, BUILDING_Z], size: [ZONE_HALF * 2 + 2, WALL_H, 2] },
  { key: 'col-s', position: [0, WALL_H / 2, -BUILDING_Z], size: [ZONE_HALF * 2 + 2, WALL_H, 2] },
  { key: 'col-w', position: [-ZONE_HALF, WALL_H / 2, 0], size: [2, WALL_H, BUILDING_Z * 2 + 2] },
  { key: 'col-e', position: [ZONE_HALF, WALL_H / 2, 0], size: [2, WALL_H, BUILDING_Z * 2 + 2] },
];

/** Everything the downtown street loads (road first, then structures/props/vendor). */
export const MERCADO_PROPS: readonly WorldProp[] = [
  ...ROADS,
  ...SIDEWALKS,
  ...LINING_BUILDINGS,
  ...DEAD_END,
  ...WALLS,
  ...BACKDROP_BUILDINGS,
  ...PROPS,
  ...VENDOR,
];

/** Atmospheric nave (small Spaceships model) — replaces the flying bike. */
export const NAVE_MODEL = {
  path: 'vehicles/nave.glb',
  scale: 0.6,
  yaw: Math.PI,
} as const;
