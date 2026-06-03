import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  VehicleController, DEFAULT_VEHICLE_CONFIG, VehicleFlightState,
} from '../../../src/entities/VehicleController';

const zeroState = (): VehicleFlightState => ({ position: Vector3.Zero(), velocity: Vector3.Zero() });

describe('VehicleController.computeFlightStep (pure flight model)', () => {
  it('forward thrust accelerates along +z at yaw 0', () => {
    const next = VehicleController.computeFlightStep(
      zeroState(), { axis: { x: 0, z: 1 }, vertical: 0 }, 0, 0.1
    );
    expect(next.velocity.z).toBeGreaterThan(0);
    expect(next.position.z).toBeGreaterThan(0);
    expect(next.velocity.x).toBeCloseTo(0);
  });

  it('camera yaw rotates the thrust direction', () => {
    // Same convention as PlayerController: at yaw +90°, forward (z) maps onto -x.
    const next = VehicleController.computeFlightStep(
      zeroState(), { axis: { x: 0, z: 1 }, vertical: 0 }, Math.PI / 2, 0.1
    );
    expect(next.velocity.x).toBeLessThan(0);
    expect(next.velocity.z).toBeCloseTo(0, 5);
  });

  it('holds altitude at neutral vertical input (hover)', () => {
    const start: VehicleFlightState = { position: new Vector3(0, 10, 0), velocity: Vector3.Zero() };
    const next = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: 0 }, 0, 0.5);
    expect(next.position.y).toBeCloseTo(10, 5);
    expect(next.velocity.y).toBeCloseTo(0, 5);
  });

  it('ascend raises altitude, descend lowers it', () => {
    const start: VehicleFlightState = { position: new Vector3(0, 10, 0), velocity: Vector3.Zero() };
    const up = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: 1 }, 0, 0.2);
    const down = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: -1 }, 0, 0.2);
    expect(up.position.y).toBeGreaterThan(10);
    expect(down.position.y).toBeLessThan(10);
  });

  it('clamps to the floor (hoverHeight) and kills downward velocity', () => {
    const start: VehicleFlightState = {
      position: new Vector3(0, DEFAULT_VEHICLE_CONFIG.hoverHeight, 0),
      velocity: new Vector3(0, -5, 0),
    };
    const next = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: -1 }, 0, 0.2);
    expect(next.position.y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.hoverHeight);
    expect(next.velocity.y).toBe(0);
  });

  it('clamps to the ceiling (maxAltitude) and kills upward velocity', () => {
    const start: VehicleFlightState = {
      position: new Vector3(0, DEFAULT_VEHICLE_CONFIG.maxAltitude, 0),
      velocity: new Vector3(0, 5, 0),
    };
    const next = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: 1 }, 0, 0.2);
    expect(next.position.y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.maxAltitude);
    expect(next.velocity.y).toBe(0);
  });

  it('caps horizontal speed at maxSpeed', () => {
    const cfg = { ...DEFAULT_VEHICLE_CONFIG, drag: 0, maxSpeed: 2, thrust: 50, hoverHeight: 0 };
    let state: VehicleFlightState = { position: new Vector3(0, 5, 0), velocity: Vector3.Zero() };
    for (let i = 0; i < 30; i++) {
      state = VehicleController.computeFlightStep(state, { axis: { x: 0, z: 1 }, vertical: 0 }, 0, 0.1, cfg);
    }
    const horiz = Math.hypot(state.velocity.x, state.velocity.z);
    expect(horiz).toBeLessThanOrEqual(2 + 1e-6);
  });

  it('drag decays velocity toward zero when no input', () => {
    const start: VehicleFlightState = { position: new Vector3(0, 5, 0), velocity: new Vector3(5, 0, 0) };
    const next = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: 0 }, 0, 0.2);
    expect(Math.abs(next.velocity.x)).toBeLessThan(5);
  });

  it('confines X/Z to horizontalHalfExtent and zeroes the velocity into the wall', () => {
    const cfg = { ...DEFAULT_VEHICLE_CONFIG, horizontalHalfExtent: 30 };
    // Past the +X edge, moving outward → clamped to +30, x-velocity zeroed.
    const out: VehicleFlightState = { position: new Vector3(35, 5, -40), velocity: new Vector3(5, 0, -5) };
    const next = VehicleController.computeFlightStep(out, { axis: { x: 0, z: 0 }, vertical: 0 }, 0, 0.1, cfg);
    expect(next.position.x).toBeLessThanOrEqual(30 + 1e-6);
    expect(next.position.z).toBeGreaterThanOrEqual(-30 - 1e-6);
    expect(next.velocity.x).toBe(0); // velocity into the +X wall is cancelled
    expect(next.velocity.z).toBe(0); // velocity into the -Z wall is cancelled
  });

  it('does not confine when horizontalHalfExtent is Infinity (default)', () => {
    const start: VehicleFlightState = { position: new Vector3(100, 5, 100), velocity: Vector3.Zero() };
    const next = VehicleController.computeFlightStep(start, { axis: { x: 0, z: 0 }, vertical: 0 }, 0, 0.1);
    expect(next.position.x).toBeCloseTo(100, 5);
    expect(next.position.z).toBeCloseTo(100, 5);
  });
});

describe('VehicleController instance', () => {
  let engine: NullEngine;
  let scene: Scene;
  let vehicle: VehicleController;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    vehicle = new VehicleController(scene);
  });

  afterEach(() => {
    vehicle.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('has no parts before spawn and is not occupied', () => {
    expect(vehicle.getPartCount()).toBe(0);
    expect(vehicle.isOccupied()).toBe(false);
  });

  it('setUseGltf toggles the flag; stays on placeholder headlessly', () => {
    try {
      VehicleController.setUseGltf(true);
      expect(VehicleController.useGltf).toBe(true);
      expect(VehicleController.canLoadGltf()).toBe(false); // no document in Node
      vehicle.spawn(new Vector3(0, 0, 0));
      expect(vehicle.getPartCount()).toBeGreaterThan(0); // placeholder, not GLB
    } finally {
      VehicleController.setUseGltf(false);
    }
  });

  it('spawn builds the placeholder and parks resting on the ground', () => {
    vehicle.spawn(new Vector3(2, 0, 3));
    expect(vehicle.getPartCount()).toBeGreaterThan(0);
    expect(vehicle.getPosition().y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.groundRestHeight);
    expect(vehicle.getPosition().x).toBeCloseTo(2);
  });

  it('update is a no-op while unoccupied', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    const before = vehicle.getPosition();
    vehicle.update(0.5, { axis: { x: 0, z: 1 }, vertical: 0 }, 0);
    expect(vehicle.getPosition().z).toBeCloseTo(before.z);
  });

  it('moves when occupied and piloted forward', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    expect(vehicle.isOccupied()).toBe(true);
    for (let i = 0; i < 10; i++) {
      vehicle.update(0.1, { axis: { x: 0, z: 1 }, vertical: 0 }, 0);
    }
    expect(vehicle.getPosition().z).toBeGreaterThan(0);
    expect(vehicle.getRoot().position.z).toBeCloseTo(vehicle.getPosition().z);
  });

  it('sets facing when moving', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    for (let i = 0; i < 5; i++) {
      vehicle.update(0.1, { axis: { x: 1, z: 0 }, vertical: 0 }, 0);
    }
    expect(vehicle.getFacing()).not.toBe(0);
  });

  it('exit stops the vehicle but keeps it parked', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    vehicle.update(0.1, { axis: { x: 0, z: 1 }, vertical: 0 }, 0);
    const parked = vehicle.getPosition();
    vehicle.exit();
    expect(vehicle.isOccupied()).toBe(false);
    vehicle.update(0.5, { axis: { x: 0, z: 1 }, vertical: 0 }, 0);
    expect(vehicle.getPosition().z).toBeCloseTo(parked.z);
  });

  it('canEnter is true within radius and false outside', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    expect(vehicle.canEnter(new Vector3(1, 0, 0))).toBe(true);
    expect(vehicle.canEnter(new Vector3(20, 0, 20))).toBe(false);
  });

  // ─── Health / crash / smoke / explosion ────────────────────────────────────

  function climb(steps: number): void {
    vehicle.enter();
    for (let i = 0; i < steps; i++) vehicle.update(0.1, { axis: { x: 0, z: 0 }, vertical: 1 }, 0);
  }
  function fall(steps: number): void {
    vehicle.exit();
    for (let i = 0; i < steps; i++) vehicle.update(0.1, { axis: { x: 0, z: 0 }, vertical: 0 }, 0);
  }

  it('starts at full health, not destroyed, not smoking', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    expect(vehicle.getHealth().current).toBe(100);
    expect(vehicle.isDestroyed()).toBe(false);
    expect(vehicle.isSmoking()).toBe(false);
  });

  it('an abandoned airborne bike falls and crashes, taking damage', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    climb(40);
    const high = vehicle.getPosition().y;
    expect(high).toBeGreaterThan(3);
    fall(120);
    expect(vehicle.getPosition().y).toBeLessThan(high);
    expect(vehicle.getPosition().y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.groundRestHeight, 1);
    expect(vehicle.getHealth().current).toBeLessThan(100); // crash damage
  });

  it('setHealthState at critical HP makes it smoke', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setHealthState({ current: 20, max: 100 });
    expect(vehicle.isSmoking()).toBe(true);
  });

  it('setDestroyed wrecks the bike and blocks mounting', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setDestroyed(true);
    expect(vehicle.isDestroyed()).toBe(true);
    expect(vehicle.canEnter(new Vector3(0, 0, 0))).toBe(false);
    vehicle.enter();
    expect(vehicle.isOccupied()).toBe(false); // cannot mount a wreck
  });

  it('explodes (is destroyed) when a crash drops HP to zero', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setHealthState({ current: 5, max: 100 }); // already fragile
    climb(50);
    fall(160);
    expect(vehicle.isDestroyed()).toBe(true);
    expect(vehicle.getHealth().isDead()).toBe(true);
  });

  it('a destroyed bike does not simulate further', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setDestroyed(true);
    const before = vehicle.getPosition();
    vehicle.update(0.5, { axis: { x: 0, z: 1 }, vertical: -1 }, 0);
    expect(vehicle.getPosition().equals(before)).toBe(true);
  });
});
