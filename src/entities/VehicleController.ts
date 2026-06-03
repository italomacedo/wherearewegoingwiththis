import {
  Scene, Vector3, TransformNode, AbstractMesh, MeshBuilder, StandardMaterial, Color3, Color4,
  ParticleSystem, Texture,
} from '@babylonjs/core';
import { MovementAxis } from '@systems/InputSystem';
import { Health, HealthState } from '@entities/Health';

export interface VehicleConfig {
  thrust: number;          // horizontal acceleration (units/s²) from WASD
  maxSpeed: number;        // horizontal speed cap (units/s)
  ascendAccel: number;     // vertical acceleration from Space/Ctrl (units/s²)
  gravity: number;         // downward acceleration (units/s²)
  hoverLift: number;       // baseline lift while powered; == gravity → neutral hover
  drag: number;            // linear drag coefficient (per second), opposes velocity
  hoverHeight: number;     // minimum altitude while powered (engine on)
  groundRestHeight: number; // resting height when unpowered (sitting on the ground)
  maxAltitude: number;     // ceiling
  safeImpactSpeed: number; // crash speed (units/s) below which no damage
  damagePerSpeed: number;  // HP lost per unit of impact speed above the safe threshold
  /** Half-extent (m) the nave is confined to on X/Z (the closed street). Infinity = unbounded. */
  horizontalHalfExtent: number;
}

/**
 * Relative path (under `public/assets/`) of the real vehicle model — a small
 * atmospheric "nave" (Quaternius Ultimate Spaceships, CC0). Loaded in Electron,
 * falls back to the procedural placeholder headlessly (and if the file is
 * missing). Large Spaceships models are reserved for interplanetary travel. See
 * gap #4 / Lesson 17.
 */
export const VEHICLE_MODEL_PATH = 'vehicles/nave.glb';
/** Uniform scale + Y-rotation applied to the loaded model to match the placeholder footprint. */
export const VEHICLE_MODEL_SCALE = 0.6;
export const VEHICLE_MODEL_YAW = Math.PI; // glTF exports tend to face away from our camera

/** Agile open-air flying motorcycle (Phase 9 MVP). */
export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  thrust: 18,
  maxSpeed: 14,
  ascendAccel: 10,
  gravity: 9.8,
  hoverLift: 9.8,
  drag: 2.0,
  hoverHeight: 1.2,
  groundRestHeight: 0.4,
  maxAltitude: 40,
  safeImpactSpeed: 6,
  damagePerSpeed: 8,
  horizontalHalfExtent: Infinity, // unbounded by default; the scene confines it to the street
};

export interface VehicleFlightInput {
  axis: MovementAxis; // horizontal steering (x = strafe, z = forward)
  vertical: number;   // +1 ascend, -1 descend, 0 hold altitude
  engineOn?: boolean; // false → no lift/thrust (gravity pulls it down). Default true.
}

export interface VehicleFlightState {
  position: Vector3;
  velocity: Vector3;
}

export interface VehicleFlightResult extends VehicleFlightState {
  landed: boolean;     // touched the floor this step
  impactSpeed: number; // downward speed at touchdown (0 if not landed)
}

/**
 * Flying vehicle controller using a simplified lift/drag flight model.
 *
 * The integration (thrust → velocity → drag → clamped position, with floor
 * depending on whether the engine is on) is a pure static function with full
 * unit coverage. When unpiloted the engine is off, so it falls and crashes —
 * taking impact damage; at critical HP it smokes, at zero HP it explodes.
 */
export class VehicleController {
  private scene: Scene;
  private config: VehicleConfig;
  private root: TransformNode;
  private parts: AbstractMesh[] = [];
  private state: VehicleFlightState;
  private occupied = false;
  private facing = 0;
  private health = new Health(100);
  private destroyed = false;
  private smoking = false;
  private lastImpactDamage = 0;

  constructor(scene: Scene, config?: Partial<VehicleConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_VEHICLE_CONFIG, ...config };
    this.root = new TransformNode('vehicle-root', scene);
    this.state = { position: Vector3.Zero(), velocity: Vector3.Zero() };
  }

  /**
   * Pure flight integration. With the engine on: camera-relative thrust + lift.
   * With it off: only gravity (the bike falls). Drag damps velocity, horizontal
   * speed is capped, altitude is clamped to [floor, ceiling] — floor is the
   * hover height while powered, the ground rest height while unpowered.
   */
  static computeFlightStep(
    state: VehicleFlightState,
    input: VehicleFlightInput,
    cameraYaw: number,
    dt: number,
    config: VehicleConfig = DEFAULT_VEHICLE_CONFIG
  ): VehicleFlightResult {
    const engineOn = input.engineOn !== false;
    const velocity = state.velocity.clone();

    if (engineOn) {
      const cos = Math.cos(cameraYaw);
      const sin = Math.sin(cameraYaw);
      const dirX = input.axis.x * cos - input.axis.z * sin;
      const dirZ = input.axis.x * sin + input.axis.z * cos;
      velocity.x += dirX * config.thrust * dt;
      velocity.z += dirZ * config.thrust * dt;
      velocity.y += (config.hoverLift - config.gravity + input.vertical * config.ascendAccel) * dt;
    } else {
      // No pilot: no lift, no thrust — gravity wins.
      velocity.y -= config.gravity * dt;
    }

    // Drag opposes motion (air resistance). Horizontal always; vertical only
    // while powered — an engine-off bike free-falls so crashes actually hurt.
    const dragFactor = Math.max(0, 1 - config.drag * dt);
    velocity.x *= dragFactor;
    velocity.z *= dragFactor;
    if (engineOn) velocity.y *= dragFactor;

    // Cap horizontal speed
    const horiz = Math.hypot(velocity.x, velocity.z);
    if (horiz > config.maxSpeed) {
      const s = config.maxSpeed / horiz;
      velocity.x *= s;
      velocity.z *= s;
    }

    // Integrate position
    const position = state.position.add(velocity.scale(dt));

    // Clamp altitude; detect a landing (downward crossing of the floor)
    const floor = engineOn ? config.hoverHeight : config.groundRestHeight;
    let landed = false;
    let impactSpeed = 0;
    if (position.y < floor) {
      if (velocity.y < 0) {
        impactSpeed = -velocity.y;
        landed = true;
      }
      position.y = floor;
      velocity.y = 0;
    } else if (position.y > config.maxAltitude) {
      position.y = config.maxAltitude;
      if (velocity.y > 0) velocity.y = 0;
    }

    // Confine to the closed street: clamp X/Z to the half-extent (stops the nave
    // from flying out of the playable area over the walls — out-of-bounds state
    // was crashing the game). Zero the velocity into the wall so it doesn't stick.
    const h = config.horizontalHalfExtent;
    if (Number.isFinite(h)) {
      if (position.x > h) { position.x = h; if (velocity.x > 0) velocity.x = 0; }
      else if (position.x < -h) { position.x = -h; if (velocity.x < 0) velocity.x = 0; }
      if (position.z > h) { position.z = h; if (velocity.z > 0) velocity.z = 0; }
      else if (position.z < -h) { position.z = -h; if (velocity.z < 0) velocity.z = 0; }
    }

    return { position, velocity, landed, impactSpeed };
  }

  /** Toggle real-GLB loading. Default true; tests/headless stay on placeholder. */
  static useGltf = true;
  static setUseGltf(enabled: boolean): void { VehicleController.useGltf = enabled; }
  /** True when SceneLoader is available (browser/Electron only). */
  static canLoadGltf(): boolean { return typeof document !== 'undefined'; }

  /** Builds the placeholder bike and parks it (resting on the ground). */
  spawn(position: Vector3): void {
    this.buildPlaceholder();
    this.parts.forEach((m) => { if (!m.parent) m.parent = this.root; });
    this.state = {
      position: new Vector3(position.x, this.config.groundRestHeight, position.z),
      velocity: Vector3.Zero(),
    };
    this.root.position = this.state.position.clone();

    // In Electron, swap the placeholder for the real model once it loads. If the
    // file is missing or the loader fails, the placeholder stays (graceful).
    if (VehicleController.useGltf && VehicleController.canLoadGltf()) {
      /* istanbul ignore next — browser/Electron only; verified manually */
      void this.loadModel();
    }
  }

  /* istanbul ignore next — browser/Electron only; exercised via manual verification */
  private async loadModel(): Promise<void> {
    const { SceneLoader } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF'); // registers the .glb/.gltf loader plugin
    /* eslint-disable no-console */
    try {
      const container = await SceneLoader.LoadAssetContainerAsync('/assets/', VEHICLE_MODEL_PATH, this.scene);
      if (this.destroyed) { container.dispose(); return; } // exploded while loading
      container.addAllToScene();

      // Drop the procedural placeholder now that the real model is in.
      this.parts.forEach((m) => m.dispose());
      this.parts = [];

      const meshes = container.meshes as AbstractMesh[];
      for (const m of meshes) { if (!m.parent) m.parent = this.root; }
      this.parts = meshes;

      const gltfRoot = meshes.find((m) => m.name === '__root__') ?? meshes[0];
      if (gltfRoot) {
        gltfRoot.addRotation(0, VEHICLE_MODEL_YAW, 0);
        gltfRoot.scaling = gltfRoot.scaling.scale(VEHICLE_MODEL_SCALE);
      }
      console.warn('[Vehicle] loaded model:', VEHICLE_MODEL_PATH, `(${meshes.length} meshes)`);
    } catch (err) {
      console.warn('[Vehicle] model load failed, keeping placeholder:', VEHICLE_MODEL_PATH, err);
    }
    /* eslint-enable no-console */
  }

  /**
   * Advance one frame. Simulates while piloted, or while airborne/moving even
   * when unpiloted (so an abandoned hovering bike falls and crashes).
   */
  update(dt: number, input: VehicleFlightInput, cameraYaw: number): void {
    if (this.destroyed) return;
    const engineOn = this.occupied;
    const restFloor = this.config.groundRestHeight;
    const airborne = this.state.position.y > restFloor + 1e-3;
    const movingVertically = Math.abs(this.state.velocity.y) > 1e-4;
    if (!engineOn && !airborne && !movingVertically) return; // parked at rest

    const stepInput: VehicleFlightInput = engineOn
      ? { axis: input.axis, vertical: input.vertical, engineOn: true }
      : { axis: { x: 0, z: 0 }, vertical: 0, engineOn: false };

    const result = VehicleController.computeFlightStep(
      this.state, stepInput, cameraYaw, dt, this.config
    );
    this.state = { position: result.position, velocity: result.velocity };
    this.root.position = this.state.position.clone();

    const horiz = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    if (horiz > 0.05) {
      this.facing = Math.atan2(this.state.velocity.x, this.state.velocity.z);
      // The model is yawed by VEHICLE_MODEL_YAW (it faces away by default); compensate
      // so the nose LEADS the travel direction instead of moonwalking backward.
      this.root.rotation.y = this.facing - VEHICLE_MODEL_YAW;
    }

    if (result.landed && result.impactSpeed > this.config.safeImpactSpeed) {
      this.lastImpactDamage = (result.impactSpeed - this.config.safeImpactSpeed) * this.config.damagePerSpeed;
      this.health.applyDamage(this.lastImpactDamage);
      this.reactToHealth();
    }
  }

  /** Smoke at critical HP, explode (destroy) at zero. */
  private reactToHealth(): void {
    if (this.health.isDead()) {
      this.explode();
    } else if (this.health.isCritical() && !this.smoking) {
      this.startSmoke();
    }
  }

  enter(): void {
    if (this.destroyed) return;
    this.occupied = true;
    this.state.velocity = Vector3.Zero();
  }

  /** Leave the vehicle; it stays where it is (and will fall if airborne). */
  exit(): void {
    this.occupied = false;
    this.state.velocity = Vector3.Zero();
  }

  isOccupied(): boolean { return this.occupied; }
  isDestroyed(): boolean { return this.destroyed; }
  isSmoking(): boolean { return this.smoking; }
  getHealth(): Health { return this.health; }
  getLastImpactDamage(): number { return this.lastImpactDamage; }

  setHealthState(state: HealthState): void {
    this.health = Health.fromState(state);
    this.smoking = false;
    if (this.health.isCritical()) this.startSmoke();
  }

  /** Restore a destroyed (exploded) bike from a save. */
  setDestroyed(destroyed: boolean): void {
    this.destroyed = destroyed;
    if (destroyed) {
      this.occupied = false;
      this.health.applyDamage(this.health.current);
    }
  }

  /** True when the player is close enough to mount (and the bike still works). */
  canEnter(playerPos: Vector3, radius = 3): boolean {
    return !this.destroyed && Vector3.Distance(playerPos, this.state.position) <= radius;
  }

  getPosition(): Vector3 { return this.state.position.clone(); }
  getFacing(): number { return this.facing; }
  getRoot(): TransformNode { return this.root; }
  getPartCount(): number { return this.parts.length; }

  private startSmoke(): void {
    this.smoking = true;
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — particle VFX is browser-only */
    this.startSmokeBrowser();
  }

  private explode(): void {
    this.destroyed = true;
    this.smoking = false;
    this.occupied = false;
    this.state.velocity = Vector3.Zero();
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — particle VFX is browser-only */
    this.explodeBrowser();
  }

  private buildPlaceholder(): void {
    const body = MeshBuilder.CreateBox('vehicle-body', { width: 0.5, height: 0.4, depth: 1.8 }, this.scene);
    body.position = new Vector3(0, 0, 0);
    const bodyMat = new StandardMaterial('vehicle-body-mat', this.scene);
    bodyMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
    bodyMat.emissiveColor = new Color3(0.6, 0.1, 0.5);
    body.material = bodyMat;
    this.parts.push(body);

    [-0.8, 0.8].forEach((z, i) => {
      const ring = MeshBuilder.CreateCylinder(
        `vehicle-thruster-${i}`, { diameter: 0.55, height: 0.12 }, this.scene
      );
      ring.rotation.x = Math.PI / 2;
      ring.position = new Vector3(0, -0.1, z);
      const ringMat = new StandardMaterial(`vehicle-thruster-mat-${i}`, this.scene);
      ringMat.emissiveColor = new Color3(0, 0.9, 0.8);
      ring.material = ringMat;
      this.parts.push(ring);
    });
  }

  /* istanbul ignore next — browser particle VFX */
  private startSmokeBrowser(): void {
    const smoke = new ParticleSystem(`vehicle-smoke-${this.root.uniqueId}`, 600, this.scene);
    smoke.particleTexture = new Texture(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', this.scene
    );
    smoke.emitter = this.parts[0] ?? this.state.position.clone();
    smoke.minEmitBox = new Vector3(-0.2, 0.2, -0.2);
    smoke.maxEmitBox = new Vector3(0.2, 0.4, 0.2);
    smoke.color1 = new Color4(0.3, 0.3, 0.3, 0.6);
    smoke.color2 = new Color4(0.1, 0.1, 0.1, 0.4);
    smoke.colorDead = new Color4(0, 0, 0, 0);
    smoke.minSize = 0.3;
    smoke.maxSize = 0.9;
    smoke.minLifeTime = 0.6;
    smoke.maxLifeTime = 1.4;
    smoke.emitRate = 80;
    smoke.direction1 = new Vector3(-0.4, 1.5, -0.4);
    smoke.direction2 = new Vector3(0.4, 2.5, 0.4);
    smoke.start();
  }

  /* istanbul ignore next — browser particle VFX */
  private explodeBrowser(): void {
    const boom = new ParticleSystem(`vehicle-boom-${this.root.uniqueId}`, 1200, this.scene);
    boom.particleTexture = new Texture(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', this.scene
    );
    boom.emitter = this.state.position.clone();
    boom.color1 = new Color4(1, 0.6, 0.1, 1);
    boom.color2 = new Color4(1, 0.2, 0, 1);
    boom.colorDead = new Color4(0.1, 0.1, 0.1, 0);
    boom.minSize = 0.4;
    boom.maxSize = 1.6;
    boom.minLifeTime = 0.3;
    boom.maxLifeTime = 0.8;
    boom.manualEmitCount = 600;
    boom.minEmitPower = 6;
    boom.maxEmitPower = 14;
    boom.createSphereEmitter(0.5);
    boom.disposeOnStop = true;
    boom.start();
    // Char the wreck.
    const wreck = this.parts[0];
    if (wreck && wreck.material instanceof StandardMaterial) {
      wreck.material.emissiveColor = new Color3(0.05, 0.02, 0.02);
      wreck.material.diffuseColor = new Color3(0.05, 0.05, 0.05);
    }
  }

  dispose(): void {
    this.parts.forEach((m) => m.dispose());
    this.parts = [];
    this.root.dispose();
  }
}
