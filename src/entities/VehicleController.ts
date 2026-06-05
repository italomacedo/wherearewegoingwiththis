import {
  Scene, Vector3, Quaternion, TransformNode, AbstractMesh, MeshBuilder, StandardMaterial, Color3, Color4,
  ParticleSystem, Texture, PhysicsBody, PhysicsShapeBox, PhysicsMotionType,
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
  /**
   * Axis-aligned X/Z confinement box (Fase 17 — the whole mosaic world, which is
   * offset, not centred at the origin). Takes precedence over `horizontalHalfExtent`.
   */
  horizontalBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
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
  /** Holds the visual nave meshes; yawed for facing so the physics body (root) needn't rotate. */
  private visualPivot: TransformNode;
  private parts: AbstractMesh[] = [];
  private state: VehicleFlightState;
  private occupied = false;
  private facing = 0;
  /**
   * Dynamic Havok body (browser/Electron). The nave is a real DYNAMIC rigid body so
   * it collides naturally — bumps buildings, lands/rests on rooftops, blocks the
   * hero — instead of a kinematic node that crashed Havok by penetrating statics.
   * Flight = we set its linear velocity from the (tuned) flight math each frame and
   * Havok integrates + resolves contacts. Gravity is OFF on the body (we apply it in
   * the math, preserving feel) and rotation is locked (inertia 0). Null headlessly →
   * the kinematic `computeFlightStep` path runs (tests).
   */
  private body: PhysicsBody | null = null;
  private bodyShape: PhysicsShapeBox | null = null;
  /** Previous body vertical velocity, to detect a hard landing (fall damage). */
  private vyPrev = 0;
  private health = new Health(100);
  private destroyed = false;
  private smoking = false;
  private lastImpactDamage = 0;
  /**
   * Optional probe for the world surface (Y) directly under the nave at (x,z) —
   * a downward raycast against the level geometry, injected by the scene. Lets
   * the nave hover over / land on rooftops. Null (headless/tests) → flat ground.
   */
  private floorProvider: ((x: number, z: number) => number) | null = null;

  constructor(scene: Scene, config?: Partial<VehicleConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_VEHICLE_CONFIG, ...config };
    this.root = new TransformNode('vehicle-root', scene);
    this.visualPivot = new TransformNode('vehicle-visual', scene);
    this.visualPivot.parent = this.root;
    this.state = { position: Vector3.Zero(), velocity: Vector3.Zero() };
  }

  /**
   * Pure: the nave's desired velocity for one step (camera-relative thrust + lift
   * while powered; gravity while off; drag; horizontal speed cap). Shared by the
   * kinematic `computeFlightStep` (integrates it into a position) and the dynamic
   * Havok path (feeds it to the rigid body, which integrates + resolves collisions).
   */
  static computeDesiredVelocity(
    currentVelocity: Vector3,
    input: VehicleFlightInput,
    cameraYaw: number,
    dt: number,
    config: VehicleConfig = DEFAULT_VEHICLE_CONFIG,
  ): Vector3 {
    const engineOn = input.engineOn !== false;
    const velocity = currentVelocity.clone();
    if (engineOn) {
      const cos = Math.cos(cameraYaw);
      const sin = Math.sin(cameraYaw);
      const dirX = input.axis.x * cos - input.axis.z * sin;
      const dirZ = input.axis.x * sin + input.axis.z * cos;
      velocity.x += dirX * config.thrust * dt;
      velocity.z += dirZ * config.thrust * dt;
      velocity.y += (config.hoverLift - config.gravity + input.vertical * config.ascendAccel) * dt;
    } else {
      velocity.y -= config.gravity * dt; // no pilot: gravity wins (it falls)
    }
    // Drag: horizontal always; vertical only while powered (engine-off free-fall).
    const dragFactor = Math.max(0, 1 - config.drag * dt);
    velocity.x *= dragFactor;
    velocity.z *= dragFactor;
    if (engineOn) velocity.y *= dragFactor;
    // Cap horizontal speed.
    const horiz = Math.hypot(velocity.x, velocity.z);
    if (horiz > config.maxSpeed) {
      const s = config.maxSpeed / horiz;
      velocity.x *= s;
      velocity.z *= s;
    }
    return velocity;
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
    config: VehicleConfig = DEFAULT_VEHICLE_CONFIG,
    surfaceFloor = 0
  ): VehicleFlightResult {
    const engineOn = input.engineOn !== false;
    const velocity = VehicleController.computeDesiredVelocity(state.velocity, input, cameraYaw, dt, config);

    // Integrate position
    const position = state.position.add(velocity.scale(dt));

    // Clamp altitude; detect a landing (downward crossing of the floor). The
    // floor sits relative to whatever surface is directly under the nave
    // (`surfaceFloor`, 0 = street level) so it can hover over / rest on a
    // rooftop instead of phasing through it. Powered → hover clearance; off →
    // ground rest clearance above that surface.
    const floor = surfaceFloor + (engineOn ? config.hoverHeight : config.groundRestHeight);
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
    const b = config.horizontalBounds;
    if (b) {
      if (position.x > b.maxX) { position.x = b.maxX; if (velocity.x > 0) velocity.x = 0; }
      else if (position.x < b.minX) { position.x = b.minX; if (velocity.x < 0) velocity.x = 0; }
      if (position.z > b.maxZ) { position.z = b.maxZ; if (velocity.z > 0) velocity.z = 0; }
      else if (position.z < b.minZ) { position.z = b.minZ; if (velocity.z < 0) velocity.z = 0; }
    } else {
      const h = config.horizontalHalfExtent;
      if (Number.isFinite(h)) {
        if (position.x > h) { position.x = h; if (velocity.x > 0) velocity.x = 0; }
        else if (position.x < -h) { position.x = -h; if (velocity.x < 0) velocity.x = 0; }
        if (position.z > h) { position.z = h; if (velocity.z > 0) velocity.z = 0; }
        else if (position.z < -h) { position.z = -h; if (velocity.z < 0) velocity.z = 0; }
      }
    }

    return { position, velocity, landed, impactSpeed };
  }

  /** Toggle real-GLB loading. Default true; tests/headless stay on placeholder. */
  static useGltf = true;
  static setUseGltf(enabled: boolean): void { VehicleController.useGltf = enabled; }
  /** True when SceneLoader is available (browser/Electron only). */
  static canLoadGltf(): boolean { return typeof document !== 'undefined'; }

  /**
   * Inject a surface-height probe `(x,z) → worldY` (the level geometry directly
   * under the nave). Enables hovering over / landing on rooftops. Pass null to
   * revert to flat ground. Browser-only (the probe raycasts the scene).
   */
  setFloorProvider(fn: ((x: number, z: number) => number) | null): void {
    this.floorProvider = fn;
  }

  /** Builds the placeholder bike and parks it (resting on the ground). */
  spawn(position: Vector3): void {
    this.buildPlaceholder();
    this.parts.forEach((m) => { if (!m.parent) m.parent = this.visualPivot; });
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
      for (const m of meshes) { if (!m.parent) m.parent = this.visualPivot; }
      this.parts = meshes;

      const gltfRoot = meshes.find((m) => m.name === '__root__') ?? meshes[0];
      if (gltfRoot) {
        gltfRoot.addRotation(0, VEHICLE_MODEL_YAW, 0);
        gltfRoot.scaling = gltfRoot.scaling.scale(VEHICLE_MODEL_SCALE);
      }
      // Re-fit the dynamic collision body to the real model's bounds (was sized to
      // the placeholder at spawn). No-op headlessly / if physics is off.
      if (this.body) this.enableDynamicPhysics();
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
    /* istanbul ignore next — the dynamic Havok path is browser/Electron only */
    if (this.body) { this.updateDynamic(dt, input, cameraYaw); return; }
    const engineOn = this.occupied;
    // Surface directly under the nave (rooftop or street); flat ground headlessly.
    const surfaceY = this.floorProvider
      ? this.floorProvider(this.state.position.x, this.state.position.z)
      : 0;
    const restFloor = surfaceY + this.config.groundRestHeight;
    const airborne = this.state.position.y > restFloor + 1e-3;
    const movingVertically = Math.abs(this.state.velocity.y) > 1e-4;
    if (!engineOn && !airborne && !movingVertically) return; // parked at rest

    const stepInput: VehicleFlightInput = engineOn
      ? { axis: input.axis, vertical: input.vertical, engineOn: true }
      : { axis: { x: 0, z: 0 }, vertical: 0, engineOn: false };

    const result = VehicleController.computeFlightStep(
      this.state, stepInput, cameraYaw, dt, this.config, surfaceY
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

  /**
   * Promote the nave to a DYNAMIC Havok rigid body so it collides naturally
   * (buildings, rooftops, the hero) without the kinematic-vs-static penetration that
   * crashed Havok. Sized to the nave's current bounds (re-fit when the model loads).
   * Gravity is OFF (we apply it in the flight math) and rotation is locked (inertia 0
   * → the visual yaws via visualPivot, the body stays level). Browser/Electron only.
   */
  /* istanbul ignore next — Havok physics is browser/Electron only; verified manually */
  enableDynamicPhysics(): void {
    if (!this.scene.isPhysicsEnabled()) return;
    if (this.body) { this.body.dispose(); this.body = null; }
    this.root.computeWorldMatrix(true);
    const { min, max } = this.root.getHierarchyBoundingVectors(true);
    const ext = max.subtract(min);
    // Reject a degenerate OR non-finite bbox: a NaN/Infinity extent slips past
    // `< 0.05` (NaN < 0.05 is false) into a NaN Havok shape that ABORTS the process.
    if (![ext.x, ext.y, ext.z].every((v) => Number.isFinite(v) && v >= 0.05)) return;
    const center = min.add(max).scale(0.5).subtract(this.root.getAbsolutePosition());
    this.bodyShape = new PhysicsShapeBox(center, Quaternion.Identity(), ext, this.scene);
    const body = new PhysicsBody(this.root, PhysicsMotionType.DYNAMIC, false, this.scene);
    body.shape = this.bodyShape;
    // Heavy mass so the hero's character controller barely nudges the parked nave
    // (the hero can't shove it around) — flight is unaffected since we set the body's
    // velocity directly each frame (mass-independent). inertia 0 → no tumble.
    body.setMassProperties({ mass: 400, inertia: Vector3.Zero() });
    body.setGravityFactor(0); // we apply gravity in computeDesiredVelocity (keeps the tuned feel)
    body.setLinearVelocity(Vector3.Zero());
    this.body = body;
  }

  /**
   * Dynamic flight: feed the body the (tuned) desired velocity each frame; Havok
   * integrates + resolves all contacts (no penetration → no crash; rests on roofs;
   * blocks the hero). We still clamp to the world bounds / altitude ceiling and
   * detect a hard landing from the arrested vertical velocity.
   */
  /* istanbul ignore next — Havok physics is browser/Electron only; verified manually */
  private updateDynamic(dt: number, input: VehicleFlightInput, cameraYaw: number): void {
    const body = this.body!;
    const engineOn = this.occupied;
    const stepInput: VehicleFlightInput = engineOn
      ? { axis: input.axis, vertical: input.vertical, engineOn: true }
      : { axis: { x: 0, z: 0 }, vertical: 0, engineOn: false };
    const current = body.getLinearVelocity();

    // Hard-landing detection: was falling fast last frame, arrested this frame.
    if (this.vyPrev < -this.config.safeImpactSpeed && current.y > this.vyPrev * 0.4) {
      const impactSpeed = -this.vyPrev;
      this.lastImpactDamage = (impactSpeed - this.config.safeImpactSpeed) * this.config.damagePerSpeed;
      this.health.applyDamage(this.lastImpactDamage);
      this.reactToHealth();
    }
    this.vyPrev = current.y;

    const v = VehicleController.computeDesiredVelocity(current, stepInput, cameraYaw, dt, this.config);
    // Altitude ceiling.
    if (this.root.position.y >= this.config.maxAltitude && v.y > 0) v.y = 0;
    // World bounds: zero any velocity heading further out of the playable area.
    const b = this.config.horizontalBounds;
    if (b) {
      if (this.root.position.x >= b.maxX && v.x > 0) v.x = 0;
      else if (this.root.position.x <= b.minX && v.x < 0) v.x = 0;
      if (this.root.position.z >= b.maxZ && v.z > 0) v.z = 0;
      else if (this.root.position.z <= b.minZ && v.z < 0) v.z = 0;
    }
    body.setLinearVelocity(v);
    body.setAngularVelocity(Vector3.Zero()); // belt-and-braces against any spin

    // Mirror Havok's authoritative transform into our state (camera/streaming/getPosition).
    this.state.position = this.root.position.clone();
    this.state.velocity = v;

    // Face the travel direction (yaw the VISUAL, not the body).
    const horiz = Math.hypot(v.x, v.z);
    if (horiz > 0.5) {
      this.facing = Math.atan2(v.x, v.z);
      this.visualPivot.rotation.y = this.facing - VEHICLE_MODEL_YAW;
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
    // The wreck stops being flight-controlled (update() early-returns); let Havok
    // gravity drop it so it doesn't freeze mid-air.
    /* istanbul ignore next — physics body only exists in browser/Electron */
    if (this.body) this.body.setGravityFactor(1);
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
    /* istanbul ignore next — physics body only exists in browser/Electron */
    if (this.body) { this.body.dispose(); this.body = null; this.bodyShape = null; }
    this.parts.forEach((m) => m.dispose());
    this.parts = [];
    this.visualPivot.dispose();
    this.root.dispose();
  }
}
