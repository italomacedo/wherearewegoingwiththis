import { AssetCache } from '@systems/world/AssetCache';
import type { AssetContainer } from '@babylonjs/core';

/** A fake container — the cache only stores/returns it; tests never instantiate (browser-only). */
const fakeContainer = (): AssetContainer => ({} as AssetContainer);

describe('AssetCache (pure dedup)', () => {
  it('parses each path at most once (cache hit returns the same promise)', async () => {
    let calls = 0;
    const cache = new AssetCache((p) => { calls += 1; void p; return Promise.resolve(fakeContainer()); });
    const a = cache.loadContainer('world/downtown/building_large_2.glb');
    const b = cache.loadContainer('world/downtown/building_large_2.glb');
    expect(a).toBe(b);          // same in-flight/cached promise
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it('dedups across many requests for the same model (one parse for N tiles)', async () => {
    let calls = 0;
    const cache = new AssetCache(() => { calls += 1; return Promise.resolve(fakeContainer()); });
    for (let i = 0; i < 20; i++) void cache.loadContainer('world/nature/commontree_1.glb');
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
    expect(cache.has('world/nature/commontree_1.glb')).toBe(true);
  });

  it('loads distinct paths separately', async () => {
    let calls = 0;
    const cache = new AssetCache((p) => { calls += 1; void p; return Promise.resolve(fakeContainer()); });
    cache.loadContainer('a.glb');
    cache.loadContainer('b.glb');
    cache.loadContainer('a.glb');
    expect(calls).toBe(2);
    expect(cache.size()).toBe(2);
  });

  it('clear() empties the cache', () => {
    const cache = new AssetCache(() => Promise.resolve(fakeContainer()));
    cache.loadContainer('a.glb');
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('a.glb')).toBe(false);
  });
});
