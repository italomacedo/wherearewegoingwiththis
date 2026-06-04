/**
 * WorldStreamer — seamless 3×3 tile streaming for the procedural mosaic (Fase 17).
 *
 * Holds the set of LOADED tiles (current + its ≤8 neighbors) and diff-loads the
 * ring as the player crosses tile edges, in ONE continuous coordinate space (no
 * fade/teleport). The actual Babylon/GLB/physics work is injected as `onLoad`/
 * `onUnload` callbacks, so the diff + bookkeeping + hysteresis logic here is pure
 * and fully unit-testable; GameWorldScene supplies the browser-only loaders.
 *
 * Hysteresis: the current tile keeps ownership until the player is `hysteresis`
 * metres PAST its edge, so loitering on a seam doesn't thrash load/unload. Only
 * single-step crossings are committed per axis (the player walks; teleports re-seed
 * via `setCurrent`).
 */

import {
  TILE_SIZE, GRID_MIN, GRID_MAX,
  type TileCoord, tileKey, neighbors3x3, ringDiff,
} from '@systems/world/WorldGrid';
import { ZONE_HALF } from '@assets/WorldAssetCatalog';

export interface WorldStreamerOptions {
  /** Build a tile's content (browser). May be async; errors are swallowed by the caller. */
  onLoad: (coord: TileCoord) => void | Promise<void>;
  /** Tear down a tile's content (browser). */
  onUnload: (coord: TileCoord) => void;
  /** Metres past a tile edge before the current tile switches (default 3). */
  hysteresis?: number;
}

const clampIndex = (i: number): number => Math.max(GRID_MIN, Math.min(GRID_MAX, i));

export class WorldStreamer {
  private readonly onLoad: (coord: TileCoord) => void | Promise<void>;
  private readonly onUnload: (coord: TileCoord) => void;
  private readonly hysteresis: number;
  private current: TileCoord = { tx: 0, tz: 0 };
  private loaded = new Map<string, TileCoord>();
  private started = false;

  constructor(opts: WorldStreamerOptions) {
    this.onLoad = opts.onLoad;
    this.onUnload = opts.onUnload;
    this.hysteresis = opts.hysteresis ?? 3;
  }

  /** Seed the current tile and load its full 3×3 ring (call once at spawn / after a teleport). */
  setCurrent(tile: TileCoord): void {
    this.current = { tx: clampIndex(tile.tx), tz: clampIndex(tile.tz) };
    const want = neighbors3x3(this.current.tx, this.current.tz);
    const { toLoad, toUnload } = ringDiff([...this.loaded.values()], want);
    for (const c of toUnload) this.removeTile(c);
    for (const c of want) {
      if (!this.loaded.has(tileKey(c.tx, c.tz))) this.addTile(c);
    }
    // toLoad is a subset of `want`; the loop above covers it (kept for clarity).
    void toLoad;
    this.started = true;
  }

  /**
   * Feed the player's continuous world position. Switches the current tile (with
   * hysteresis) and diff-streams the ring when it changes. Returns true if the ring changed.
   */
  update(worldX: number, worldZ: number): boolean {
    if (!this.started) return false;
    const cur = this.current;
    const cx = cur.tx * TILE_SIZE;
    const cz = cur.tz * TILE_SIZE;
    const m = ZONE_HALF + this.hysteresis;
    let tx = cur.tx;
    let tz = cur.tz;
    if (worldX > cx + m) tx = cur.tx + 1;
    else if (worldX < cx - m) tx = cur.tx - 1;
    if (worldZ > cz + m) tz = cur.tz + 1;
    else if (worldZ < cz - m) tz = cur.tz - 1;
    tx = clampIndex(tx);
    tz = clampIndex(tz);
    if (tx === cur.tx && tz === cur.tz) return false;

    const next = { tx, tz };
    const { toLoad, toUnload } = ringDiff(
      neighbors3x3(cur.tx, cur.tz),
      neighbors3x3(next.tx, next.tz),
    );
    for (const c of toUnload) this.removeTile(c);
    for (const c of toLoad) this.addTile(c);
    this.current = next;
    return true;
  }

  getCurrentTile(): TileCoord {
    return { ...this.current };
  }

  getLoadedTiles(): TileCoord[] {
    return [...this.loaded.values()];
  }

  isLoaded(tx: number, tz: number): boolean {
    return this.loaded.has(tileKey(tx, tz));
  }

  /** Unload everything (scene exit). */
  dispose(): void {
    for (const c of this.loaded.values()) this.onUnload(c);
    this.loaded.clear();
    this.started = false;
  }

  private addTile(c: TileCoord): void {
    const key = tileKey(c.tx, c.tz);
    /* istanbul ignore next -- defensive: callers (ringDiff/want-loop) pre-exclude loaded tiles */
    if (this.loaded.has(key)) return;
    this.loaded.set(key, c);
    void this.onLoad(c);
  }

  private removeTile(c: TileCoord): void {
    const key = tileKey(c.tx, c.tz);
    /* istanbul ignore next -- defensive: callers only pass currently-loaded tiles */
    if (!this.loaded.has(key)) return;
    this.loaded.delete(key);
    this.onUnload(c);
  }
}
