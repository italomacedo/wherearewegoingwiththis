/**
 * InteriorRuntime — pure math for entering/leaving authored interiors (F6).
 *
 * An interior is built ONE AT A TIME at INTERIOR_ORIGIN, far outside the 24×24
 * mosaic (world spans 0±30 .. 1410±30), so it never collides with streamed
 * tiles; world streaming pauses while inside. The entry door trigger is kept so
 * the return door teleports the player back to it.
 */
import type { WorldDoorTrigger } from '@systems/world/SceneDocToTile';

/** Where interiors are instantiated (well outside the mosaic). */
export const INTERIOR_ORIGIN: [number, number, number] = [-5000, 0, -5000];

/** Half-size of an interior room (matches the editor's 60×60 default). */
export const INTERIOR_HALF = 30;

/** Re-entry grace after a door teleport so the player doesn't ping-pong (s). */
export const DOOR_COOLDOWN_S = 1.5;

/** Map an interior-local position to its world position. */
export function interiorWorldPos(local: [number, number, number]): [number, number, number] {
  return [
    local[0] + INTERIOR_ORIGIN[0],
    local[1] + INTERIOR_ORIGIN[1],
    local[2] + INTERIOR_ORIGIN[2],
  ];
}

/** The first trigger whose AABB contains (x,y,z), or null. */
export function doorTriggerHit(
  pos: { x: number; y: number; z: number },
  triggers: readonly WorldDoorTrigger[],
): WorldDoorTrigger | null {
  for (const t of triggers) {
    const hx = t.size[0] / 2;
    const hy = t.size[1] / 2;
    const hz = t.size[2] / 2;
    // Volumes sit ON the ground: their box spans [y, y+size] (door render rule).
    const cy = t.position[1] + hy;
    if (Math.abs(pos.x - t.position[0]) <= hx
      && Math.abs(pos.y - cy) <= hy + 0.5
      && Math.abs(pos.z - t.position[2]) <= hz) return t;
  }
  return null;
}

/**
 * The way back out: a trigger volume at the interior's spawn point whose
 * "spawnPoint" is the WORLD entry door position (where the player reappears).
 */
export function returnTrigger(entry: WorldDoorTrigger): WorldDoorTrigger {
  return {
    key: `return-${entry.key}`,
    position: interiorWorldPos(entry.spawnPoint),
    size: [2, 3, 2],
    targetSceneId: '', // '' = back outside
    spawnPoint: [entry.position[0], entry.position[1], entry.position[2]],
  };
}

/** Stable seed key for an interior item placement (collected-set persistence). */
export function interiorItemKey(docId: string, index: number): string {
  return `int:${docId}:${index}`;
}
