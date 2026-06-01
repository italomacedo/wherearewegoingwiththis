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
  /** Uniform scale; default 1. */
  scale?: number;
}

/** Half-extent of the Mercado zone bounds (matches MercadoSombrasZone.getBounds). */
export const ZONE_HALF = 30;

/** Faces a prop at [x,z] toward the block centre (origin). Kept for reuse. */
export function facingCenter(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

const DT = 'world/downtown/';

// Orientation constants (tune in Electron — depend on each model's authored front).
const ROAD_ROT = Math.PI / 2; // 4-lane tile (6 wide × 18 long) → length along X
const NORTH_ROT = Math.PI;    // +Z-side buildings face −Z (toward the street)
const SOUTH_ROT = 0;          // −Z-side buildings face +Z
const DEADEND_ROT = Math.PI / 2; // far-left building faces +X, walling the street

const ROAD_Z = 0;       // street centre line
const SIDEWALK_Z = 5;   // sidewalk offset from centre (road is ±3 wide)
const BUILDING_Z = 14;  // building frontage line
const BACKDROP_Z = 24;  // textured-pack backdrops behind the frontage

// --- Road: 4-lane tiles laid end-to-end along X (each 18 long after rotation). ---
const ROADS: readonly WorldProp[] = [-27, -9, 9, 27].map((x, i) => ({
  key: `road-${i}`,
  model: `${DT}street_4lane.glb`,
  position: [x, 0, ROAD_Z],
  rotationY: ROAD_ROT,
}));

// --- Buildings lining both sides of the street, fronts toward the road. ---
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
  { key: 'bld-deadend', model: `${DT}building_large_2.glb`, position: [-30, 0, 0], rotationY: DEADEND_ROT },
];

// Textured-pack buildings (Phase B GLBs, ~2u → scale 4) as skyline depth behind the frontage.
const BACKDROP_BUILDINGS: readonly WorldProp[] = [
  { key: 'bld-back-n0', model: 'world/buildings/6story_stack_mat.glb', position: [-14, 0, BACKDROP_Z], rotationY: NORTH_ROT, scale: 4 },
  { key: 'bld-back-n1', model: 'world/buildings/4story_mat.glb', position: [10, 0, BACKDROP_Z], rotationY: NORTH_ROT, scale: 4 },
  { key: 'bld-back-s0', model: 'world/buildings/3story_small_mat.glb', position: [-14, 0, -BACKDROP_Z], rotationY: SOUTH_ROT, scale: 4 },
  { key: 'bld-back-s1', model: 'world/buildings/2story_balcony_mat.glb', position: [10, 0, -BACKDROP_Z], rotationY: SOUTH_ROT, scale: 4 },
];

// --- Sidewalks: a stretch on the north side (where the vendor stands) + south. ---
const SIDEWALKS: readonly WorldProp[] = [-9, -6, -3, 0, 3, 6, 9].flatMap((x, i) => [
  { key: `sidewalk-n-${i}`, model: `${DT}sidewalk_straight_3m.glb`, position: [x, 0, SIDEWALK_Z] as [number, number, number] },
  { key: `sidewalk-s-${i}`, model: `${DT}sidewalk_straight_3m.glb`, position: [x, 0, -SIDEWALK_Z] as [number, number, number] },
]);

// --- Street props (decorative). ---
const PROPS: readonly WorldProp[] = [
  { key: 'prop-manhole', model: `${DT}prop_manholecover.glb`, position: [-6, 0, 0] },
  { key: 'prop-drain', model: `${DT}prop_drain.glb`, position: [8, 0, 2.5] },
  { key: 'prop-bollard-0', model: `${DT}prop_bollard.glb`, position: [-12, 0, 4] },
  { key: 'prop-bollard-1', model: `${DT}prop_bollard.glb`, position: [12, 0, 4] },
  { key: 'prop-bollard-2', model: `${DT}prop_bollard.glb`, position: [-12, 0, -4] },
  { key: 'prop-bollard-3', model: `${DT}prop_bollard.glb`, position: [12, 0, -4] },
  { key: 'prop-planter', model: `${DT}prop_planter_single.glb`, position: [-3, 0, 6] },
  { key: 'prop-acunit', model: `${DT}prop_acunit.glb`, position: [0, 0, 12], rotationY: NORTH_ROT },
];

/** Where Zara (and her stall) stand — on the north sidewalk, near the spawn. */
export const VENDOR_SPOT: [number, number, number] = [3, 0, 6];

// --- Sidewalk vendor stall (Ultimate shelf + food) beside Zara. ---
const VENDOR: readonly WorldProp[] = [
  { key: 'vendor-shelf', model: 'world/props/props_shelf_tall.glb', position: [VENDOR_SPOT[0], 0, 7.5], rotationY: NORTH_ROT },
  { key: 'vendor-food-0', model: 'world/food/apple.glb', position: [VENDOR_SPOT[0] - 0.4, 1.35, 7.5], scale: 0.4 },
  { key: 'vendor-food-1', model: 'world/food/bread.glb', position: [VENDOR_SPOT[0] + 0.4, 1.35, 7.5], scale: 0.4 },
];

/** Everything the downtown street loads (road first, then structures/props/vendor). */
export const MERCADO_PROPS: readonly WorldProp[] = [
  ...ROADS,
  ...SIDEWALKS,
  ...LINING_BUILDINGS,
  ...DEAD_END,
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
