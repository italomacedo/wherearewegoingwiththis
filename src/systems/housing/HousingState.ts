/**
 * HousingState — the player's home furniture layout, pure and headless.
 *
 * Mirrors `EditorState`: a list of placed furniture + a single selection, mutated
 * by place/move/rotate/scale/remove. The browser layer (HousingEditor) is a dumb
 * renderer that forwards gizmo drags into `setTransform` and shop clicks into
 * `place`. Credits/inventory live OUTSIDE this class (the scene uses Economy) — a
 * `place` is gated by affordability before it is called, and `removeSelected`
 * returns the removed defId so the scene can refund.
 *
 * Positions are interior-LOCAL (the same space as SceneDoc `prop.position`), so the
 * scene offsets them to INTERIOR_ORIGIN exactly like authored props.
 */
import { furnitureDef } from '@systems/housing/FurnitureCatalog';

/** A single furniture instance placed in the home. */
export interface PlacedFurniture {
  /** Unique instance id (stable across saves). */
  key: string;
  /** FurnitureCatalog id (the model + price + storage come from there). */
  defId: string;
  /** Interior-local position [x,y,z]. */
  position: [number, number, number];
  /** Heading in radians. */
  rotationY: number;
  /** Uniform scale (default 1). */
  scale?: number;
}

export interface TransformPatch {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
}

/** A unique key for a new piece of `defId`: `defId`, `defId_2`, `defId_3`, … */
export function uniqueFurnitureKey(placed: readonly PlacedFurniture[], defId: string): string {
  const used = new Set(placed.map((p) => p.key));
  if (!used.has(defId)) return defId;
  let n = 2;
  while (used.has(`${defId}_${n}`)) n++;
  return `${defId}_${n}`;
}

export class HousingState {
  placed: PlacedFurniture[] = [];
  /** Selected instance key, or null. */
  selection: string | null = null;

  /** Replace the whole layout (load). Clears the selection. */
  load(placed: readonly PlacedFurniture[]): void {
    this.placed = placed.map((p) => ({ ...p, position: [...p.position] as [number, number, number] }));
    this.selection = null;
  }

  /** Place a new piece of `defId` at `at` (interior-local), select it, return its key. */
  place(defId: string, at: [number, number, number]): string {
    const key = uniqueFurnitureKey(this.placed, defId);
    const def = furnitureDef(defId);
    this.placed.push({
      key,
      defId,
      position: [...at],
      rotationY: 0,
      scale: def?.defaultScale ?? 1,
    });
    this.selection = key;
    return key;
  }

  /** Select a piece by key (or clear with null). */
  select(key: string | null): void {
    this.selection = key && this.placed.some((p) => p.key === key) ? key : null;
  }

  /** The selected piece, if any. */
  selected(): PlacedFurniture | null {
    if (!this.selection) return null;
    return this.placed.find((p) => p.key === this.selection) ?? null;
  }

  /** Look a piece up by key. */
  byKey(key: string): PlacedFurniture | null {
    return this.placed.find((p) => p.key === key) ?? null;
  }

  /** Write a transform patch into the selected piece. Returns whether it applied. */
  setTransform(patch: TransformPatch): boolean {
    const piece = this.selected();
    if (!piece) return false;
    if (patch.position) piece.position = [...patch.position];
    if (patch.rotationY !== undefined) piece.rotationY = patch.rotationY;
    if (patch.scale !== undefined) piece.scale = Math.max(0.1, patch.scale);
    return true;
  }

  /** Remove the selected piece. Returns its defId (for the refund) or null. */
  removeSelected(): string | null {
    const piece = this.selected();
    if (!piece) return null;
    this.placed = this.placed.filter((p) => p.key !== piece.key);
    this.selection = null;
    return piece.defId;
  }

  /**
   * The placed STORAGE piece nearest to (x,z) within `radius` metres (interior-local
   * planar distance), or null. Mirrors `nearestGroundItemIndex` — used by the
   * `[E]`-on-cabinet check.
   */
  nearestStorage(x: number, z: number, radius: number): PlacedFurniture | null {
    let best: PlacedFurniture | null = null;
    let bestD = radius * radius;
    for (const p of this.placed) {
      if (furnitureDef(p.defId)?.storageCapacity === undefined) continue;
      const dx = p.position[0] - x;
      const dz = p.position[2] - z;
      const d = dx * dx + dz * dz;
      if (d <= bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Snapshot for persistence (a deep copy of the placed list). */
  toState(): PlacedFurniture[] {
    return this.placed.map((p) => ({ ...p, position: [...p.position] as [number, number, number] }));
  }
}
