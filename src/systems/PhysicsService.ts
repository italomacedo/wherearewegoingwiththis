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
      const havok = await HavokPhysics();
      const plugin = new HavokPlugin(true, havok);
      scene.enablePhysics(this.gravity, plugin);
      this.enabled = true;
      return true;
    } catch {
      this.enabled = false;
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
