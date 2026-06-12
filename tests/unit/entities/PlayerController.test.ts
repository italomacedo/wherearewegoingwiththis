import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { PlayerController, DEFAULT_PLAYER_CONFIG } from '../../../src/entities/PlayerController';
import { InputSystem } from '../../../src/systems/InputSystem';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

describe('PlayerController', () => {
  let engine: NullEngine;
  let scene: Scene;
  let input: InputSystem;
  let player: PlayerController;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    input = new InputSystem();
    player = new PlayerController(scene, input);
  });

  afterEach(() => {
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('setIdleOverride is idempotent and safe to toggle', () => {
    expect(() => {
      player.setIdleOverride('aim');
      player.setIdleOverride('aim'); // no-op on repeat
      player.setIdleOverride(null);
    }).not.toThrow();
  });

  // ─── computeDisplacement (pure) ───────────────────────────────────────────

  it('zero axis yields zero displacement', () => {
    const d = PlayerController.computeDisplacement({ x: 0, z: 0 }, false, 0, 1);
    expect(d.x).toBe(0);
    expect(d.z).toBe(0);
  });

  it('forward with yaw 0 moves +z at walk speed', () => {
    const d = PlayerController.computeDisplacement({ x: 0, z: 1 }, false, 0, 1);
    expect(d.z).toBeCloseTo(DEFAULT_PLAYER_CONFIG.walkSpeed, 5);
    expect(d.x).toBeCloseTo(0, 5);
  });

  it('sprint uses run speed', () => {
    const d = PlayerController.computeDisplacement({ x: 0, z: 1 }, true, 0, 1);
    expect(d.z).toBeCloseTo(DEFAULT_PLAYER_CONFIG.runSpeed, 5);
  });

  it('dt scales displacement', () => {
    const half = PlayerController.computeDisplacement({ x: 0, z: 1 }, false, 0, 0.5);
    expect(half.z).toBeCloseTo(DEFAULT_PLAYER_CONFIG.walkSpeed * 0.5, 5);
  });

  it('camera yaw rotates the movement direction', () => {
    // yaw = 90° (PI/2): forward (z+) should rotate toward +x
    const d = PlayerController.computeDisplacement({ x: 0, z: 1 }, false, Math.PI / 2, 1);
    expect(d.x).toBeCloseTo(-DEFAULT_PLAYER_CONFIG.walkSpeed, 4);
    expect(d.z).toBeCloseTo(0, 4);
  });

  it('right input with yaw 0 moves +x', () => {
    const d = PlayerController.computeDisplacement({ x: 1, z: 0 }, false, 0, 1);
    expect(d.x).toBeCloseTo(DEFAULT_PLAYER_CONFIG.walkSpeed, 5);
  });

  it('custom config speeds are respected', () => {
    const d = PlayerController.computeDisplacement(
      { x: 0, z: 1 }, false, 0, 1, { walkSpeed: 10, runSpeed: 20 }
    );
    expect(d.z).toBeCloseTo(10, 5);
  });

  it('y displacement is always 0 (ground movement)', () => {
    const d = PlayerController.computeDisplacement({ x: 1, z: 1 }, true, 1.2, 0.3);
    expect(d.y).toBe(0);
  });

  // ─── spawn ────────────────────────────────────────────────────────────────

  it('spawn places player at the given position', async () => {
    await player.spawn(new Vector3(5, 0, 3), DEFAULT_APPEARANCE);
    expect(player.getPosition().x).toBe(5);
    expect(player.getPosition().z).toBe(3);
  });

  it('spawn builds character parts', async () => {
    await player.spawn(new Vector3(0, 0, 0), DEFAULT_APPEARANCE);
    expect(player.getPartCount()).toBeGreaterThan(0);
  });

  it('spawn uses default appearance when omitted', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    expect(player.getPartCount()).toBeGreaterThan(0);
  });

  it('rebuildAppearance replaces the rig in place, keeping position', async () => {
    await player.spawn(new Vector3(2, 0, 4), DEFAULT_APPEARANCE);
    expect(player.getPartCount()).toBeGreaterThan(0);
    await player.rebuildAppearance({ ...DEFAULT_APPEARANCE, bodyBase: 'suit' });
    expect(player.getPartCount()).toBeGreaterThan(0);
    expect(player.getPosition().x).toBe(2);
    expect(player.getPosition().z).toBe(4);
  });

  // ─── update ─────────────────────────────────────────────────────────────

  it('update with no input does not move the player', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    const before = player.getPosition();
    player.update(1);
    expect(player.getPosition().equals(before)).toBe(true);
  });

  it('update with forward input moves the player +z', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    player.update(1);
    expect(player.getPosition().z).toBeGreaterThan(0);
  });

  it('update sets facing based on movement direction', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyD'); // move +x
    player.update(1);
    // facing = atan2(x, z) = atan2(positive, 0) = PI/2
    expect(player.getFacing()).toBeCloseTo(Math.PI / 2, 4);
  });

  it('update respects camera yaw set via setCameraYaw', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.setCameraYaw(Math.PI / 2);
    input.handleKeyDown('KeyW'); // forward, but rotated by yaw
    player.update(1);
    expect(player.getPosition().x).toBeLessThan(0);
  });

  it('sprint makes the player move faster', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    input.handleKeyDown('ShiftLeft');
    player.update(1);
    expect(player.getPosition().z).toBeCloseTo(DEFAULT_PLAYER_CONFIG.runSpeed, 4);
  });

  // ─── locomotion state ──────────────────────────────────────────────────────

  it('defaults to idle locomotion', () => {
    expect(player.getLocoState()).toBe('idle');
  });

  it('update with no input stays idle', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.update(1);
    expect(player.getLocoState()).toBe('idle');
  });

  it('walking when moving without sprint', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    player.update(1);
    expect(player.getLocoState()).toBe('walk');
  });

  it('running when moving with sprint', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    input.handleKeyDown('ShiftLeft');
    player.update(1);
    expect(player.getLocoState()).toBe('run');
  });

  it('interacting overrides movement', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    player.setInteracting(true);
    player.update(1);
    expect(player.getLocoState()).toBe('interact');
  });

  it('dt≈0 keeps the player idle (NullEngine guard)', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    player.update(0);
    expect(player.getLocoState()).toBe('idle');
  });

  it('animation state change is idempotent across frames', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    player.update(1);
    player.update(1); // same state — exercises the no-change early return
    expect(player.getLocoState()).toBe('walk');
  });

  // ─── getters / dispose ────────────────────────────────────────────────────

  it('getRoot returns the root transform node', () => {
    expect(player.getRoot()).toBeDefined();
    expect(player.getRoot().name).toBe('player-root');
  });

  it('getPosition returns a copy', async () => {
    await player.spawn(new Vector3(1, 0, 1));
    const p = player.getPosition();
    p.x = 999;
    expect(player.getPosition().x).toBe(1);
  });

  it('dispose cleans up parts and root', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    expect(() => player.dispose()).not.toThrow();
    expect(player.getPartCount()).toBe(0);
  });

  it('DEFAULT_PLAYER_CONFIG: run is faster than walk', () => {
    expect(DEFAULT_PLAYER_CONFIG.runSpeed).toBeGreaterThan(DEFAULT_PLAYER_CONFIG.walkSpeed);
  });

  // ─── Gravity + fall damage ─────────────────────────────────────────────────

  it('starts grounded at full health', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    expect(player.isGrounded()).toBe(true);
    expect(player.getHealth().current).toBe(100);
  });

  function fallUntilGrounded(p: PlayerController): void {
    for (let i = 0; i < 400 && !p.isGrounded(); i++) p.update(0.05);
  }

  it('a short drop deals no fall damage', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.startFalling(1);
    fallUntilGrounded(player);
    expect(player.isGrounded()).toBe(true);
    expect(player.getHealth().current).toBe(100);
    expect(player.getLastFallDamage()).toBe(0);
  });

  it('a high drop deals fall damage and lands the player', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.startFalling(30);
    fallUntilGrounded(player);
    expect(player.isGrounded()).toBe(true);
    expect(player.getPosition().y).toBeCloseTo(0, 4);
    expect(player.getHealth().current).toBeLessThan(100);
    expect(player.getLastFallDamage()).toBeGreaterThan(0);
  });

  it('a lethal fall kills the player', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.startFalling(80);
    fallUntilGrounded(player);
    expect(player.isDead()).toBe(true);
  });

  it('setHealthState applies persisted HP', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.setHealthState({ current: 42, max: 100 });
    expect(player.getHealth().current).toBe(42);
  });

  it('startFalling at ground level stays grounded', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.startFalling(0);
    expect(player.isGrounded()).toBe(true);
  });
});

describe('PlayerController stamina (status-bar phase)', () => {
  let engine: NullEngine;
  let scene: Scene;
  let input: InputSystem;
  let player: PlayerController;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    input = new InputSystem();
    player = new PlayerController(scene, input);
  });

  afterEach(() => {
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('sprinting drains stamina and exhaustion gates sprint back to walk speed', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    input.handleKeyDown('KeyW');
    input.handleKeyDown('ShiftLeft');
    player.update(1);
    expect(player.isSprintActive()).toBe(true);
    expect(player.getStamina().current).toBeLessThan(player.getStamina().max);
    // Burn through the whole reserve.
    for (let i = 0; i < 20 && player.getStamina().canSprint(); i++) player.update(1);
    expect(player.getStamina().isExhausted()).toBe(true);
    const before = player.getPosition().z;
    player.update(1);
    expect(player.isSprintActive()).toBe(false);
    expect(player.getLocoState()).toBe('walk');
    expect(player.getPosition().z - before).toBeCloseTo(DEFAULT_PLAYER_CONFIG.walkSpeed, 3);
  });

  it('stamina regenerates while idle (sprint key held but not moving = no drain)', async () => {
    await player.spawn(new Vector3(0, 0, 0));
    player.setStaminaState({ current: 50, max: 100 });
    input.handleKeyDown('ShiftLeft'); // sprint held, no movement
    player.update(1);
    expect(player.getStamina().current).toBeGreaterThan(50);
  });

  it('setAtletismo rescales the stamina reserve preserving the fraction', async () => {
    player.setStaminaState({ current: 50, max: 100 });
    player.setAtletismo(100);
    expect(player.getStamina().max).toBeCloseTo(135);
    expect(player.getStamina().fraction()).toBeCloseTo(0.5);
  });

  it('get/setStaminaState round-trips for persistence', () => {
    player.setStaminaState({ current: 33, max: 110 });
    expect(player.getStaminaState()).toEqual({ current: 33, max: 110 });
  });
});

describe('PlayerController.effectiveRunSpeed (Phase 19C)', () => {
  it('at atletismo=30 (neutral) returns the base run speed unchanged', () => {
    expect(PlayerController.effectiveRunSpeed(8, 30)).toBeCloseTo(8);
  });
  it('at atletismo=10 (untrained default) returns 90% of base', () => {
    expect(PlayerController.effectiveRunSpeed(8, 10)).toBeCloseTo(8 * 0.9);
  });
  it('at atletismo=100 (mastery) returns 135% of base', () => {
    expect(PlayerController.effectiveRunSpeed(8, 100)).toBeCloseTo(8 * 1.35);
  });
});
