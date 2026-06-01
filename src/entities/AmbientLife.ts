/**
 * AmbientLife — pure data + logic for the Fase 6 street atmosphere: a few stray
 * dogs wandering the road, slumped beggars, and scattered trash. Only the wander
 * maths and placement data live here (fully unit-tested); the zone renders them
 * browser-side (GLB dogs + procedural beggars/trash) and ticks `stepDog` each frame.
 */

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A stray dog's wander state. `heading` is the world yaw (0 = +Z), matching the
 *  NPC mover convention (rotation.y = atan2(sin, cos) = heading). */
export interface DogState {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}

export const DOG_SPEED = 1.6;           // u/s while walking
export const DOG_STATE_CHANGE = 0.012;  // per-step chance to start/stop or re-aim

/** Walkable patch the strays roam: road + sidewalks, clear of the ends. */
export const DOG_BOUNDS: Bounds = { minX: -24, maxX: 22, minZ: -7, maxZ: 7 };

/** Initial stray dogs (model key + start state). One lone stray is enough. */
export interface DogSpawn {
  model: 'shibainu' | 'husky';
  state: DogState;
}
export const DOG_SPAWNS: readonly DogSpawn[] = [
  { model: 'shibainu', state: { x: -10, z: 5, heading: 1.2, moving: true } },
];

/**
 * Advance one stray dog by `dt`. Pure: randomness is injected so tests are
 * deterministic. With a small chance it toggles walking/idle and picks a new
 * heading; while walking it steps forward and reflects off the bounds (so it
 * never leaves the street).
 */
export function stepDog(d: DogState, dt: number, b: Bounds, rand: () => number): DogState {
  let { x, z, heading, moving } = d;

  if (rand() < DOG_STATE_CHANGE) {
    moving = !moving;
    if (moving) heading = rand() * Math.PI * 2;
  }

  if (moving) {
    x += Math.sin(heading) * DOG_SPEED * dt;
    z += Math.cos(heading) * DOG_SPEED * dt;
    // Reflect off the walls: an X wall flips the X velocity (heading → −heading);
    // a Z wall flips the Z velocity (heading → π − heading). Clamp to stay inside.
    if (x < b.minX) { x = b.minX; heading = -heading; }
    else if (x > b.maxX) { x = b.maxX; heading = -heading; }
    if (z < b.minZ) { z = b.minZ; heading = Math.PI - heading; }
    else if (z > b.maxZ) { z = b.maxZ; heading = Math.PI - heading; }
  }

  return { x, z, heading, moving };
}

/** Slumped beggars (non-interactive silhouettes), tucked against walls/becos. */
export interface BeggarSpot {
  x: number;
  z: number;
  /** Facing yaw (toward the street). */
  rotationY: number;
}
export const BEGGAR_SPOTS: readonly BeggarSpot[] = [
  { x: -16, z: 8.2, rotationY: Math.PI },   // north sidewalk, against a facade
  { x: 8, z: -8.2, rotationY: 0 },          // south sidewalk
  { x: -3, z: 8.0, rotationY: Math.PI },    // near a beco
];

/** Litter models (Quaternius/CC0 Survival Pack cans + bottles) keyed for placement. */
export type TrashModel =
  | 'can_broken' | 'can_open' | 'can_red' | 'can_closed' | 'waterbottle_1' | 'waterbottle_2';

/** Scattered litter in the gutters (real GLB cans/bottles, walkable). The source
 *  cans are ~0.64 u tall, so a ~0.3 scale reads as a real discarded can. */
export interface TrashSpot {
  x: number;
  z: number;
  model: TrashModel;
  /** Yaw (rad) so each piece lies at a different angle. */
  rotationY: number;
  /** Uniform scale (source props are oversized for a can). */
  scale: number;
}
export const TRASH_SPOTS: readonly TrashSpot[] = [
  { x: -20, z: 4.2, model: 'can_broken', rotationY: 0.4, scale: 0.3 },
  { x: -8, z: -4.0, model: 'can_red', rotationY: 2.1, scale: 0.3 },
  { x: 4, z: 4.4, model: 'can_open', rotationY: 4.0, scale: 0.32 },
  { x: 16, z: -4.2, model: 'waterbottle_1', rotationY: 1.2, scale: 0.28 },
  { x: 11, z: 7.0, model: 'can_closed', rotationY: 5.2, scale: 0.3 },
  { x: -13, z: -6.8, model: 'waterbottle_2', rotationY: 0.8, scale: 0.28 },
];
