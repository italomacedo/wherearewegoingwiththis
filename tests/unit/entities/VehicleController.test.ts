import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  VehicleController, DEFAULT_VEHICLE_CONFIG, VehicleDriveInput, VehicleDriveState,
} from '../../../src/entities/VehicleController';

const zero = (): VehicleDriveState => ({ position: Vector3.Zero(), heading: 0, speed: 0, velocityY: 0 });
const drive = (o: Partial<VehicleDriveInput> = {}): VehicleDriveInput =>
  ({ accelerate: false, brake: false, steer: 0, vertical: 0, ...o });

describe('VehicleController.computeDriveStep (pure car model)', () => {
  it('W accelerates forward along the heading (heading 0 → +Z)', () => {
    const next = VehicleController.computeDriveStep(zero(), drive({ accelerate: true }), 0.1);
    expect(next.speed).toBeGreaterThan(0);
    expect(next.velocity.z).toBeGreaterThan(0);
    expect(next.position.z).toBeGreaterThan(0);
    expect(next.velocity.x).toBeCloseTo(0, 5);
  });

  it('A/D steer the heading (right = +, left = −) — and turn even at rest (arcade)', () => {
    const right = VehicleController.computeDriveStep(zero(), drive({ steer: 1 }), 0.1);
    const left = VehicleController.computeDriveStep(zero(), drive({ steer: -1 }), 0.1);
    expect(right.heading).toBeGreaterThan(0);
    expect(left.heading).toBeLessThan(0);
    // speed stayed at 0 — it steered while stationary.
    expect(right.speed).toBe(0);
  });

  it('reverse inverts the steering feel', () => {
    const reversing: VehicleDriveState = { ...zero(), speed: -2 };
    const next = VehicleController.computeDriveStep(reversing, drive({ steer: 1 }), 0.1);
    // While going backward, steer=right turns the heading the OTHER way.
    expect(next.heading).toBeLessThan(0);
  });

  it('S brakes while moving forward, then reverses once stopped', () => {
    const moving: VehicleDriveState = { ...zero(), speed: 5 };
    const braked = VehicleController.computeDriveStep(moving, drive({ brake: true }), 0.1);
    expect(braked.speed).toBeGreaterThan(0);
    expect(braked.speed).toBeLessThan(5); // decelerating

    const stopped: VehicleDriveState = { ...zero(), speed: 0.1 };
    const reversed = VehicleController.computeDriveStep(stopped, drive({ brake: true }), 0.1);
    expect(reversed.speed).toBeLessThan(0); // now backing up
    expect(reversed.position.z).toBeLessThan(0);
  });

  it('caps forward speed at maxSpeed and reverse at maxReverse', () => {
    const cfg = { ...DEFAULT_VEHICLE_CONFIG, accel: 500, reverseAccel: 500 };
    const fwd = VehicleController.computeDriveStep({ ...zero(), speed: 100 }, drive({ accelerate: true }), 0.1, cfg);
    expect(fwd.speed).toBeLessThanOrEqual(cfg.maxSpeed + 1e-6);
    const rev = VehicleController.computeDriveStep({ ...zero(), speed: -100 }, drive({ brake: true }), 0.1, cfg);
    expect(rev.speed).toBeGreaterThanOrEqual(-cfg.maxReverse - 1e-6);
  });

  it('coasts (rolling resistance) toward 0 with no throttle input', () => {
    const fwd = VehicleController.computeDriveStep({ ...zero(), speed: 5 }, drive(), 0.1);
    expect(fwd.speed).toBeLessThan(5);
    expect(fwd.speed).toBeGreaterThan(0);
    const rev = VehicleController.computeDriveStep({ ...zero(), speed: -5 }, drive(), 0.1);
    expect(rev.speed).toBeGreaterThan(-5);
    expect(rev.speed).toBeLessThan(0);
  });

  it('holds altitude at neutral vertical input (hover)', () => {
    const start: VehicleDriveState = { ...zero(), position: new Vector3(0, 10, 0) };
    const next = VehicleController.computeDriveStep(start, drive(), 0.5);
    expect(next.position.y).toBeCloseTo(10, 5);
    expect(next.velocityY).toBeCloseTo(0, 5);
  });

  it('ascend raises altitude, descend lowers it', () => {
    const start: VehicleDriveState = { ...zero(), position: new Vector3(0, 10, 0) };
    const up = VehicleController.computeDriveStep(start, drive({ vertical: 1 }), 0.2);
    const down = VehicleController.computeDriveStep(start, drive({ vertical: -1 }), 0.2);
    expect(up.position.y).toBeGreaterThan(10);
    expect(down.position.y).toBeLessThan(10);
  });

  it('clamps to the floor (hoverHeight) and reports a landing with impact speed', () => {
    const start: VehicleDriveState = {
      ...zero(), position: new Vector3(0, DEFAULT_VEHICLE_CONFIG.hoverHeight, 0), velocityY: -5,
    };
    const next = VehicleController.computeDriveStep(start, drive({ vertical: -1 }), 0.2);
    expect(next.position.y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.hoverHeight);
    expect(next.velocityY).toBe(0);
    expect(next.velocity.y).toBe(0);
    expect(next.landed).toBe(true);
    expect(next.impactSpeed).toBeGreaterThan(0);
  });

  it('clamps to the ceiling (maxAltitude) and kills upward velocity', () => {
    const start: VehicleDriveState = {
      ...zero(), position: new Vector3(0, DEFAULT_VEHICLE_CONFIG.maxAltitude, 0), velocityY: 5,
    };
    const next = VehicleController.computeDriveStep(start, drive({ vertical: 1 }), 0.2);
    expect(next.position.y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.maxAltitude);
    expect(next.velocityY).toBe(0);
  });

  it('rests on a raised surface (rooftop) at surfaceFloor + clearance, engine off', () => {
    const roof = 8;
    const start: VehicleDriveState = {
      ...zero(), position: new Vector3(0, roof + DEFAULT_VEHICLE_CONFIG.groundRestHeight, 0), velocityY: -5,
    };
    const next = VehicleController.computeDriveStep(
      start, drive({ engineOn: false }), 0.2, DEFAULT_VEHICLE_CONFIG, roof,
    );
    expect(next.position.y).toBeCloseTo(roof + DEFAULT_VEHICLE_CONFIG.groundRestHeight);
    expect(next.landed).toBe(true);
  });

  it('hovers above a rooftop at surfaceFloor + hoverHeight while powered', () => {
    const roof = 8;
    const start: VehicleDriveState = { ...zero(), position: new Vector3(0, roof + 0.2, 0), velocityY: -3 };
    const next = VehicleController.computeDriveStep(start, drive({ vertical: -1 }), 0.2, DEFAULT_VEHICLE_CONFIG, roof);
    expect(next.position.y).toBeCloseTo(roof + DEFAULT_VEHICLE_CONFIG.hoverHeight);
  });

  it('engine off: free-falls and coasts to a stop', () => {
    const start: VehicleDriveState = { ...zero(), position: new Vector3(0, 10, 0), speed: 5 };
    const next = VehicleController.computeDriveStep(start, drive({ engineOn: false }), 0.2);
    expect(next.velocityY).toBeLessThan(0);     // gravity
    expect(next.position.y).toBeLessThan(10);
    expect(next.speed).toBeLessThan(5);         // coasting
  });

  it('confines to an offset horizontalBounds box and zeroes speed at the wall', () => {
    const cfg = { ...DEFAULT_VEHICLE_CONFIG, horizontalBounds: { minX: -28, maxX: 1408, minZ: -28, maxZ: 1408 } };
    const far = VehicleController.computeDriveStep(
      { ...zero(), position: new Vector3(2000, 10, 2000), heading: Math.PI / 4, speed: 5 }, drive(), 0.1, cfg,
    );
    expect(far.position.x).toBe(1408);
    expect(far.position.z).toBe(1408);
    expect(far.speed).toBe(0);
    expect(far.velocity.x).toBe(0);
    expect(far.velocity.z).toBe(0);
    // A far interior corner is reachable (NOT clamped to ±30 around the origin).
    const inside = VehicleController.computeDriveStep(
      { ...zero(), position: new Vector3(900, 10, 600) }, drive(), 0.1, cfg,
    );
    expect(inside.position.x).toBeCloseTo(900);
    expect(inside.position.z).toBeCloseTo(600);
  });

  it('legacy symmetric horizontalHalfExtent clamps both axes', () => {
    const cfg = { ...DEFAULT_VEHICLE_CONFIG, horizontalHalfExtent: 30 };
    const pos = VehicleController.computeDriveStep(
      { ...zero(), position: new Vector3(-100, 10, 100), speed: 5 }, drive(), 0.1, cfg,
    );
    expect(pos.position.x).toBe(-30);
    expect(pos.position.z).toBe(30);
    expect(pos.speed).toBe(0);
  });

  it('does not confine when horizontalHalfExtent is Infinity (default)', () => {
    const next = VehicleController.computeDriveStep({ ...zero(), position: new Vector3(100, 5, 100) }, drive(), 0.1);
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
    expect(vehicle.getFacing()).toBe(0);
  });

  it('spawn restores a saved heading (facing) while keeping the ground rest height', () => {
    vehicle.spawn(new Vector3(5, 0, -7), 1.2);
    expect(vehicle.getFacing()).toBeCloseTo(1.2);
    expect(vehicle.getPosition().x).toBeCloseTo(5);
    expect(vehicle.getPosition().z).toBeCloseTo(-7);
    expect(vehicle.getPosition().y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.groundRestHeight);
  });

  it('update is a no-op while unoccupied and parked', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    const before = vehicle.getPosition();
    vehicle.update(0.5, drive({ accelerate: true }));
    expect(vehicle.getPosition().z).toBeCloseTo(before.z);
  });

  it('getSpeed reports the forward speed (0 at rest, rises when driving)', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    expect(vehicle.getSpeed()).toBe(0);
    vehicle.enter();
    vehicle.update(0.5, drive({ accelerate: true }));
    expect(vehicle.getSpeed()).toBeGreaterThan(0);
  });

  it('moves forward when occupied and accelerating', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    expect(vehicle.isOccupied()).toBe(true);
    for (let i = 0; i < 10; i++) vehicle.update(0.1, drive({ accelerate: true }));
    expect(vehicle.getPosition().z).toBeGreaterThan(0);
    expect(vehicle.getRoot().position.z).toBeCloseTo(vehicle.getPosition().z);
  });

  it('reverses when braking from a standstill', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    for (let i = 0; i < 10; i++) vehicle.update(0.1, drive({ brake: true }));
    expect(vehicle.getPosition().z).toBeLessThan(0);
  });

  it('steering changes facing even at rest', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    vehicle.update(0.1, drive({ steer: 1 }));
    expect(vehicle.getFacing()).not.toBe(0);
  });

  it('exit stops the vehicle and keeps it parked', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    vehicle.update(0.1, drive({ accelerate: true }));
    const parked = vehicle.getPosition();
    vehicle.exit();
    expect(vehicle.isOccupied()).toBe(false);
    vehicle.update(0.5, drive({ accelerate: true }));
    expect(vehicle.getPosition().z).toBeCloseTo(parked.z);
  });

  it('canEnter is true within radius and false outside', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    expect(vehicle.canEnter(new Vector3(1, 0, 0))).toBe(true);
    expect(vehicle.canEnter(new Vector3(20, 0, 20))).toBe(false);
  });

  it('setPilotagem scales the forward speed cap', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.enter();
    vehicle.setPilotagem(100); // mastery → faster
    for (let i = 0; i < 80; i++) vehicle.update(0.1, drive({ accelerate: true }));
    const fast = vehicle.getPosition().z;
    expect(fast).toBeGreaterThan(0);
  });

  // ─── Health / crash / smoke / explosion ────────────────────────────────────

  function climb(steps: number): void {
    vehicle.enter();
    for (let i = 0; i < steps; i++) vehicle.update(0.1, drive({ vertical: 1 }));
  }
  function fall(steps: number): void {
    vehicle.exit();
    for (let i = 0; i < steps; i++) vehicle.update(0.1, drive());
  }

  it('starts at full health, not destroyed, not smoking', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    expect(vehicle.getHealth().current).toBe(100);
    expect(vehicle.isDestroyed()).toBe(false);
    expect(vehicle.isSmoking()).toBe(false);
  });

  it('an abandoned airborne car falls and crashes, taking damage', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    climb(40);
    const high = vehicle.getPosition().y;
    expect(high).toBeGreaterThan(3);
    fall(120);
    expect(vehicle.getPosition().y).toBeLessThan(high);
    expect(vehicle.getPosition().y).toBeCloseTo(DEFAULT_VEHICLE_CONFIG.groundRestHeight, 1);
    expect(vehicle.getHealth().current).toBeLessThan(100); // crash damage
  });

  it('an abandoned car rests on the surface from the floor provider (rooftop)', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setFloorProvider(() => 8); // a rooftop 8 units up under the car
    climb(40);
    fall(160);
    expect(vehicle.getPosition().y).toBeCloseTo(8 + DEFAULT_VEHICLE_CONFIG.groundRestHeight, 1);
    expect(vehicle.getPosition().y).toBeGreaterThan(DEFAULT_VEHICLE_CONFIG.groundRestHeight + 1);
  });

  it('setHealthState at critical HP makes it smoke', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setHealthState({ current: 20, max: 100 });
    expect(vehicle.isSmoking()).toBe(true);
  });

  it('setDestroyed wrecks the car and blocks mounting', () => {
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

  it('a destroyed car does not simulate further', () => {
    vehicle.spawn(new Vector3(0, 0, 0));
    vehicle.setDestroyed(true);
    const before = vehicle.getPosition();
    vehicle.update(0.5, drive({ accelerate: true, vertical: -1 }));
    expect(vehicle.getPosition().equals(before)).toBe(true);
  });
});

describe('VehicleController.effectiveMaxSpeed (Phase 19C)', () => {
  it('at pilotagem=50 returns the base max speed unchanged', () => {
    expect(VehicleController.effectiveMaxSpeed(14, 50)).toBeCloseTo(14);
  });
  it('at pilotagem=10 (untrained) returns 80% of base', () => {
    expect(VehicleController.effectiveMaxSpeed(14, 10)).toBeCloseTo(14 * 0.8);
  });
  it('at pilotagem=100 (mastery) returns 125% of base', () => {
    expect(VehicleController.effectiveMaxSpeed(14, 100)).toBeCloseTo(14 * 1.25);
  });
});
