/**
 * One-shot particle VFX (Phase 11). The flash CONFIG is a pure object (unit-tested);
 * the actual `ParticleSystem` build is browser-only (`istanbul ignore`d), modelled on
 * the vehicle smoke/explosion bursts in VehicleController (manualEmitCount + disposeOnStop).
 */

import type { Scene, Vector3 } from '@babylonjs/core';

/** Tunable shape of the muzzle flash — a brief yellow→orange cone burst. */
export interface MuzzleFlashConfig {
  capacity: number;
  emitCount: number;
  minSize: number;
  maxSize: number;
  minLifeTime: number;
  maxLifeTime: number;
  minEmitPower: number;
  maxEmitPower: number;
  /** Cone half-spread (radians) around the firing direction. */
  spread: number;
}

/** Pure: the muzzle-flash parameters (kept tiny + short so it reads as a gunshot). */
export function muzzleFlashConfig(): MuzzleFlashConfig {
  return {
    capacity: 60,
    emitCount: 40,
    minSize: 0.12,
    maxSize: 0.45,
    minLifeTime: 0.04,
    maxLifeTime: 0.12,
    minEmitPower: 4,
    maxEmitPower: 9,
    spread: 0.35,
  };
}

/* istanbul ignore next — browser/Electron particle VFX only */
export async function createMuzzleFlash(scene: Scene, position: Vector3, direction: Vector3): Promise<void> {
  if (typeof document === 'undefined') return;
  const { ParticleSystem, Texture, Color4, Vector3: V3 } = await import('@babylonjs/core');
  const cfg = muzzleFlashConfig();
  const ps = new ParticleSystem(`muzzle-${scene.getUniqueId()}-${Math.floor(scene.getEngine().getFps())}`, cfg.capacity, scene);
  ps.particleTexture = new Texture(
    'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', scene,
  );
  ps.emitter = position.clone();
  ps.color1 = new Color4(1, 0.85, 0.3, 1);
  ps.color2 = new Color4(1, 0.5, 0.05, 1);
  ps.colorDead = new Color4(0.2, 0.1, 0, 0);
  ps.minSize = cfg.minSize;
  ps.maxSize = cfg.maxSize;
  ps.minLifeTime = cfg.minLifeTime;
  ps.maxLifeTime = cfg.maxLifeTime;
  ps.minEmitPower = cfg.minEmitPower;
  ps.maxEmitPower = cfg.maxEmitPower;
  ps.manualEmitCount = cfg.emitCount;
  ps.disposeOnStop = true;
  // Fire along `direction`, with a small cone of spread.
  const d = direction.length() > 1e-4 ? direction.normalize() : new V3(0, 0, 1);
  const s = cfg.spread;
  ps.direction1 = new V3(d.x - s, d.y, d.z - s);
  ps.direction2 = new V3(d.x + s, d.y + s, d.z + s);
  ps.start();
}
