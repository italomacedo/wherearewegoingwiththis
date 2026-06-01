/**
 * World asset catalog — Mercado das Sombras as a small **downtown city block**
 * (Quaternius Downtown City MegaKit + Ultimate packs, all CC0).
 *
 * Pure data + pure helpers (no Babylon scene), fully unit-testable. The zone's
 * `loadRealAssets` (browser-only) iterates `MERCADO_PROPS`, loads each GLB, applies
 * the placement transform via a `TransformNode` holder, and (for the downtown)
 * hides the procedural market placeholders wholesale. A missing/failed GLB leaves
 * the procedural fallback visible.
 *
 * Layout: a 4-way intersection at the origin, four road arms reaching the edges,
 * a building on each corner lot (+ textured-pack backdrops), street props, and a
 * sidewalk vendor stall (shelf + food) beside Zara. See gap #4 (iter. 2).
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

/** Faces a prop at [x,z] toward the block centre (origin). */
export function facingCenter(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

const DT = 'world/downtown/';

// --- Roads: 24.7² intersection at origin + a 4-lane arm (6×18) on each axis. ---
const ARM = 21.3; // intersection half (12.35) + arm half (9)
const ROADS: readonly WorldProp[] = [
  { key: 'road-intersection', model: `${DT}street_4wayintersection.glb`, position: [0, 0, 0] },
  { key: 'road-n', model: `${DT}street_4lane.glb`, position: [0, 0, ARM] },
  { key: 'road-s', model: `${DT}street_4lane.glb`, position: [0, 0, -ARM] },
  { key: 'road-e', model: `${DT}street_4lane.glb`, position: [ARM, 0, 0], rotationY: Math.PI / 2 },
  { key: 'road-w', model: `${DT}street_4lane.glb`, position: [-ARM, 0, 0], rotationY: Math.PI / 2 },
];

// --- Buildings: one MegaKit building per corner lot (full-height, no scaling). ---
const CORNER = 21;
const MEGA_BUILDINGS: readonly WorldProp[] = [
  { key: 'bld-ne', model: `${DT}building_large_2.glb`, position: [CORNER, 0, CORNER], rotationY: facingCenter(CORNER, CORNER) },
  { key: 'bld-nw', model: `${DT}building_medium_2_001.glb`, position: [-CORNER, 0, CORNER], rotationY: facingCenter(-CORNER, CORNER) },
  { key: 'bld-se', model: `${DT}building_small_1.glb`, position: [CORNER, 0, -CORNER], rotationY: facingCenter(CORNER, -CORNER) },
  { key: 'bld-sw', model: `${DT}building_medium_2_001.glb`, position: [-CORNER, 0, -CORNER], rotationY: facingCenter(-CORNER, -CORNER) },
];

// Textured-pack buildings (Phase B GLBs, ~2u → scale 4) as far-corner skyline depth.
const BACKDROP_BUILDINGS: readonly WorldProp[] = [
  { key: 'bld-back-n', model: 'world/buildings/6story_stack_mat.glb', position: [0, 0, 28], rotationY: Math.PI, scale: 4 },
  { key: 'bld-back-s', model: 'world/buildings/4story_mat.glb', position: [0, 0, -28], scale: 4 },
  { key: 'bld-back-e', model: 'world/buildings/3story_small_mat.glb', position: [28, 0, 0], rotationY: -Math.PI / 2, scale: 4 },
  { key: 'bld-back-w', model: 'world/buildings/2story_balcony_mat.glb', position: [-28, 0, 0], rotationY: Math.PI / 2, scale: 4 },
];

// --- Street props (decorative). ---
const PROPS: readonly WorldProp[] = [
  { key: 'prop-bollard-0', model: `${DT}prop_bollard.glb`, position: [13, 0, 13] },
  { key: 'prop-bollard-1', model: `${DT}prop_bollard.glb`, position: [-13, 0, 13] },
  { key: 'prop-bollard-2', model: `${DT}prop_bollard.glb`, position: [13, 0, -13] },
  { key: 'prop-bollard-3', model: `${DT}prop_bollard.glb`, position: [-13, 0, -13] },
  { key: 'prop-manhole', model: `${DT}prop_manholecover.glb`, position: [0, 0, 8] },
  { key: 'prop-drain', model: `${DT}prop_drain.glb`, position: [6, 0, -8] },
  { key: 'prop-planter-0', model: `${DT}prop_planter_single.glb`, position: [11, 0, 9] },
  { key: 'prop-acunit', model: `${DT}prop_acunit.glb`, position: [16, 0, 16], rotationY: facingCenter(16, 16) },
  { key: 'sidewalk-corner-ne', model: `${DT}sidewalk_corner_flat_3m.glb`, position: [13, 0, 9] },
  { key: 'sidewalk-corner-nw', model: `${DT}sidewalk_planter.glb`, position: [-13, 0, 9] },
];

// --- Sidewalk vendor stall (Ultimate shelf + food) beside Zara. ---
const VENDOR_AT: [number, number, number] = [9, 0, 9];
const VENDOR: readonly WorldProp[] = [
  { key: 'vendor-shelf', model: 'world/props/props_shelf_tall.glb', position: VENDOR_AT, rotationY: facingCenter(VENDOR_AT[0], VENDOR_AT[2]) },
  { key: 'vendor-food-0', model: 'world/food/apple.glb', position: [VENDOR_AT[0] - 0.4, 1.35, VENDOR_AT[2]], scale: 0.4 },
  { key: 'vendor-food-1', model: 'world/food/bread.glb', position: [VENDOR_AT[0] + 0.4, 1.35, VENDOR_AT[2]], scale: 0.4 },
];

/** Where Zara (and her stall) stand — a corner sidewalk just off the intersection. */
export const VENDOR_SPOT: [number, number, number] = [7, 0, 7];

/** Everything the downtown zone loads (roads first, then structures/props/vendor). */
export const MERCADO_PROPS: readonly WorldProp[] = [
  ...ROADS,
  ...MEGA_BUILDINGS,
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
