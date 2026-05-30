import { NullEngine } from '@babylonjs/core';
import { GameWorldScene } from '../../../src/scenes/GameWorldScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { EventBus } from '../../../src/core/EventBus';
import { SettingsService } from '../../../src/systems/SettingsService';

describe('GameWorldScene', () => {
  let engine: NullEngine;
  let scene: GameWorldScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('eventBus', new EventBus());
    SettingsService.clearMemoryStore();
    scene = new GameWorldScene(engine);
  });

  afterEach(async () => {
    await scene.onExit();
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  it('constructs without error', () => {
    expect(scene.babylonScene).toBeDefined();
  });

  it('onEnter creates camera system and zone manager', async () => {
    await scene.onEnter();
    expect(scene.getCameraSystem()).not.toBeNull();
    expect(scene.getZoneManager()).not.toBeNull();
  });

  it('onEnter loads the Mercado das Sombras zone', async () => {
    await scene.onEnter();
    expect(scene.getZoneManager()?.getCurrentZoneId()).toBe('mercado_sombras');
  });

  it('onEnter registers cameraSystem and zoneManager in ServiceLocator', async () => {
    await scene.onEnter();
    expect(ServiceLocator.has('cameraSystem')).toBe(true);
    expect(ServiceLocator.has('zoneManager')).toBe(true);
  });

  it('onEnter creates a spawn marker followed by the camera', async () => {
    await scene.onEnter();
    const marker = scene.babylonScene.meshes.find((m) => m.name === 'spawn-marker');
    expect(marker).toBeDefined();
  });

  it('onExit disposes managers and unregisters services', async () => {
    await scene.onEnter();
    await scene.onExit();
    expect(scene.getZoneManager()).toBeNull();
    expect(scene.getCameraSystem()).toBeNull();
    expect(ServiceLocator.has('zoneManager')).toBe(false);
    expect(ServiceLocator.has('cameraSystem')).toBe(false);
  });

  it('update does not throw after onEnter', async () => {
    await scene.onEnter();
    expect(() => scene.update()).not.toThrow();
  });

  it('update does not throw before onEnter', () => {
    expect(() => scene.update()).not.toThrow();
  });

  it('getZoneManager returns null before onEnter', () => {
    expect(scene.getZoneManager()).toBeNull();
  });

  it('getCameraSystem returns null before onEnter', () => {
    expect(scene.getCameraSystem()).toBeNull();
  });
});
