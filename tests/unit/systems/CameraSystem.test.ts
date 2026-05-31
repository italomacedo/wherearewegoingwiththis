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

  it('getYaw returns the camera orbit angle offset by +90° (camera-relative forward)', () => {
    const cam = new CameraSystem(scene);
    expect(cam.getYaw()).toBeCloseTo(cam.getCamera().alpha + Math.PI / 2, 6);
  });

  it('orbit rotates the view continuously (for middle-mouse drag)', () => {
    const cam = new CameraSystem(scene);
    const before = cam.getCamera().alpha;
    cam.orbit(0.5);
    expect(cam.getCamera().alpha).toBeCloseTo(before + 0.5, 6);
    cam.orbit(-1.2);
    expect(cam.getCamera().alpha).toBeCloseTo(before - 0.7, 6);
  });

  it('following the target preserves the orbit angle (MMB rotation is not reset each frame)', () => {
    const cam = new CameraSystem(scene);
    const mesh = MeshBuilder.CreateBox('hero', { size: 1 }, scene);
    mesh.position = new Vector3(5, 0, 5);
    cam.setTarget(mesh);
    cam.update();
    const a = cam.getCamera().alpha;
    cam.orbit(0.7);          // simulate a middle-mouse drag
    cam.update();            // follow must NOT undo the orbit
    expect(cam.getCamera().alpha).toBeCloseTo(a + 0.7, 5);
    // and the focus still tracks the hero
    for (let i = 0; i < 80; i++) cam.update();
    const t = cam.getCamera().getTarget();
    expect(t.x).toBeGreaterThan(4);
    expect(t.z).toBeGreaterThan(4);
  });

  it('enterVehicleMode widens the view and softens damping', () => {
    const cam = new CameraSystem(scene, { zoomDefault: 25, zoomMax: 50, followDamping: 0.1 });
    cam.enterVehicleMode();
    expect(cam.isVehicleMode()).toBe(true);
    expect(cam.getCamera().radius).toBe(50);
    expect(cam.getConfig().followDamping).toBeLessThanOrEqual(0.06);
  });

  it('exitVehicleMode restores the previous radius and damping', () => {
    const cam = new CameraSystem(scene, { zoomDefault: 25, zoomMax: 50, followDamping: 0.1 });
    const radius = cam.getCamera().radius;
    cam.enterVehicleMode();
    cam.exitVehicleMode();
    expect(cam.isVehicleMode()).toBe(false);
    expect(cam.getCamera().radius).toBe(radius);
    expect(cam.getConfig().followDamping).toBeCloseTo(0.1);
  });

  it('enterVehicleMode is idempotent (no double-save of state)', () => {
    const cam = new CameraSystem(scene, { zoomDefault: 25, zoomMax: 50, followDamping: 0.1 });
    const radius = cam.getCamera().radius;
    cam.enterVehicleMode();
    cam.enterVehicleMode(); // second call must not overwrite saved radius with zoomMax
    cam.exitVehicleMode();
    expect(cam.getCamera().radius).toBe(radius);
  });

  it('exitVehicleMode without entering is a no-op', () => {
    const cam = new CameraSystem(scene);
    expect(() => cam.exitVehicleMode()).not.toThrow();
    expect(cam.isVehicleMode()).toBe(false);
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
