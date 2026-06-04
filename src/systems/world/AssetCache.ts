/**
 * AssetCache — load each GLB once, then INSTANCE clones (Fase 17H).
 *
 * The tile streamer re-used the same building/tree/prop GLBs on every tile and
 * re-parsed them from disk each time (synchronous glTF parse on the main thread →
 * stutter). This caches each unique `AssetContainer` (parsed at most once, with
 * in-flight dedup) and hands out cheap clones via `instantiateModelsToScene`
 * (GPU-instanced where possible) — the same pattern already used for the stray dog.
 *
 * The cache/dedup bookkeeping is pure (loader injected → unit-tested); the Babylon
 * `instantiate` + the default SceneLoader-backed loader are browser-only.
 */

import type { Scene, AssetContainer, InstantiatedEntries } from '@babylonjs/core';

/** Loads (parses) the AssetContainer for a GLB path. Injected so tests use a fake. */
export type ContainerLoader = (path: string) => Promise<AssetContainer>;

export class AssetCache {
  private readonly containers = new Map<string, Promise<AssetContainer>>();

  constructor(private readonly loader: ContainerLoader) {}

  /** The AssetContainer for `path`, parsed at most once (in-flight + cached dedup). */
  loadContainer(path: string): Promise<AssetContainer> {
    const hit = this.containers.get(path);
    if (hit) return hit;
    const p = this.loader(path);
    this.containers.set(path, p);
    return p;
  }

  /** Whether a container for `path` has been requested (cached or in-flight). */
  has(path: string): boolean {
    return this.containers.has(path);
  }

  /** Number of distinct GLBs cached/requested (observability + tests). */
  size(): number {
    return this.containers.size;
  }

  /**
   * Clone the cached GLB into the scene (cheap — shares geometry; hardware-instanced
   * where possible). Materials are shared (props aren't per-instance tinted). Returns
   * the instantiated entries (rootNodes/skeletons/animationGroups) or null on failure.
   */
  /* istanbul ignore next — Babylon instancing is browser/Electron only */
  async instantiate(path: string, _scene: Scene): Promise<InstantiatedEntries | null> {
    try {
      const container = await this.loadContainer(path);
      return container.instantiateModelsToScene(undefined, false);
    } catch {
      this.containers.delete(path); // let a genuinely-missing/failed GLB retry later
      return null;
    }
  }

  clear(): void {
    this.containers.clear();
  }
}

/**
 * The default browser loader (SceneLoader). Dynamic imports keep Babylon's loader
 * out of the Jest bundle; the cache itself stays pure with an injected loader.
 */
/* istanbul ignore next — browser/Electron GLB loading */
export function babylonContainerLoader(scene: Scene): ContainerLoader {
  return async (path: string) => {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');
    return SceneLoader.LoadAssetContainerAsync('/assets/', path, scene);
  };
}
