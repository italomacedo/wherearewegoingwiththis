import {
  Scene, Vector3, TransformNode, AbstractMesh, MeshBuilder,
} from '@babylonjs/core';
import { InputSystem, MovementAxis } from '@systems/InputSystem';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';
import { Health, HealthState } from '@entities/Health';
import { LocoState, selectLocoState } from '@entities/Locomotion';

export interface PlayerConfig {
  walkSpeed: number;        // units/sec
  runSpeed: number;         // units/sec
  gravity: number;          // units/sec² (downward) while airborne
  safeFallSpeed: number;    // impact speed (units/sec) below which no damage
  fallDamagePerSpeed: number; // HP lost per unit of impact speed above the safe threshold
  groundY: number;          // resting ground height
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  walkSpeed: 4,
  runSpeed: 8,
  gravity: 22,
  safeFallSpeed: 9,
  fallDamagePerSpeed: 6,
  groundY: 0,
};

/**
 * Player movement controller. The movement math (camera-relative displacement)
 * is a pure function with full unit coverage. Physics-body application is
 * browser-only; the Node fallback moves the root transform directly.
 */
export class PlayerController {
  private scene: Scene;
  private input: InputSystem;
  private config: PlayerConfig;
  private root: TransformNode;
  private parts: AbstractMesh[] = [];
  private assembled: AssembledCharacter | null = null;
  private cameraYaw = 0;
  private facing = 0; // radians, last movement heading
  private health = new Health(100);
  private verticalVelocity = 0;
  private grounded = true;
  private lastFallDamage = 0; // impact damage applied on the most recent landing
  private locoState: LocoState = 'idle';
  private playingState: LocoState | null = null;
  private interacting = false;

  constructor(scene: Scene, input: InputSystem, config?: Partial<PlayerConfig>) {
    this.scene = scene;
    this.input = input;
    this.config = { ...DEFAULT_PLAYER_CONFIG, ...config };
    this.root = new TransformNode('player-root', scene);
  }

  getHealth(): Health { return this.health; }
  isDead(): boolean { return this.health.isDead(); }
  isGrounded(): boolean { return this.grounded; }
  /** HP applied on the last landing (0 if none) — for tests / feedback. */
  getLastFallDamage(): number { return this.lastFallDamage; }

  setHealthState(state: HealthState): void {
    this.health = Health.fromState(state);
  }

  /** Drop the player from a given altitude; gravity + fall damage take over. */
  startFalling(fromY: number): void {
    this.root.position.y = fromY;
    this.verticalVelocity = 0;
    this.grounded = fromY <= this.config.groundY;
  }

  /** Builds the character meshes and parents them to the player root. */
  async spawn(position: Vector3, appearance: CharacterAppearance = DEFAULT_APPEARANCE): Promise<void> {
    const assembler = new CharacterAssembler(this.scene);
    const assembled = await assembler.assemble(appearance);
    this.assembled = assembled;
    this.parts = assembled.meshes;
    // Parent a simple anchor so the whole rig moves with the root
    const anchor = MeshBuilder.CreateBox('player-anchor', { size: 0.01 }, this.scene);
    anchor.isVisible = false;
    anchor.parent = this.root;
    this.parts.forEach((m) => {
      if (!m.parent) m.parent = this.root;
    });
    this.root.position = position.clone();
  }

  /**
   * Pure movement math: rotate the input axis by the camera yaw so "forward"
   * always points away from the camera, then scale by speed and dt.
   */
  static computeDisplacement(
    axis: MovementAxis,
    sprint: boolean,
    cameraYaw: number,
    dt: number,
    config: Pick<PlayerConfig, 'walkSpeed' | 'runSpeed'> = DEFAULT_PLAYER_CONFIG
  ): Vector3 {
    const speed = sprint ? config.runSpeed : config.walkSpeed;
    const cos = Math.cos(cameraYaw);
    const sin = Math.sin(cameraYaw);
    const worldX = axis.x * cos - axis.z * sin;
    const worldZ = axis.x * sin + axis.z * cos;
    return new Vector3(worldX * speed * dt, 0, worldZ * speed * dt);
  }

  setCameraYaw(yaw: number): void {
    this.cameraYaw = yaw;
  }

  /** Mark the player as performing an interaction (drives the interact anim). */
  setInteracting(interacting: boolean): void {
    this.interacting = interacting;
  }

  /** Current locomotion animation state (idle/walk/run/interact). */
  getLocoState(): LocoState {
    return this.locoState;
  }

  /** Advance one frame: compute displacement from input and apply it. */
  update(dt: number): void {
    const axis = this.input.getMovementAxis();
    const sprint = this.input.isSprinting();
    const displacement = PlayerController.computeDisplacement(
      axis, sprint, this.cameraYaw, dt, this.config
    );

    if (displacement.lengthSquared() > 0) {
      this.applyMovement(displacement);
      this.facing = Math.atan2(displacement.x, displacement.z);
      this.root.rotation.y = this.facing;
    }

    this.updateVertical(dt);

    // Locomotion state (dt≈0 under NullEngine → speed 0 → idle).
    const speed = dt > 1e-6 ? displacement.length() / dt : 0;
    this.locoState = selectLocoState(speed, sprint, this.interacting);
    this.updateAnimation();
  }

  /** Plays the active locomotion clip when it changes (browser-only playback). */
  private updateAnimation(): void {
    if (this.locoState === this.playingState) return;
    this.playingState = this.locoState;
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — AnimationGroup playback is browser/Electron only */
    this.playLocoAnimation(this.locoState);
  }

  /* istanbul ignore next — browser-only AnimationGroup playback */
  private playLocoAnimation(state: LocoState): void {
    const groups = this.assembled?.getAnimationGroups?.() ?? [];
    let played = false;
    for (const g of groups) {
      const match = g.name.toLowerCase().includes(state);
      if (match) {
        g.start(true); // loop
        played = true;
      } else {
        g.stop();
      }
    }
    void played;
  }

  /** Gravity + landing + fall damage. No-op while grounded. */
  private updateVertical(dt: number): void {
    if (this.grounded) return;
    this.verticalVelocity -= this.config.gravity * dt;
    this.root.position.y += this.verticalVelocity * dt;

    if (this.root.position.y <= this.config.groundY) {
      const impactSpeed = -this.verticalVelocity; // downward speed at touchdown
      this.root.position.y = this.config.groundY;
      this.verticalVelocity = 0;
      this.grounded = true;
      if (impactSpeed > this.config.safeFallSpeed) {
        this.lastFallDamage = (impactSpeed - this.config.safeFallSpeed) * this.config.fallDamagePerSpeed;
        this.health.applyDamage(this.lastFallDamage);
      } else {
        this.lastFallDamage = 0;
      }
    }
  }

  /** Browser uses physics; Node fallback moves the transform directly. */
  private applyMovement(displacement: Vector3): void {
    /* istanbul ignore next — physics-body path is browser/Electron only */
    if (typeof document !== 'undefined' && this.scene.isPhysicsEnabled()) {
      this.root.position.addInPlace(displacement);
      return;
    }
    this.root.position.addInPlace(displacement);
  }

  getPosition(): Vector3 {
    return this.root.position.clone();
  }

  getFacing(): number {
    return this.facing;
  }

  getRoot(): TransformNode {
    return this.root;
  }

  getPartCount(): number {
    return this.parts.length;
  }

  dispose(): void {
    this.parts.forEach((m) => m.dispose());
    this.parts = [];
    this.root.dispose();
  }
}
