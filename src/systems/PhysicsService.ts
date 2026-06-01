import { Scene, Vector3 } from '@babylonjs/core';

/**
 * Wraps Havok physics initialization. The Havok engine ships as a WASM module
 * loaded asynchronously — it only runs in browser/Electron. In Node.js/Jest,
 * init() is a no-op and isEnabled() stays false, so gameplay code that depends
 * on physics must provide a non-physics fallback (see PlayerController).
 */
export class PhysicsService {
  private enabled = false;
  private gravity = new Vector3(0, -9.81, 0);

  /** Loads Havok WASM and enables physics on the scene. Browser/Electron only. */
  async init(scene: Scene): Promise<boolean> {
    if (typeof document === 'undefined') {
      // Node.js / Jest — no WASM available
      this.enabled = false;
      return false;
    }
    /* istanbul ignore next — Havok WASM load, browser/Electron only */
    return this.initHavok(scene);
  }

  /* istanbul ignore next */
  private async initHavok(scene: Scene): Promise<boolean> {
    try {
      const HavokPhysics = (await import('@babylonjs/havok')).default;
      const { HavokPlugin } = await import('@babylonjs/core');
      // Serve the .wasm from /public (copied there by scripts/copy-havok-wasm.mjs).
      // Without an explicit path Havok resolves the wrong URL and the request falls
      // through to index.html → "Incorrect response MIME type" / WASM magic-word error.
      const havok = await HavokPhysics({ locateFile: () => '/HavokPhysics.wasm' });
      const plugin = new HavokPlugin(true, havok);
      scene.enablePhysics(this.gravity, plugin);
      this.enabled = true;
      console.warn('[Physics] Havok enabled');
      return true;
    } catch (err) {
      this.enabled = false;
      console.warn('[Physics] Havok init failed, continuing without physics:', err);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getGravity(): Vector3 {
    return this.gravity.clone();
  }

  setGravity(g: Vector3): void {
    this.gravity = g.clone();
  }
}
