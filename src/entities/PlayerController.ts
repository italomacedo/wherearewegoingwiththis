import {
  Scene, Vector3, TransformNode, AbstractMesh, MeshBuilder, AnimationGroup, Skeleton,
  PhysicsCharacterController, CharacterSupportedState,
} from '@babylonjs/core';
import { InputSystem, MovementAxis } from '@systems/InputSystem';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';
import { Health, HealthState } from '@entities/Health';
import { LocoState, selectLocoState } from '@entities/Locomotion';
import { computeLocoSpeedRatio } from '@assets/AvatarMeshCatalog';

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
  /** Previous-frame grounded state in the physics path (for fall-damage edge detection). */
  private wasGroundedPhys = true;
  private lastFallDamage = 0; // impact damage applied on the most recent landing
  private locoState: LocoState = 'idle';
  private playingState: LocoState | null = null;
  private idleOverride: string | null = null; // e.g. 'aim' while holding a flashlight
  private lastGroundSpeed = 0; // units/sec last frame — drives the clip speedRatio
  private interacting = false;
  /** Havok collide-and-slide controller (browser + physics only; null in tests). */
  private characterController: PhysicsCharacterController | null = null;
  private readonly capsuleHalf = 0.9; // capsule centre offset above the feet (root)
  private readonly downRef = new Vector3(0, -1, 0);

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

    // Start the idle clip immediately so the avatar doesn't sit in a stray
    // auto-played pose (e.g. a looping Death clip) until the first WASD input.
    this.playingState = null;
    this.updateAnimation();

    // When physics is live, drive the hero with a Havok character controller so it
    // collides with the world. Headless / no-physics keeps the kinematic path.
    if (typeof document !== 'undefined' && this.scene.isPhysicsEnabled()) {
      /* istanbul ignore next — Havok character controller is browser/Electron only */
      this.initPhysicsController(position);
    }
  }

  /**
   * Rebuild the avatar meshes from a new appearance in place (Phase 15: equipping
   * armor swaps an avatar region). Keeps the root + physics capsule + facing; only
   * the visible rig is replaced. The caller re-attaches held props after this
   * (the skeleton is new). Position/animation state are preserved.
   */
  async rebuildAppearance(appearance: CharacterAppearance): Promise<void> {
    const assembler = new CharacterAssembler(this.scene);
    const next = await assembler.assemble(appearance);
    // Dispose the old rig (meshes + clips) before adopting the new one.
    this.assembled?.dispose();
    this.assembled = next;
    this.parts = next.meshes;
    this.parts.forEach((m) => { if (!m.parent) m.parent = this.root; });
    this.playingState = null; // force the current loco clip to re-apply on the new rig
    this.updateAnimation();
  }

  /* istanbul ignore next — browser/Electron only */
  private initPhysicsController(position: Vector3): void {
    const start = new Vector3(position.x, position.y + this.capsuleHalf, position.z);
    this.characterController = new PhysicsCharacterController(
      start,
      { capsuleHeight: 1.6, capsuleRadius: 0.4 },
      this.scene
    );
  }

  /** True once a Havok character controller is driving the hero. */
  hasPhysicsController(): boolean {
    return this.characterController !== null;
  }

  /**
   * Teleport the hero to a ground position, moving the physics capsule too so it
   * doesn't snap back on the next frame (used to sync after a combat reposition).
   */
  teleport(pos: Vector3): void {
    this.root.position.copyFrom(pos);
    /* istanbul ignore next — physics capsule only exists in browser/Electron */
    if (this.characterController) {
      // No public setPosition on PhysicsCharacterController in this Babylon — recreate
      // the capsule at the new spot so it doesn't snap the hero back next frame.
      (this.characterController as unknown as { dispose?: () => void }).dispose?.();
      this.characterController = null;
      this.initPhysicsController(pos);
    }
  }

  /**
   * Pure: effective run speed scaled by the Athletics skill (Phase 19C).
   * At atletismo=50 the result equals baseRun exactly; at 10 it's 90%; at 100 it's 135%.
   * Formula: base × (0.85 + atletismo / 200)
   */
  static effectiveRunSpeed(baseRun: number, atletismo: number): number {
    return baseRun * (0.85 + atletismo / 200);
  }

  /** Update the Athletics skill value (called by the scene when player stats change). */
  setAtletismo(atletismo: number): void {
    this.config = { ...this.config, runSpeed: PlayerController.effectiveRunSpeed(DEFAULT_PLAYER_CONFIG.runSpeed, atletismo) };
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

    if (this.characterController) {
      /* istanbul ignore next — physics-driven movement is browser/Electron only */
      this.updatePhysicsMovement(displacement, dt);
    } else {
      if (displacement.lengthSquared() > 0) {
        this.applyMovement(displacement);
        this.facing = Math.atan2(displacement.x, displacement.z);
        this.root.rotation.y = this.facing;
      }
      this.updateVertical(dt);
    }

    // Locomotion state (dt≈0 under NullEngine → speed 0 → idle).
    const speed = dt > 1e-6 ? displacement.length() / dt : 0;
    this.lastGroundSpeed = speed;
    this.locoState = selectLocoState(speed, sprint, this.interacting);
    this.updateAnimation();
  }

  /**
   * Override the clip played while standing idle (e.g. the flashlight "aim" pose).
   * Pass null to restore the normal idle. Forces a re-evaluation next frame.
   */
  setIdleOverride(clip: string | null): void {
    if (this.idleOverride === clip) return;
    this.idleOverride = clip;
    this.playingState = null; // re-apply the (possibly idle) clip on the next update
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
    // Match the clip's cadence to the hero's ground speed so the feet stay planted.
    const ratio = computeLocoSpeedRatio(state, this.lastGroundSpeed);
    // While idle, a held tool (e.g. flashlight) can override the pose (aim).
    const matchKey = state === 'idle' && this.idleOverride ? this.idleOverride : state;
    for (const g of groups) {
      const match = g.name.toLowerCase().includes(matchKey);
      if (match) {
        g.speedRatio = ratio;
        g.start(true); // loop
      } else {
        g.stop();
      }
    }
  }

  /* istanbul ignore next — Havok character-controller step is browser/Electron only */
  private updatePhysicsMovement(displacement: Vector3, dt: number): void {
    if (dt <= 1e-6) return;
    const cc = this.characterController!;
    const support = cc.checkSupport(dt, this.downRef);
    const grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
    const current = cc.getVelocity();
    // Fall damage: on the airborne→grounded transition, charge HP for the downward
    // impact speed above the safe threshold (matches the kinematic updateVertical).
    const impactSpeed = -current.y; // positive while descending
    if (!this.wasGroundedPhys && grounded && impactSpeed > this.config.safeFallSpeed) {
      this.lastFallDamage = (impactSpeed - this.config.safeFallSpeed) * this.config.fallDamagePerSpeed;
      this.health.applyDamage(this.lastFallDamage);
    } else if (grounded) {
      this.lastFallDamage = 0;
    }
    this.wasGroundedPhys = grounded;
    const vy = grounded ? 0 : current.y - this.config.gravity * dt;
    cc.setVelocity(new Vector3(displacement.x / dt, vy, displacement.z / dt));
    cc.integrate(dt, support, new Vector3(0, -this.config.gravity, 0));
    const p = cc.getPosition();
    this.root.position.set(p.x, p.y - this.capsuleHalf, p.z);
    this.grounded = grounded;
    if (displacement.lengthSquared() > 0) {
      this.facing = Math.atan2(displacement.x, displacement.z);
      this.root.rotation.y = this.facing;
    }
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

  /** The hero's avatar AnimationGroups (idle/walk/run/interact + combat clips). */
  getAnimationGroups(): AnimationGroup[] {
    return this.assembled?.getAnimationGroups?.() ?? [];
  }

  /** The avatar skeleton (for bone-attaching held props) — null until spawned/headless. */
  getSkeleton(): Skeleton | null {
    return this.assembled?.getSkeleton?.() ?? null;
  }

  /** The skinned avatar meshes (a held prop attaches relative to one of these). */
  getRenderParts(): AbstractMesh[] {
    return this.parts;
  }

  getPartCount(): number {
    return this.parts.length;
  }

  dispose(): void {
    this.parts.forEach((m) => m.dispose());
    this.parts = [];
    /* istanbul ignore next — physics controller only exists in browser */
    if (this.characterController) {
      (this.characterController as unknown as { dispose?: () => void }).dispose?.();
      this.characterController = null;
    }
    this.root.dispose();
  }
}
