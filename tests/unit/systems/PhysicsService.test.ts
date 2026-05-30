import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { PhysicsService } from '../../../src/systems/PhysicsService';

describe('PhysicsService', () => {
  let engine: NullEngine;
  let scene: Scene;
  let physics: PhysicsService;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    physics = new PhysicsService();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('starts disabled', () => {
    expect(physics.isEnabled()).toBe(false);
  });

  it('init returns false in Node.js (no WASM)', async () => {
    const result = await physics.init(scene);
    expect(result).toBe(false);
    expect(physics.isEnabled()).toBe(false);
  });

  it('default gravity is earth-like downward', () => {
    const g = physics.getGravity();
    expect(g.y).toBeCloseTo(-9.81, 2);
    expect(g.x).toBe(0);
    expect(g.z).toBe(0);
  });

  it('getGravity returns a copy', () => {
    const g1 = physics.getGravity();
    g1.y = 999;
    const g2 = physics.getGravity();
    expect(g2.y).toBeCloseTo(-9.81, 2);
  });

  it('setGravity updates gravity', () => {
    physics.setGravity(new Vector3(0, -3, 0));
    expect(physics.getGravity().y).toBe(-3);
  });

  it('setGravity stores a copy (not reference)', () => {
    const g = new Vector3(0, -5, 0);
    physics.setGravity(g);
    g.y = 100;
    expect(physics.getGravity().y).toBe(-5);
  });
});
