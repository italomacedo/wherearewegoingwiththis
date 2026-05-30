import { NullEngine, Scene, MeshBuilder, Vector3 } from '@babylonjs/core';
import { CameraSystem, DEFAULT_CAMERA_CONFIG } from '../../../src/systems/CameraSystem';
import { SettingsService } from '../../../src/systems/SettingsService';

describe('CameraSystem', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    SettingsService.clearMemoryStore();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    SettingsService.reset();
    SettingsService.clearMemoryStore();
  });

  it('creates an ArcRotateCamera and sets it active', () => {
    const cam = new CameraSystem(scene);
    expect(cam.getCamera()).toBeDefined();
    expect(scene.activeCamera).toBe(cam.getCamera());
  });

  it('uses cameraAngleDeg from settings for elevation', () => {
    SettingsService.set('cameraAngleDeg', 50);
    const cam = new CameraSystem(scene);
    expect(cam.getConfig().elevationDeg).toBe(50);
  });

  it('respects config overrides', () => {
    const cam = new CameraSystem(scene, { zoomDefault: 30, zoomMax: 80 });
    expect(cam.getConfig().zoomDefault).toBe(30);
    expect(cam.getConfig().zoomMax).toBe(80);
  });

  it('zoom in decreases radius', () => {
    const cam = new CameraSystem(scene);
    const before = cam.getCamera().radius;
    cam.zoom(-5);
    expect(cam.getCamera().radius).toBeLessThan(before);
  });

  it('zoom out increases radius', () => {
    const cam = new CameraSystem(scene);
    const before = cam.getCamera().radius;
    cam.zoom(5);
    expect(cam.getCamera().radius).toBeGreaterThan(before);
  });

  it('zoom clamps to zoomMin', () => {
    const cam = new CameraSystem(scene, { zoomMin: 10, zoomMax: 50, zoomDefault: 25 });
    cam.zoom(-100);
    expect(cam.getCamera().radius).toBe(10);
  });

  it('zoom clamps to zoomMax', () => {
    const cam = new CameraSystem(scene, { zoomMin: 10, zoomMax: 50, zoomDefault: 25 });
    cam.zoom(100);
    expect(cam.getCamera().radius).toBe(50);
  });

  it('rotate CW increases alpha', () => {
    const cam = new CameraSystem(scene);
    const before = cam.getCamera().alpha;
    cam.rotate(1);
    expect(cam.getCamera().alpha).toBeGreaterThan(before);
  });

  it('rotate CCW decreases alpha', () => {
    const cam = new CameraSystem(scene);
    const before = cam.getCamera().alpha;
    cam.rotate(-1);
    expect(cam.getCamera().alpha).toBeLessThan(before);
  });

  it('setElevation clamps to 30-60 range', () => {
    const cam = new CameraSystem(scene);
    cam.setElevation(100);
    expect(cam.getConfig().elevationDeg).toBe(60);
    cam.setElevation(0);
    expect(cam.getConfig().elevationDeg).toBe(30);
  });

  it('setElevation sets value within range', () => {
    const cam = new CameraSystem(scene);
    cam.setElevation(40);
    expect(cam.getConfig().elevationDeg).toBe(40);
  });

  it('update with no target does nothing', () => {
    const cam = new CameraSystem(scene);
    expect(() => cam.update()).not.toThrow();
  });

  it('update follows the target after setTarget', () => {
    const cam = new CameraSystem(scene);
    const mesh = MeshBuilder.CreateBox('t', { size: 1 }, scene);
    mesh.position = new Vector3(10, 0, 10);
    cam.setTarget(mesh);
    // Run several frames of damping
    for (let i = 0; i < 100; i++) cam.update();
    const target = cam.getCamera().getTarget();
    expect(target.x).toBeGreaterThan(5);
    expect(target.z).toBeGreaterThan(5);
  });

  it('clearTarget stops following', () => {
    const cam = new CameraSystem(scene);
    const mesh = MeshBuilder.CreateBox('t', { size: 1 }, scene);
    cam.setTarget(mesh);
    cam.clearTarget();
    expect(() => cam.update()).not.toThrow();
  });

  it('DEFAULT_CAMERA_CONFIG has sane values', () => {
    expect(DEFAULT_CAMERA_CONFIG.zoomMin).toBeLessThan(DEFAULT_CAMERA_CONFIG.zoomMax);
    expect(DEFAULT_CAMERA_CONFIG.followDamping).toBeGreaterThan(0);
    expect(DEFAULT_CAMERA_CONFIG.followDamping).toBeLessThanOrEqual(1);
  });

  it('dispose cleans up the camera', () => {
    const cam = new CameraSystem(scene);
    expect(() => cam.dispose()).not.toThrow();
  });
});
