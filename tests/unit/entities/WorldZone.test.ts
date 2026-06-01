import { NullEngine, Scene, Vector3, MeshBuilder } from '@babylonjs/core';
import { WorldZone, ZoneBounds } from '../../../src/entities/WorldZone';

class MeshZone extends WorldZone {
  readonly id = 'mesh-zone';
  readonly displayName = 'Mesh Zone';
  buildCount = 0;

  getSpawnPoint(): Vector3 {
    return new Vector3(0, 0, 0);
  }

  getBounds(): ZoneBounds {
    return { min: new Vector3(-1, 0, -1), max: new Vector3(1, 0, 1) };
  }

  protected async build(scene: Scene): Promise<void> {
    this.buildCount++;
    const box = MeshBuilder.CreateBox('zone-box', { size: 1 }, scene);
    this.meshes.push(box);
  }
}

describe('WorldZone', () => {
  let engine: NullEngine;
  let scene: Scene;
  let zone: MeshZone;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    zone = new MeshZone();
  });

  afterEach(() => {
    zone.unload();
    scene.dispose();
    engine.dispose();
  });

  it('starts not loaded', () => {
    expect(zone.isLoaded()).toBe(false);
  });

  it('load builds content and marks loaded', async () => {
    await zone.load(scene);
    expect(zone.isLoaded()).toBe(true);
    expect(zone.getMeshCount()).toBe(1);
    expect(zone.buildCount).toBe(1);
  });

  it('load is idempotent (does not rebuild if already loaded)', async () => {
    await zone.load(scene);
    await zone.load(scene);
    expect(zone.buildCount).toBe(1);
  });

  it('unload disposes meshes and marks not loaded', async () => {
    await zone.load(scene);
    zone.unload();
    expect(zone.isLoaded()).toBe(false);
    expect(zone.getMeshCount()).toBe(0);
  });

  it('unload is safe when not loaded', () => {
    expect(() => zone.unload()).not.toThrow();
    expect(zone.isLoaded()).toBe(false);
  });

  it('can reload after unload', async () => {
    await zone.load(scene);
    zone.unload();
    await zone.load(scene);
    expect(zone.isLoaded()).toBe(true);
    expect(zone.buildCount).toBe(2);
  });

  it('applyTimeOfDay is a no-op by default (zones opt in)', () => {
    expect(() => zone.applyTimeOfDay('night')).not.toThrow();
  });

  it('getSpawnPoint returns a Vector3', () => {
    expect(zone.getSpawnPoint()).toBeInstanceOf(Vector3);
  });

  it('getBounds returns min and max', () => {
    const bounds = zone.getBounds();
    expect(bounds.min).toBeInstanceOf(Vector3);
    expect(bounds.max).toBeInstanceOf(Vector3);
  });
});
