/**
 * World asset catalog — Mercado das Sombras placements (Quaternius "Ultimate" CC0).
 *
 * Pure data + pure helpers (no Babylon scene), fully unit-testable. The zone's
 * `loadRealAssets` (browser-only) iterates `MERCADO_PROPS`, loads each GLB, applies
 * the placement transform, and hides the procedural placeholder named by `replaces`.
 * A missing/failed GLB simply leaves that placeholder visible (graceful fallback).
 *
 * Sources: market shelves = Modular Sci-Fi `Props_Shelf`/`Props_Shelf_Tall`; food =
 * Ultimate Food Pack; nave = a small Ultimate Spaceships model (Striker). Buildings
 * (Textured Building Pack) are added in Phase B. See ADR-0014 / gap #4.
 */

export interface WorldProp {
  /** Unique placement id (also the loaded root mesh's tracking name). */
  key: string;
  /** GLB path relative to /assets/. */
  model: string;
  /** World position [x, y, z]. */
  position: [number, number, number];
  /** Y rotation (radians); default 0. */
  rotationY?: number;
  /** Uniform scale; default 1. */
  scale?: number;
  /** Name of the procedural placeholder mesh to hide once this prop loads. */
  replaces?: string;
}

/** Half-extent of the Mercado zone bounds (matches MercadoSombrasZone.getBounds). */
export const ZONE_HALF = 30;

/** Stall grid — mirrors MercadoSombrasZone.buildStalls() coordinates/order. */
export const STALL_COORDS: ReadonlyArray<readonly [number, number]> = [
  [-6, -6], [-6, 0], [-6, 6],
  [6, -6], [6, 0], [6, 6],
];

/** Faces a prop at [x,z] toward the market centre (origin). */
export function facingCenter(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

const SHELF_MODELS = ['world/props/props_shelf.glb', 'world/props/props_shelf_tall.glb'];
const FOOD_MODELS = [
  'world/food/apple.glb', 'world/food/banana.glb', 'world/food/bread.glb',
  'world/food/carrot.glb', 'world/food/fish.glb', 'world/food/bottle1.glb',
];
const FOOD_SCALE = 0.4;
/** Approx. shelf top tier height the food rests on (tuned in Electron). */
const SHELF_TOP_Y = 1.35;

/** Market shelves — one per stall slot, replacing the procedural counters. */
export const MERCADO_STALLS: readonly WorldProp[] = STALL_COORDS.map(([x, z], i) => ({
  key: `stall-real-${i}`,
  model: SHELF_MODELS[i % SHELF_MODELS.length]!,
  position: [x, 0, z],
  rotationY: facingCenter(x, z),
  scale: 1,
  replaces: `stall-${i}`,
}));

/** Food sitting on each shelf (two items per stall), purely decorative. */
export const MERCADO_FOOD: readonly WorldProp[] = STALL_COORDS.flatMap(([x, z], i) => {
  const offsets: Array<[number, number]> = [[-0.5, 0.1], [0.5, -0.1]];
  return offsets.map(([dx, dz], j) => ({
    key: `food-${i}-${j}`,
    model: FOOD_MODELS[(i * 2 + j) % FOOD_MODELS.length]!,
    position: [x + dx, SHELF_TOP_Y, z + dz] as [number, number, number],
    scale: FOOD_SCALE,
  }));
});

/** Buildings — filled in Phase B (Textured Building Pack). */
export const MERCADO_BUILDINGS: readonly WorldProp[] = [];

/** Everything the zone loads, in draw order (buildings, then stalls, then food). */
export const MERCADO_PROPS: readonly WorldProp[] = [
  ...MERCADO_BUILDINGS,
  ...MERCADO_STALLS,
  ...MERCADO_FOOD,
];

/** Atmospheric nave (small Spaceships model) — replaces the flying bike. */
export const NAVE_MODEL = {
  path: 'vehicles/nave.glb',
  scale: 0.6,
  yaw: Math.PI,
} as const;
