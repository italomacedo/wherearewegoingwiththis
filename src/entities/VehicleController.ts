import {
  Scene, Vector3, Quaternion, TransformNode, AbstractMesh, MeshBuilder, StandardMaterial, Color3, Color4,
  ParticleSystem, Texture, PhysicsBody, PhysicsShapeBox, PhysicsMotionType,
} from '@babylonjs/core';
import { Health, HealthState } from '@entities/Health';

export interface VehicleConfig {
  thrust: number;          // (legacy flight) horizontal acceleration — unused by the car model
  maxSpeed: number;        // forward speed cap (units/s)
  ascendAccel: number;     // vertical acceleration from Space/Ctrl (units/s²)
  gravity: number;         // downward acceleration (units/s²)
  hoverLift: number;       // baseline lift while powered; == gravity → neutral hover
  drag: number;            // vertical drag coefficient (per second) while powered
  hoverHeight: number;     // minimum altitude while powered (engine on)
  groundRestHeight: number; // resting height when unpowered (sitting on the ground)
  maxAltitude: number;     // ceiling
  safeImpactSpeed: number; // crash speed (units/s) below which no damage
  damagePerSpeed: number;  // HP lost per unit of impact speed above the safe threshold
  // --- Car-driving model ---
  accel: number;           // forward acceleration from W (units/s²)
  brakeDecel: number;      // deceleration from S while moving forward (units/s²)
  reverseAccel: number;    // acceleration into reverse from S once stopped (units/s²)
  maxReverse: number;      // reverse speed cap (units/s)
  rollingResist: number;   // passive speed decay while coasting (units/s²)
  turnRate: number;        // steering yaw rate at full A/D (radians/s)
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
export const VEHICLE_MODEL_PATH = 'vehicles/flying_car_1_low_poly.glb';
/**
 * Uniform scale + Y-rotation applied to the loaded model. The GLB carries a 100×
 * scale baked into its node matrix (intrinsic size ≈ 250×522×125 u), so a tiny
 * factor here yields a sensible ≈3 × 6.3 × 1.5 m flying car.
 */
export const VEHICLE_MODEL_SCALE = 0.012;
export const VEHICLE_MODEL_YAW = 0; // flying_car_1_low_poly faces +Z (world forward) — tune if backwards
/** Windshield/glass opacity (the GLB authors the 'Glass' material at 0.78 — lower = clearer). */
export const WINDSHIELD_ALPHA = 0.32;
/** Driver seat position in the visual pivot's local space (calibrated via Adjust). */
export const DRIVER_SEAT_OFFSET = new Vector3(-0.54, -0.06, 0.36);
/** Driver seat facing (Y rotation, radians) so the avatar faces the car's front. */
export const DRIVER_SEAT_YAW = 0;
/** Driver seat forward pitch (X rotation, radians) — leans the seated body forward. */
export const DRIVER_SEAT_PITCH = -Math.PI / 12; // -15°

/** Flying car (Phase 9 MVP): car-like ground driving + Space/Ctrl flight. */
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
  accel: 18,
  brakeDecel: 24,
  reverseAccel: 10,
  maxReverse: 6,
  rollingResist: 8,
  turnRate: 1.8,
};

/** Driving input for the car model: throttle/brake/steer + vertical (flight). */
export interface VehicleDriveInput {
  accelerate: boolean; // W — accelerate forward
  brake: boolean;      // S — brake; once stopped, reverse
  steer: number;       // A/D — -1 (left) .. +1 (right)
  vertical: number;    // +1 ascend, -1 descend, 0 hold altitude
  engineOn?: boolean;  // false → abandoned (coast + free-fall). Default true.
}

export interface VehicleDriveState {
  position: Vector3;
  heading: number;   // car yaw (radians) — driven by the steering wheel
  speed: number;     // signed scalar along heading (forward +, reverse −)
  velocityY: number; // vertical velocity (flight)
}

export interface VehicleDriveResult extends VehicleDriveState {
  velocity: Vector3;   // derived world velocity (Havok body + airborne check)
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
  private state: VehicleDriveState;
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
  /**
   * The collision box's local extents + centre, measured ONCE from the model at
   * heading 0. The body sits on `root` (which never rotates — only `visualPivot`
   * yaws), so to keep the box aligned with the visible car at any heading we rotate
   * the SHAPE to the heading (see `orientCollider`) rather than the body.
   */
  private localBoxExt: Vector3 | null = null;
  private localBoxCenter: Vector3 | null = null;
  /** Heading the collision box is currently oriented to (NaN = needs orienting). */
  private colliderYaw = Number.NaN;
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
    this.state = { position: Vector3.Zero(), heading: 0, speed: 0, velocityY: 0 };
  }

  /**
   * Pure: advance the car kinematics (heading/speed/velocityY) for one step and
   * derive the world velocity — WITHOUT integrating position or clamping the
   * floor. Shared by `computeDriveStep` (kinematic: integrate + clamp) and the
   * dynamic Havok path (feeds the body, which integrates + resolves contacts).
   */
  private static stepKinematics(
    state: VehicleDriveState,
    input: VehicleDriveInput,
    dt: number,
    config: VehicleConfig,
  ): { heading: number; speed: number; velocityY: number; velocity: Vector3 } {
    const engineOn = input.engineOn !== false;
    let { heading, speed, velocityY } = state;

    if (engineOn) {
      // Steering (arcade): turns even at rest. Reverse inverts the wheel feel.
      const steerEffect = speed < -0.1 ? -input.steer : input.steer;
      heading += steerEffect * config.turnRate * dt;

      // Throttle / brake / reverse.
      if (input.accelerate && !input.brake) {
        speed = Math.min(config.maxSpeed, speed + config.accel * dt);
      } else if (input.brake && !input.accelerate) {
        speed = speed > 0.2
          ? Math.max(0, speed - config.brakeDecel * dt)               // braking
          : Math.max(-config.maxReverse, speed - config.reverseAccel * dt); // reversing
      } else {
        speed = VehicleController.coast(speed, config.rollingResist * dt);
      }

      // Vertical (flight): lift vs gravity + ascend input, drag while powered.
      velocityY += (config.hoverLift - config.gravity + input.vertical * config.ascendAccel) * dt;
      velocityY *= Math.max(0, 1 - config.drag * dt);
    } else {
      // Abandoned: coast to a stop, gravity pulls it down (it falls + crashes).
      speed = VehicleController.coast(speed, config.rollingResist * dt);
      velocityY -= config.gravity * dt;
    }

    // World velocity from heading + speed (+ vertical). heading 0 faces +Z; the
    // facing convention atan2(vx,vz) === heading is preserved.
    const velocity = new Vector3(Math.sin(heading) * speed, velocityY, Math.cos(heading) * speed);
    return { heading, speed, velocityY, velocity };
  }

  /**
   * Pure car-driving integration for one step. With the engine on: the steering
   * wheel (A/D) rotates `heading`, W/S drive `speed` along it (S brakes, then
   * reverses once stopped), and Space/Ctrl raise/lower altitude (it's a flying
   * car). With it off (abandoned): the car coasts to a stop and free-falls.
   * Altitude is clamped to [floor, ceiling] above the surface directly under the
   * car (`surfaceFloor`, so it hovers over / rests on rooftops), with a downward
   * floor crossing reported as a landing (impact speed → crash damage). X/Z are
   * confined to the playable area; hitting a wall zeroes forward speed.
   */
  static computeDriveStep(
    state: VehicleDriveState,
    input: VehicleDriveInput,
    dt: number,
    config: VehicleConfig = DEFAULT_VEHICLE_CONFIG,
    surfaceFloor = 0,
  ): VehicleDriveResult {
    const k = VehicleController.stepKinematics(state, input, dt, config);
    const { heading, velocity } = k;
    let { speed, velocityY } = k;
    const engineOn = input.engineOn !== false;
    const position = state.position.add(velocity.scale(dt));

    // Altitude clamp + landing detection.
    const floor = surfaceFloor + (engineOn ? config.hoverHeight : config.groundRestHeight);
    let landed = false;
    let impactSpeed = 0;
    if (position.y < floor) {
      if (velocityY < 0) { impactSpeed = -velocityY; landed = true; }
      position.y = floor;
      velocityY = 0;
      velocity.y = 0;
    } else if (position.y > config.maxAltitude) {
      position.y = config.maxAltitude;
      if (velocityY > 0) { velocityY = 0; velocity.y = 0; }
    }

    // Confine X/Z to the playable area; stop forward motion against a wall.
    if (VehicleController.clampHorizontal(position, config)) {
      speed = 0;
      velocity.x = 0;
      velocity.z = 0;
    }

    return { position, heading, speed, velocityY, velocity, landed, impactSpeed };
  }

  /** Decay a signed speed toward 0 by `amount` (rolling resistance / coasting). */
  private static coast(speed: number, amount: number): number {
    if (speed > 0) return Math.max(0, speed - amount);
    if (speed < 0) return Math.min(0, speed + amount);
    return 0;
  }

  /**
   * Clamp `position` X/Z to the closed playable area (out-of-bounds state was
   * crashing the game). Mutates `position`; returns true if a wall was hit.
   */
  private static clampHorizontal(position: Vector3, config: VehicleConfig): boolean {
    let hit = false;
    const b = config.horizontalBounds;
    if (b) {
      if (position.x > b.maxX) { position.x = b.maxX; hit = true; }
      else if (position.x < b.minX) { position.x = b.minX; hit = true; }
      if (position.z > b.maxZ) { position.z = b.maxZ; hit = true; }
      else if (position.z < b.minZ) { position.z = b.minZ; hit = true; }
    } else {
      const h = config.horizontalHalfExtent;
      if (Number.isFinite(h)) {
        if (position.x > h) { position.x = h; hit = true; }
        else if (position.x < -h) { position.x = -h; hit = true; }
        if (position.z > h) { position.z = h; hit = true; }
        else if (position.z < -h) { position.z = -h; hit = true; }
      }
    }
    return hit;
  }

  /**
   * Pure: effective max speed scaled by the Piloting skill (Phase 19C).
   * At pilotagem=50 the result equals baseMax exactly; at 10 it's 80%; at 100 it's 125%.
   * Formula: base × (0.75 + pilotagem / 200)
   */
  static effectiveMaxSpeed(baseMax: number, pilotagem: number): number {
    return baseMax * (0.75 + pilotagem / 200);
  }

  /** Update the Piloting skill value (called by the scene when player stats change). */
  setPilotagem(pilotagem: number): void {
    this.config = { ...this.config, maxSpeed: VehicleController.effectiveMaxSpeed(DEFAULT_VEHICLE_CONFIG.maxSpeed, pilotagem) };
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

  /**
   * Builds the placeholder bike and parks it (resting on the ground). An optional
   * `facing` (heading, radians) restores the parked orientation from a save; Y is
   * always the ground rest height (an abandoned nave settles on the surface below).
   */
  spawn(position: Vector3, facing = 0): void {
    this.buildPlaceholder();
    this.parts.forEach((m) => { if (!m.parent) m.parent = this.visualPivot; });
    this.state = {
      position: new Vector3(position.x, this.config.groundRestHeight, position.z),
      heading: facing,
      speed: 0,
      velocityY: 0,
    };
    this.facing = facing;
    this.visualPivot.rotation.y = facing - VEHICLE_MODEL_YAW;
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
      // Make the windshield clearer so the driver sees the road (the GLB's 'Glass'
      // material is authored alpha-blended at ~0.78). Lower its alpha in place.
      for (const m of meshes) {
        if (m.material && /glass/i.test(m.material.name)) {
          m.material.alpha = WINDSHIELD_ALPHA;
        }
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
   * Advance one frame. Drives while piloted, or coasts/falls while unpiloted (so
   * an abandoned hovering car rolls to a stop, falls and crashes).
   */
  update(dt: number, input: VehicleDriveInput): void {
    if (this.destroyed) return;
    /* istanbul ignore next — the dynamic Havok path is browser/Electron only */
    if (this.body) { this.updateDynamic(dt, input); return; }
    const engineOn = this.occupied;
    // Surface directly under the car (rooftop or street); flat ground headlessly.
    const surfaceY = this.floorProvider
      ? this.floorProvider(this.state.position.x, this.state.position.z)
      : 0;
    const restFloor = surfaceY + this.config.groundRestHeight;
    const airborne = this.state.position.y > restFloor + 1e-3;
    const movingVertically = Math.abs(this.state.velocityY) > 1e-4;
    const coasting = Math.abs(this.state.speed) > 1e-4;
    if (!engineOn && !airborne && !movingVertically && !coasting) return; // parked at rest

    const stepInput: VehicleDriveInput = engineOn
      ? { ...input, engineOn: true }
      : { accelerate: false, brake: false, steer: 0, vertical: 0, engineOn: false };

    const result = VehicleController.computeDriveStep(this.state, stepInput, dt, this.config, surfaceY);
    this.state = {
      position: result.position,
      heading: result.heading,
      speed: result.speed,
      velocityY: result.velocityY,
    };
    this.facing = result.heading;
    this.root.position = this.state.position.clone();
    // The car always points where the wheel is aimed (even at rest); the model is
    // yawed by VEHICLE_MODEL_YAW (it faces away by default), so compensate.
    this.root.rotation.y = result.heading - VEHICLE_MODEL_YAW;

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
    // Measure the model's footprint at heading 0 (unrotated). The box must match the
    // visible car at ANY heading, but the body sits on the never-rotating root, so we
    // store the local extents here and rotate the SHAPE to the heading (orientCollider).
    const savedYaw = this.visualPivot.rotation.y;
    this.visualPivot.rotation.y = 0;
    this.root.computeWorldMatrix(true);
    const { min, max } = this.root.getHierarchyBoundingVectors(true);
    this.visualPivot.rotation.y = savedYaw; // restore the visible orientation
    const ext = max.subtract(min);
    // Reject a degenerate OR non-finite bbox: a NaN/Infinity extent slips past
    // `< 0.05` (NaN < 0.05 is false) into a NaN Havok shape that ABORTS the process.
    if (![ext.x, ext.y, ext.z].every((v) => Number.isFinite(v) && v >= 0.05)) return;
    this.localBoxExt = ext;
    this.localBoxCenter = min.add(max).scale(0.5).subtract(this.root.getAbsolutePosition());
    const body = new PhysicsBody(this.root, PhysicsMotionType.DYNAMIC, false, this.scene);
    // Heavy mass so the hero's character controller barely nudges the parked nave
    // (the hero can't shove it around) — flight is unaffected since we set the body's
    // velocity directly each frame (mass-independent). inertia 0 → no tumble.
    body.setMassProperties({ mass: 400, inertia: Vector3.Zero() });
    body.setGravityFactor(0); // we apply gravity in the drive math (keeps the tuned feel)
    body.setLinearVelocity(Vector3.Zero());
    this.body = body;
    this.colliderYaw = Number.NaN;
    this.orientCollider(this.facing); // build the box aligned to the current heading
  }

  /**
   * Rotate the collision box to `yaw` so it stays aligned with the visible car
   * (the body sits on the never-rotating root). Swaps just the shape (keeps the
   * body + its velocity) — cheap enough to call as the car turns. No-op without a
   * body / measured extents (headless/tests).
   */
  /* istanbul ignore next — Havok physics is browser/Electron only; verified manually */
  private orientCollider(yaw: number): void {
    if (!this.body || !this.localBoxExt || !this.localBoxCenter) return;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const c = new Vector3(
      this.localBoxCenter.x * cos + this.localBoxCenter.z * sin,
      this.localBoxCenter.y,
      -this.localBoxCenter.x * sin + this.localBoxCenter.z * cos,
    );
    const shape = new PhysicsShapeBox(c, Quaternion.FromEulerAngles(0, yaw, 0), this.localBoxExt, this.scene);
    const old = this.bodyShape;
    this.bodyShape = shape;
    this.body.shape = shape;
    if (old) old.dispose();
    this.colliderYaw = yaw;
  }

  /**
   * Dynamic driving: feed the body the (tuned) car velocity each frame; Havok
   * integrates + resolves all contacts (no penetration → no crash; rests on roofs;
   * blocks the hero). Heading/speed are tracked on our state (the steering wheel is
   * authoritative, not the body's deflected velocity); the body's vertical velocity
   * seeds altitude so a real landing arrests the fall. We still clamp to the world
   * bounds / altitude ceiling and detect a hard landing from the arrested vy.
   */
  /* istanbul ignore next — Havok physics is browser/Electron only; verified manually */
  private updateDynamic(dt: number, input: VehicleDriveInput): void {
    const body = this.body!;
    const engineOn = this.occupied;
    const stepInput: VehicleDriveInput = engineOn
      ? { ...input, engineOn: true }
      : { accelerate: false, brake: false, steer: 0, vertical: 0, engineOn: false };
    const current = body.getLinearVelocity();

    // Hard-landing detection: was falling fast last frame, arrested this frame.
    if (this.vyPrev < -this.config.safeImpactSpeed && current.y > this.vyPrev * 0.4) {
      const impactSpeed = -this.vyPrev;
      this.lastImpactDamage = (impactSpeed - this.config.safeImpactSpeed) * this.config.damagePerSpeed;
      this.health.applyDamage(this.lastImpactDamage);
      this.reactToHealth();
    }
    this.vyPrev = current.y;

    // Seed velocityY from the body so a Havok-arrested fall (rooftop/ground) is seen
    // by the integration; heading/speed come from our own (steering) state.
    const driveState: VehicleDriveState = {
      position: this.root.position.clone(),
      heading: this.state.heading,
      speed: this.state.speed,
      velocityY: current.y,
    };
    const k = VehicleController.stepKinematics(driveState, stepInput, dt, this.config);
    const v = k.velocity;
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

    // Mirror Havok's authoritative transform + our steering state.
    this.state.position = this.root.position.clone();
    this.state.heading = k.heading;
    this.state.speed = k.speed;
    this.state.velocityY = v.y;
    this.facing = k.heading;

    // Point the car where the wheel is aimed (yaw the VISUAL, not the level body).
    this.visualPivot.rotation.y = k.heading - VEHICLE_MODEL_YAW;

    // Keep the collision box aligned with the visible car as it turns (it sits on
    // the level body, so the SHAPE is rotated). Only when the heading moved enough.
    const dYaw = Math.atan2(Math.sin(k.heading - this.colliderYaw), Math.cos(k.heading - this.colliderYaw));
    if (!Number.isFinite(this.colliderYaw) || Math.abs(dYaw) > 0.08) this.orientCollider(k.heading);
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
    this.state.speed = 0;
    this.state.velocityY = 0;
  }

  /** Leave the vehicle; it stays where it is (and will coast/fall if airborne). */
  exit(): void {
    this.occupied = false;
    this.state.speed = 0;
    this.state.velocityY = 0;
    // Re-align the collision box to the parked heading so the hero can't walk into
    // the body when the car was left turned (no-op headlessly / with no body).
    this.orientCollider(this.facing);
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
  /** Current forward speed (units/sec) — for the cockpit LCD readout. */
  getSpeed(): number { return this.state.speed; }
  /** Effective top speed (includes the Pilotagem skill bonus) — for the LCD gauge. */
  getMaxSpeed(): number { return this.config.maxSpeed; }
  /** Altitude ceiling — for the LCD gauge. */
  getMaxAltitude(): number { return this.config.maxAltitude; }
  getRoot(): TransformNode { return this.root; }
  /**
   * The visual pivot that yaws to the travel direction (the body/root stays level
   * under Havok). Parent a rider here so they turn WITH the car, not just translate.
   */
  getVisualRoot(): TransformNode { return this.visualPivot; }
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
    this.state.speed = 0;
    this.state.velocityY = 0;
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
