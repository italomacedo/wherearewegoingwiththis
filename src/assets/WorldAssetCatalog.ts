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

import type { Waypoint, WaypointGraph } from '@systems/Pathfinding';

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

// Road spans z ∈ [−4.5, 4.5] (9 wide). Sidewalks flank it out to the building front.
const SIDEWALK_Z = 7.25; // sidewalk centre — fills road-edge (4.5) → building front (~10)
const BUILDING_Z = 10;   // building facade line (front origin sits here)
const BACKDROP_Z = 20;   // textured-pack backdrops behind the facade

// --- Road: the zone's lit ground plane IS the asphalt (see MercadoSombrasZone.
//     buildGround). The MegaKit street tiles were dropped — that pack tile is
//     directional + flat-normalled and tiled with gaps/black under the glTF import
//     wrapper; a lit ground plane covers the street seamlessly and lights correctly.
//     (Lane/crosswalk decals can be laid on top later.) ---
const ROADS: readonly WorldProp[] = [];

// Buildings come from different kits with VERY different native sizes (measured below
// with scripts/measure_glb_bbox.mjs), so a single global scale is wrong — each MOLD gets
// its own multiplier. The scale is `targetWidth / nativeWidth`: choose a target world
// width per mold, divide by its measured native max-X/Z. Targeting ~13u keeps all three
// under the 14u slot spacing (no overlap) while staying far bigger than the ~1.7u avatar.
// NOTE: building origins are at the FRONT face, so scaling expands the body backward
// (away from the street) without shifting the facade. Tune in Electron; the doors derive
// automatically (they share the building's final scale via `doorPlacementForSlot`).
/** Measured native max(X,Z) extent per mold (metres). Update if the GLBs change. */
export const MOLD_NATIVE_WIDTH: Record<string, number> = {
  building_large_2: 20.64,
  building_medium_2_001: 15.06,
  building_small_1: 14.54,
};
// A mold scale may be uniform (number) OR per-axis [x,y,z] — used when a natively wide,
// short mold needs to be TALLER without growing wider (uniform would overlap neighbours at
// the 14u slot spacing). Per-axis [s, sy, s] keeps X==Z so the Y-rotation stays shear-free
// (normals intact). The door shares the scale, so it stretches to fill the taller opening.
export const MOLD_SCALE: Record<string, number | [number, number, number]> = {
  building_large_2: [0.67, 0.85, 0.67], // ~13.8u wide, ~23.8u tall, door ~1.9u (wide native → taller via Y)
  building_medium_2_001: 0.86,          // → ~13.0u wide, ~21.5u tall, door ~1.9u
  building_small_1: 0.89,               // → ~12.9u wide, ~15.1u tall, door ~2.0u
};

/** Basename of a GLB path (drops the directory + `.glb`). Pure. */
export function moldBasename(modelPath: string): string {
  return (modelPath.split('/').pop() ?? modelPath).replace(/\.glb$/i, '');
}

/** Per-mold scale (uniform or per-axis) for a building model path; 1 for unknown. Pure. */
export function moldScaleFor(modelPath: string): number | [number, number, number] {
  return MOLD_SCALE[moldBasename(modelPath)] ?? 1;
}

/** The X component of a (uniform or per-axis) scale — its world width multiplier. Pure. */
export function scaleWidth(s: number | [number, number, number]): number {
  return Array.isArray(s) ? s[0] : s;
}

// --- Buildings lining both sides of the street, facades toward the road. ---
const NORTH_BUILDINGS: ReadonlyArray<[number, string]> = [
  [-22, 'building_medium_2_001'], [-2, 'building_large_2'], [18, 'building_small_1'],
];
const SOUTH_BUILDINGS: ReadonlyArray<[number, string]> = [
  [-22, 'building_small_1'], [-2, 'building_medium_2_001'], [18, 'building_large_2'],
];
const LINING_BUILDINGS: readonly WorldProp[] = [
  ...NORTH_BUILDINGS.map(([x, m], i) => ({
    key: `bld-n-${i}`, model: `${DT}${m}.glb`, position: [x, 0, BUILDING_Z] as [number, number, number], rotationY: NORTH_ROT, scale: moldScaleFor(`${DT}${m}.glb`),
  })),
  ...SOUTH_BUILDINGS.map(([x, m], i) => ({
    key: `bld-s-${i}`, model: `${DT}${m}.glb`, position: [x, 0, -BUILDING_Z] as [number, number, number], rotationY: SOUTH_ROT, scale: moldScaleFor(`${DT}${m}.glb`),
  })),
];

// Dead end: a building walling off the far-left (−X) end of the street.
const DEAD_END: readonly WorldProp[] = [
  { key: 'bld-deadend', model: `${DT}building_large_2.glb`, position: [-29, 0, 0], rotationY: DEADEND_ROT, scale: moldScaleFor(`${DT}building_large_2.glb`) },
];

// Doors (MegaKit Door_1/2/3, 1×2.2). Separate GLB "molds" placed over each building's
// opening. Offsets are BASE (model authored at scale 1) and multiplied by the building's
// FINAL scale at placement, so the door always tracks the (per-mold-scaled) opening. The
// door GLB's leaf is hinged off-centre (pivot local x=0, leaf to x=−1 → centre −0.5), so a
// half-leaf pivot recentres it. openX = opening X offset from the building origin (measured
// from the interior-floor mesh); dy = raised-stoop height. Building rotation π (north) /
// 0 (south) flips local X, so the pivot sign mirrors.
export const DOOR_MODELS = ['door_1', 'door_2', 'door_3'] as const;
const DOOR_PIVOT_BASE = 0.5;   // half the door-leaf width (unscaled)
const DOOR_DEPTH = 0.05;       // hug the facade plane; world units, NOT scaled
const DOOR_FIT_BASE: Record<string, { openX: number; dy: number }> = {
  building_large_2: { openX: 0, dy: 0 }, // opening ~centred (tuned in Electron)
  building_medium_2_001: { openX: 0, dy: 0 },
  building_small_1: { openX: 0, dy: 1.0 }, // raised stoop entrance (base; ×finalScale at use)
};

/**
 * Door placement for a building sitting in a slot (or any front-face-origin building).
 * The door shares the building's `finalScale`; offsets are base × finalScale. North-side
 * buildings face −Z (rotated ~π → `cos(rotY) < 0`), which flips local X, so the pivot
 * sign mirrors. One pure place owns the sign-flip — works for the initial scene and any
 * procedural tile (all slot rows are π / 0). Pure.
 */
export function doorPlacementForSlot(args: {
  key: string; buildingModel: string; doorModel: string;
  slotPos: [number, number, number]; slotRotY: number;
  finalScale: number | [number, number, number];
}): WorldProp {
  const { key, buildingModel, doorModel, slotPos, slotRotY, finalScale } = args;
  const f = DOOR_FIT_BASE[moldBasename(buildingModel)] ?? { openX: 0, dy: 0 };
  const sx = Array.isArray(finalScale) ? finalScale[0] : finalScale; // horizontal opening
  const sy = Array.isArray(finalScale) ? finalScale[1] : finalScale; // stoop height
  const off = (f.openX + DOOR_PIVOT_BASE) * sx;
  const isNorth = Math.cos(slotRotY) < 0; // faces −Z
  return {
    key, model: `${DT}${doorModel}.glb`,
    position: [
      slotPos[0] + (isNorth ? off : -off),
      f.dy * sy,
      slotPos[2] + (isNorth ? DOOR_DEPTH : -DOOR_DEPTH),
    ],
    rotationY: slotRotY, scale: finalScale,
  };
}

// Standalone (closed-corridor) doors — 1:1 with the lining buildings by index, each at its
// building's per-mold scale. Mosaic mode skips these and emits slot-relative doors instead.
const DOORS: readonly WorldProp[] = [
  ...NORTH_BUILDINGS.map(([x, m], i) => doorPlacementForSlot({
    key: `door-n-${i}`, buildingModel: `${DT}${m}.glb`, doorModel: DOOR_MODELS[i % DOOR_MODELS.length],
    slotPos: [x, 0, BUILDING_Z], slotRotY: NORTH_ROT, finalScale: moldScaleFor(`${DT}${m}.glb`),
  })),
  ...SOUTH_BUILDINGS.map(([x, m], i) => doorPlacementForSlot({
    key: `door-s-${i}`, buildingModel: `${DT}${m}.glb`, doorModel: DOOR_MODELS[i % DOOR_MODELS.length],
    slotPos: [x, 0, -BUILDING_Z], slotRotY: SOUTH_ROT, finalScale: moldScaleFor(`${DT}${m}.glb`),
  })),
  { key: 'door-deadend', model: `${DT}door_1.glb`, position: [-(ZONE_HALF - 0.5), 0, 0.5], rotationY: DEADEND_ROT, scale: moldScaleFor(`${DT}building_large_2.glb`) },
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

/**
 * Obstacles + bounds for tactical combat movement (Fase 8): the routed move grid
 * (CombatMovement.buildWalkGrid) is rasterised from these so a fighter routes
 * around the closed perimeter + the exit wall rather than walking through them.
 * Pure data (the street interior is otherwise open). Building footprints can be
 * added here later for finer routing.
 */
export const COMBAT_OBSTACLES: readonly ColliderBox[] = [
  ...CORRIDOR_COLLIDERS,
  { key: EXIT_WALL.key, position: EXIT_WALL.position, size: EXIT_WALL.size },
];
export const COMBAT_BOUNDS = {
  minX: -ZONE_HALF,
  maxX: ZONE_HALF,
  minZ: -(BUILDING_Z + 2),
  maxZ: BUILDING_Z + 2,
} as const;

/** Everything the downtown street loads (road first, then structures/props/vendor). */
export const MERCADO_PROPS: readonly WorldProp[] = [
  ...ROADS,
  ...SIDEWALKS,
  ...LINING_BUILDINGS,
  ...DEAD_END,
  ...WALLS,
  ...DOORS,
  ...BACKDROP_BUILDINGS,
  ...PROPS,
  ...VENDOR,
];

// --- Waypoint graph (Fase 5 NPC navigation, pure A*). Three walkable lanes run
//     along the street in Z — north sidewalk (+7), road centre (0), south
//     sidewalk (−7) — sampled in X at the sidewalk-tile steps. Nodes link to the
//     next/prev node in their lane and across lanes at the same X (cross-street),
//     forming a small grid the NPC mover walks via computeRoute(). Pure data. ---
const WP_LANES: ReadonlyArray<{ tag: string; z: number }> = [
  { tag: 'n', z: 7 }, // north sidewalk
  { tag: 'c', z: 0 }, // road centre
  { tag: 's', z: -7 }, // south sidewalk
];
const WP_XS: readonly number[] = [-24, -18, -12, -6, 0, 6, 12, 18, 24];

function buildWaypointGraph(): WaypointGraph {
  const nodes: Waypoint[] = [];
  const edges: Record<string, string[]> = {};
  const id = (lane: number, i: number) => `wp-${WP_LANES[lane].tag}-${i}`;
  const link = (a: string, b: string) => {
    (edges[a] ??= []).push(b);
    (edges[b] ??= []).push(a);
  };
  WP_LANES.forEach((lane, li) => {
    WP_XS.forEach((x, i) => {
      nodes.push({ id: id(li, i), position: [x, 0, lane.z] });
      edges[id(li, i)] ??= [];
      if (i > 0) link(id(li, i - 1), id(li, i)); // along the lane
      if (li > 0) link(id(li - 1, i), id(li, i)); // across lanes (cross-street)
    });
  });
  return { nodes, edges };
}

/** The downtown street's navigation graph (Fase 5). */
export const WAYPOINT_GRAPH: WaypointGraph = buildWaypointGraph();

/** Stray-animal GLBs (Quaternius Ultimate Animated Animals, CC0) for the street
 *  atmosphere (Fase 6). Keyed by the model name used in AmbientLife.DOG_SPAWNS. */
export const ANIMAL_MODELS: Record<'shibainu' | 'husky', string> = {
  shibainu: 'world/animals/shibainu.glb',
  husky: 'world/animals/husky.glb',
};

/** Litter GLBs (CC0 Survival Pack cans + bottles) for street trash (Fase 6).
 *  Keyed by AmbientLife.TrashModel. */
export const TRASH_MODELS: Record<string, string> = {
  can_broken: 'world/trash/can_broken.glb',
  can_open: 'world/trash/can_open.glb',
  can_red: 'world/trash/can_red.glb',
  can_closed: 'world/trash/can_closed.glb',
  waterbottle_1: 'world/trash/waterbottle_1.glb',
  waterbottle_2: 'world/trash/waterbottle_2.glb',
};

/** Flying car model (flying_car_1_low-poly CC0) — replaces the nave. */
export const NAVE_MODEL = {
  path: 'vehicles/flying_car_1_low_poly.glb',
  scale: 0.012,
  yaw: 0,
} as const;
