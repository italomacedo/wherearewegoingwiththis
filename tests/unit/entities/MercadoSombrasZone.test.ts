import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { MercadoSombrasZone } from '../../../src/entities/zones/MercadoSombrasZone';

describe('MercadoSombrasZone', () => {
  let engine: NullEngine;
  let scene: Scene;
  let zone: MercadoSombrasZone;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    zone = new MercadoSombrasZone();
  });

  afterEach(() => {
    zone.unload();
    scene.dispose();
    engine.dispose();
  });

  it('has correct id and display name', () => {
    expect(zone.id).toBe('mercado_sombras');
    expect(zone.displayName).toBe('Mercado das Sombras');
  });

  it('getSpawnPoint returns origin', () => {
    expect(zone.getSpawnPoint()).toEqual(new Vector3(0, 0, 0));
  });

  it('getBounds returns a 60x60 area', () => {
    const bounds = zone.getBounds();
    expect(bounds.max.x - bounds.min.x).toBe(60);
    expect(bounds.max.z - bounds.min.z).toBe(60);
  });

  it('load builds ground, buildings, and stalls', async () => {
    await zone.load(scene);
    const meshes = zone.getAllMeshes();
    // ground (1) + buildings (12) + stalls (6) = 19
    expect(meshes.length).toBeGreaterThanOrEqual(19);
  });

  it('load creates the ground mesh', async () => {
    await zone.load(scene);
    const ground = zone.getAllMeshes().find((m) => m.name === 'mercado-ground');
    expect(ground).toBeDefined();
  });

  it('load creates building meshes', async () => {
    await zone.load(scene);
    const buildings = zone.getAllMeshes().filter((m) => m.name.startsWith('building-'));
    expect(buildings.length).toBe(12);
  });

  it('load creates stall meshes', async () => {
    await zone.load(scene);
    const stalls = zone.getAllMeshes().filter((m) => m.name.startsWith('stall-'));
    expect(stalls.length).toBe(6);
  });

  it('load creates neon point lights', async () => {
    await zone.load(scene);
    expect(zone.getLightCount()).toBe(4);
  });

  it('unload disposes all meshes and lights', async () => {
    await zone.load(scene);
    zone.unload();
    expect(zone.getMeshCount()).toBe(0);
    expect(zone.getLightCount()).toBe(0);
  });

  it('unload disposes the ambient light', async () => {
    await zone.load(scene);
    zone.unload();
    const ambient = scene.lights.find((l) => l.name === 'ambient');
    expect(ambient).toBeUndefined();
  });

  it('isLoaded reflects load state', async () => {
    expect(zone.isLoaded()).toBe(false);
    await zone.load(scene);
    expect(zone.isLoaded()).toBe(true);
  });
});
