import { WorldStreamer } from '@systems/world/WorldStreamer';
import { TILE_SIZE, tileKey, type TileCoord } from '@systems/world/WorldGrid';

/** Records load/unload calls for assertions. */
function makeStreamer(hysteresis = 3) {
  const loaded: string[] = [];
  const unloaded: string[] = [];
  const s = new WorldStreamer({
    onLoad: (c) => { loaded.push(tileKey(c.tx, c.tz)); },
    onUnload: (c) => { unloaded.push(tileKey(c.tx, c.tz)); },
    hysteresis,
  });
  return { s, loaded, unloaded };
}

const keys = (cs: TileCoord[]) => cs.map((c) => tileKey(c.tx, c.tz)).sort();

describe('WorldStreamer (pure)', () => {
  it('setCurrent loads the full 3×3 ring around an interior tile', () => {
    const { s, loaded } = makeStreamer();
    s.setCurrent({ tx: 5, tz: 5 });
    expect(s.getCurrentTile()).toEqual({ tx: 5, tz: 5 });
    expect(loaded).toHaveLength(9);
    expect(s.getLoadedTiles()).toHaveLength(9);
    expect(s.isLoaded(6, 6)).toBe(true);
    expect(s.isLoaded(7, 5)).toBe(false);
  });

  it('setCurrent at a corner loads only the 4 in-grid tiles', () => {
    const { s, loaded } = makeStreamer();
    s.setCurrent({ tx: 0, tz: 0 });
    expect(loaded).toHaveLength(4);
    expect(s.isLoaded(0, 0)).toBe(true);
    expect(s.isLoaded(-1, 0)).toBe(false);
  });

  it('update does nothing before setCurrent', () => {
    const { s } = makeStreamer();
    expect(s.update(0, 0)).toBe(false);
  });

  it('staying inside the tile (within hysteresis) does not switch', () => {
    const { s, loaded, unloaded } = makeStreamer(3);
    s.setCurrent({ tx: 5, tz: 5 });
    loaded.length = 0;
    // tile 5 centre = 300; edge at 330; hysteresis 3 → must exceed 333 to switch.
    expect(s.update(5 * TILE_SIZE + 30, 5 * TILE_SIZE)).toBe(false); // exactly at edge
    expect(s.update(5 * TILE_SIZE + 32, 5 * TILE_SIZE)).toBe(false); // within hysteresis band
    expect(loaded).toHaveLength(0);
    expect(unloaded).toHaveLength(0);
  });

  it('crossing east past hysteresis loads the new column and unloads the old', () => {
    const { s, loaded, unloaded } = makeStreamer(3);
    s.setCurrent({ tx: 5, tz: 5 });
    loaded.length = 0;
    const changed = s.update(5 * TILE_SIZE + 34, 5 * TILE_SIZE); // >333 → tile 6
    expect(changed).toBe(true);
    expect(s.getCurrentTile()).toEqual({ tx: 6, tz: 5 });
    expect(loaded.sort()).toEqual(['7,4', '7,5', '7,6']);
    expect(unloaded.sort()).toEqual(['4,4', '4,5', '4,6']);
  });

  it('crossing west / south / north shifts the current tile the right way', () => {
    const { s: sw } = makeStreamer(3);
    sw.setCurrent({ tx: 5, tz: 5 });
    sw.update(5 * TILE_SIZE - 34, 5 * TILE_SIZE);
    expect(sw.getCurrentTile()).toEqual({ tx: 4, tz: 5 });

    const { s: ss } = makeStreamer(3);
    ss.setCurrent({ tx: 5, tz: 5 });
    ss.update(5 * TILE_SIZE, 5 * TILE_SIZE - 34);
    expect(ss.getCurrentTile()).toEqual({ tx: 5, tz: 4 });

    const { s: sn } = makeStreamer(3);
    sn.setCurrent({ tx: 5, tz: 5 });
    sn.update(5 * TILE_SIZE, 5 * TILE_SIZE + 34);
    expect(sn.getCurrentTile()).toEqual({ tx: 5, tz: 6 });
  });

  it('defaults hysteresis to 3 when not provided', () => {
    const calls: string[] = [];
    const s = new WorldStreamer({ onLoad: (c) => { calls.push(tileKey(c.tx, c.tz)); }, onUnload: () => {} });
    s.setCurrent({ tx: 5, tz: 5 });
    expect(s.update(5 * TILE_SIZE + 32, 5 * TILE_SIZE)).toBe(false); // within default band
    expect(s.update(5 * TILE_SIZE + 34, 5 * TILE_SIZE)).toBe(true);  // past default band
  });

  it('crossing a corner shifts on both axes in one update', () => {
    const { s } = makeStreamer(3);
    s.setCurrent({ tx: 5, tz: 5 });
    s.update(5 * TILE_SIZE + 40, 5 * TILE_SIZE + 40);
    expect(s.getCurrentTile()).toEqual({ tx: 6, tz: 6 });
    // loaded ring is exactly the 3×3 around (6,6)
    const want = [] as string[];
    for (let z = 5; z <= 7; z++) for (let x = 5; x <= 7; x++) want.push(`${x},${z}`);
    expect(keys(s.getLoadedTiles())).toEqual(want.sort());
  });

  it('clamps at the world edge — no out-of-grid tiles, no switch past the border', () => {
    const { s } = makeStreamer(3);
    s.setCurrent({ tx: 23, tz: 23 });
    expect(s.getLoadedTiles()).toHaveLength(4); // corner
    const changed = s.update(23 * TILE_SIZE + 100, 23 * TILE_SIZE + 100); // way past border
    expect(changed).toBe(false);
    expect(s.getCurrentTile()).toEqual({ tx: 23, tz: 23 });
  });

  it('dispose unloads everything', () => {
    const { s, unloaded } = makeStreamer();
    s.setCurrent({ tx: 2, tz: 2 });
    s.dispose();
    expect(unloaded).toHaveLength(9);
    expect(s.getLoadedTiles()).toHaveLength(0);
    expect(s.update(0, 0)).toBe(false); // started reset
  });

  it('re-seeding with setCurrent keeps shared tiles loaded (no reload)', () => {
    const { s, loaded } = makeStreamer();
    s.setCurrent({ tx: 5, tz: 5 });
    loaded.length = 0;
    s.setCurrent({ tx: 6, tz: 5 }); // overlaps columns 5,6
    // only the new column (7,*) should load; shared tiles are not reloaded
    expect(loaded.sort()).toEqual(['7,4', '7,5', '7,6']);
  });
});
