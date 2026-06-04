/**
 * Items the player has dropped into the world (Fase 18). Pure data + helpers,
 * persisted in `SaveGame.groundItems`. The procedural scenery regenerates from
 * the world seed, so a dropped pile must be stored explicitly to survive a
 * reload / a tile streaming out and back in. Each drop is a distinct pile (no
 * auto-merge) tagged with the mosaic tile it landed in.
 */
export interface GroundItem {
  /** The mosaic tile [tx,tz] the pile landed in (so it renders with that tile). */
  tile: [number, number];
  /** World position [x,y,z] of the pile. */
  pos: [number, number, number];
  /** Item id (ItemCatalog). */
  id: string;
  /** Stack size dropped. */
  qty: number;
}

/** Append a dropped pile (immutable; piles never auto-merge). */
export function addGroundItem(items: GroundItem[], drop: GroundItem): GroundItem[] {
  return [...items, drop];
}

/** All piles that landed in tile (tx,tz). */
export function groundItemsForTile(items: GroundItem[], tx: number, tz: number): GroundItem[] {
  return items.filter((g) => g.tile[0] === tx && g.tile[1] === tz);
}

/** Remove the pile at `index` (immutable; out-of-range = unchanged). */
export function removeGroundItemAt(items: GroundItem[], index: number): GroundItem[] {
  if (index < 0 || index >= items.length) return items;
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

/**
 * Index of the nearest pile within `radius` metres of (x,z) on the ground plane,
 * or -1 if none is in reach. Used by the on-foot pickup interaction.
 */
export function nearestGroundItemIndex(
  items: GroundItem[], x: number, z: number, radius: number,
): number {
  let best = -1;
  let bestSq = radius * radius;
  for (let i = 0; i < items.length; i++) {
    const dx = items[i].pos[0] - x;
    const dz = items[i].pos[2] - z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= bestSq) { bestSq = dSq; best = i; }
  }
  return best;
}
