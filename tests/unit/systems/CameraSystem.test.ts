import { NullEngine, Scene, MeshBuilder, Vector3 } from '@babylonjs/core';
import { CameraSystem, DEFAULT_CAMERA_CONFIG, CONVERSATION_RADIUS, VEHICLE_RADIUS } from '../../../src/systems/CameraSystem';
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

  it('first-person: starts off; toggling without an FP camera stays on the arc cam', () => {
    const cam = new CameraSystem(scene);
    expect(cam.isFirstPerson()).toBe(false);
    cam.setFirstPerson(true); // no FP camera created headless → stays arc
    expect(cam.isFirstPerson()).toBe(false);
    expect(scene.activeCamera).toBe(cam.getCamera());
    cam.disableFirstPerson(); // reverts cleanly, no throw
    expect(scene.activeCamera).toBe(cam.getCamera());
    expect(cam.isFirstPerson()).toBe(false);
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

  it('shortestAngleDelta returns the smallest signed wrap-around delta', () => {
    expect(CameraSystem.shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    // Going from 0 to 3π/2 is shorter the negative way (−π/2).
    expect(CameraSystem.shortestAngleDelta(0, (3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('alignBehind eases the orbit to sit behind the car (alpha → heading + π/2)', () => {
    const cam = new CameraSystem(scene);
    const heading = 1.0;
    const target = heading + Math.PI / 2;
    const before = Math.abs(CameraSystem.shortestAngleDelta(cam.getCamera().alpha, target));
    cam.alignBehind(heading, 0.5);
    const after = Math.abs(CameraSystem.shortestAngleDelta(cam.getCamera().alpha, target));
    expect(after).toBeLessThan(before); // moved toward sitting behind the car
    // factor 1 snaps the orbit onto the behind-the-car angle.
    cam.alignBehind(heading, 1);
    expect(CameraSystem.shortestAngleDelta(cam.getCamera().alpha, target)).toBeCloseTo(0, 5);
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

  it('enterVehicleMode pulls the camera in close and softens damping', () => {
    const cam = new CameraSystem(scene, { zoomDefault: 25, zoomMax: 50, followDamping: 0.1 });
    cam.enterVehicleMode();
    expect(cam.isVehicleMode()).toBe(true);
    expect(cam.getCamera().radius).toBe(VEHICLE_RADIUS);
    // the on-foot lower-radius clamp is relaxed so the tight radius isn't clamped
    expect(cam.getCamera().lowerRadiusLimit).toBe(VEHICLE_RADIUS);
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

  it('enterConversationMode frames the NPC and pulls the camera in close', () => {
    const cam = new CameraSystem(scene, { zoomMin: 6, zoomMax: 50, zoomDefault: 14 });
    const npc = MeshBuilder.CreateBox('npc', { size: 1 }, scene);
    npc.position = new Vector3(20, 0, 0);
    cam.enterConversationMode(npc);
    expect(cam.isConversationMode()).toBe(true);
    expect(cam.getCamera().radius).toBe(CONVERSATION_RADIUS);
    // focus pans toward the NPC
    for (let i = 0; i < 100; i++) cam.update();
    expect(cam.getCamera().getTarget().x).toBeGreaterThan(10);
  });

  it('exitConversationMode restores radius and the previous follow target', () => {
    const cam = new CameraSystem(scene, { zoomMin: 6, zoomMax: 50, zoomDefault: 14 });
    const hero = MeshBuilder.CreateBox('hero', { size: 1 }, scene);
    hero.position = new Vector3(-12, 0, 0);
    const npc = MeshBuilder.CreateBox('npc', { size: 1 }, scene);
    npc.position = new Vector3(20, 0, 0);
    cam.setTarget(hero);
    const radiusBefore = cam.getCamera().radius;
    cam.enterConversationMode(npc);
    cam.exitConversationMode();
    expect(cam.isConversationMode()).toBe(false);
    expect(cam.getCamera().radius).toBe(radiusBefore);
    // follow returns to the hero
    for (let i = 0; i < 120; i++) cam.update();
    expect(cam.getCamera().getTarget().x).toBeLessThan(-5);
  });

  it('enterConversationMode is idempotent (no double-save of radius)', () => {
    const cam = new CameraSystem(scene, { zoomMin: 6, zoomMax: 50, zoomDefault: 14 });
    const npc = MeshBuilder.CreateBox('npc', { size: 1 }, scene);
    const radius = cam.getCamera().radius;
    cam.enterConversationMode(npc);
    cam.enterConversationMode(npc); // must not capture CONVERSATION_RADIUS as the saved value
    cam.exitConversationMode();
    expect(cam.getCamera().radius).toBe(radius);
  });

  it('exitConversationMode without entering is a no-op', () => {
    const cam = new CameraSystem(scene);
    expect(() => cam.exitConversationMode()).not.toThrow();
    expect(cam.isConversationMode()).toBe(false);
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

  describe('free (RTS) camera mode', () => {
    it('enterFreeMode detaches follow, frames the focus, and sets the radius', () => {
      const cam = new CameraSystem(scene);
      const hero = MeshBuilder.CreateBox('hero', {}, scene);
      cam.setTarget(hero);
      cam.enterFreeMode(new Vector3(5, 0, 9), 20);
      expect(cam.isFreeMode()).toBe(true);
      expect(cam.getCamera().radius).toBe(20);
      expect(cam.getCamera().target.x).toBeCloseTo(5);
      expect(cam.getCamera().target.z).toBeCloseTo(9);
      // update() must NOT re-follow the hero while free.
      hero.position.set(50, 0, 50);
      cam.update();
      expect(cam.getCamera().target.x).toBeCloseTo(5);
    });

    it('panFree moves the focus on the ground; exitFreeMode restores follow + radius', () => {
      const cam = new CameraSystem(scene);
      const hero = MeshBuilder.CreateBox('hero', {}, scene);
      cam.setTarget(hero);
      const r0 = cam.getCamera().radius;
      cam.enterFreeMode(new Vector3(0, 0, 0), 18);
      const before = cam.getCamera().target.clone();
      cam.panFree(4, 0);
      const moved = cam.getCamera().target.clone();
      expect(Math.hypot(moved.x - before.x, moved.z - before.z)).toBeCloseTo(4, 4);
      cam.exitFreeMode();
      expect(cam.isFreeMode()).toBe(false);
      expect(cam.getCamera().radius).toBe(r0);
      // Follow resumes: update() pulls the focus back toward the hero.
      hero.position.set(10, 0, 10);
      cam.update();
      expect(cam.getCamera().target.z).not.toBeCloseTo(moved.z); // focus moved off the panned spot
      expect(cam.getCamera().target.x).toBeGreaterThan(moved.x);
    });

    it('enterFreeMode is idempotent and panFree/exit are no-ops outside free mode', () => {
      const cam = new CameraSystem(scene);
      cam.enterFreeMode(new Vector3(1, 0, 1), 15);
      cam.enterFreeMode(new Vector3(9, 0, 9), 30); // ignored (already free)
      expect(cam.getCamera().radius).toBe(15);
      cam.exitFreeMode();
      const t = cam.getCamera().target.clone();
      cam.panFree(5, 5); // not in free mode → no-op
      expect(cam.getCamera().target.x).toBeCloseTo(t.x);
      expect(() => cam.exitFreeMode()).not.toThrow();
    });
  });
});
