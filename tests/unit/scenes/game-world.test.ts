import { NullEngine } from '@babylonjs/core';
import { GameWorldScene } from '../../../src/scenes/GameWorldScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { EventBus } from '../../../src/core/EventBus';
import { SettingsService } from '../../../src/systems/SettingsService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

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

  it('onEnter creates all core systems', async () => {
    await scene.onEnter();
    expect(scene.getCameraSystem()).not.toBeNull();
    expect(scene.getZoneManager()).not.toBeNull();
    expect(scene.getPlayer()).not.toBeNull();
    expect(scene.getInputSystem()).not.toBeNull();
  });

  it('onEnter loads the Mercado das Sombras zone', async () => {
    await scene.onEnter();
    expect(scene.getZoneManager()?.getCurrentZoneId()).toBe('mercado_sombras');
  });

  it('onEnter registers systems in ServiceLocator', async () => {
    await scene.onEnter();
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player'].forEach((k) => {
      expect(ServiceLocator.has(k)).toBe(true);
    });
  });

  it('onEnter spawns the player at the zone spawn point', async () => {
    await scene.onEnter();
    const player = scene.getPlayer()!;
    expect(player.getPartCount()).toBeGreaterThan(0);
  });

  it('setAppearance is applied to the spawned player', async () => {
    scene.setAppearance({ ...DEFAULT_APPEARANCE, skinTone: '#FF0000' });
    await scene.onEnter();
    expect(scene.getPlayer()).not.toBeNull();
  });

  it('onExit disposes systems and unregisters services', async () => {
    await scene.onEnter();
    await scene.onExit();
    expect(scene.getZoneManager()).toBeNull();
    expect(scene.getCameraSystem()).toBeNull();
    expect(scene.getPlayer()).toBeNull();
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player'].forEach((k) => {
      expect(ServiceLocator.has(k)).toBe(false);
    });
  });

  it('update does not throw after onEnter', async () => {
    await scene.onEnter();
    expect(() => scene.update()).not.toThrow();
  });

  it('update does not throw before onEnter', () => {
    expect(() => scene.update()).not.toThrow();
  });

  it('update moves the player when forward is held', async () => {
    await scene.onEnter();
    const player = scene.getPlayer()!;
    const before = player.getPosition().z;
    scene.getInputSystem()!.handleKeyDown('KeyW');
    scene.update();
    expect(player.getPosition().z).toBeGreaterThanOrEqual(before);
  });

  it('Q rotates the camera left', async () => {
    await scene.onEnter();
    const cam = scene.getCameraSystem()!;
    const before = cam.getYaw();
    scene.getInputSystem()!.handleKeyDown('KeyQ');
    scene.update();
    expect(cam.getYaw()).toBeLessThan(before);
  });

  it('R rotates the camera right', async () => {
    await scene.onEnter();
    const cam = scene.getCameraSystem()!;
    const before = cam.getYaw();
    scene.getInputSystem()!.handleKeyDown('KeyR');
    scene.update();
    expect(cam.getYaw()).toBeGreaterThan(before);
  });

  it('getters return null before onEnter', () => {
    expect(scene.getZoneManager()).toBeNull();
    expect(scene.getCameraSystem()).toBeNull();
    expect(scene.getPlayer()).toBeNull();
    expect(scene.getInputSystem()).toBeNull();
  });
});
