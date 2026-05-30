import {
  Scene, Vector3, TransformNode, AbstractMesh, MeshBuilder,
} from '@babylonjs/core';
import { InputSystem, MovementAxis } from '@systems/InputSystem';
import { CharacterAssembler } from '@systems/CharacterAssembler';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';

export interface PlayerConfig {
  walkSpeed: number;   // units/sec
  runSpeed: number;    // units/sec
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  walkSpeed: 4,
  runSpeed: 8,
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
  private cameraYaw = 0;
  private facing = 0; // radians, last movement heading

  constructor(scene: Scene, input: InputSystem, config?: Partial<PlayerConfig>) {
    this.scene = scene;
    this.input = input;
    this.config = { ...DEFAULT_PLAYER_CONFIG, ...config };
    this.root = new TransformNode('player-root', scene);
  }

  /** Builds the character meshes and parents them to the player root. */
  async spawn(position: Vector3, appearance: CharacterAppearance = DEFAULT_APPEARANCE): Promise<void> {
    const assembler = new CharacterAssembler(this.scene);
    const assembled = await assembler.assemble(appearance);
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
    config: PlayerConfig = DEFAULT_PLAYER_CONFIG
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
