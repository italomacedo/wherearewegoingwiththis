import {
  Scene, ArcRotateCamera, Vector3, TransformNode, Scalar,
} from '@babylonjs/core';
import { SettingsService } from '@systems/SettingsService';

export interface CameraConfig {
  elevationDeg: number;   // 30–60, from settings
  rotationSnapDeg: number;
  zoomMin: number;
  zoomMax: number;
  zoomDefault: number;
  followDamping: number;  // 0..1 lerp factor per frame
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  elevationDeg: 45,
  rotationSnapDeg: 45,
  zoomMin: 6,
  zoomMax: 50,
  zoomDefault: 9, // tight third-person framing on the hero (limits metagaming)
  followDamping: 0.1,
};

/** Radians of camera orbit per pixel of horizontal mouse drag. */
export const ORBIT_SENSITIVITY = 0.008;

/** Radians per second when orbiting with the keyboard (Z / C held). */
export const KEY_ORBIT_SPEED = 1.8;

/** Close radius used to frame the speaking NPC during a conversation. */
export const CONVERSATION_RADIUS = 7;

/**
 * Isometric-style camera using ArcRotateCamera locked to a fixed elevation.
 * Follows a target mesh with damping. Q/E rotate the view in 45° snaps.
 */
export class CameraSystem {
  private camera: ArcRotateCamera;
  private config: CameraConfig;
  private target: TransformNode | null = null;
  private followPoint: Vector3;
  private vehicleMode = false;
  private savedRadius = 0;
  private savedDamping = 0;
  private conversationMode = false;
  private convSavedRadius = 0;
  private convSavedTarget: TransformNode | null = null;
  private freeMode = false;
  /** When true, wheel zoom is allowed on foot (Adjust tool only). */
  private wheelZoomOverride = false;
  private freeSavedRadius = 0;
  private freeSavedTarget: TransformNode | null = null;
  private detachPointer: (() => void) | null = null;

  constructor(scene: Scene, config?: Partial<CameraConfig>) {
    this.config = {
      ...DEFAULT_CAMERA_CONFIG,
      elevationDeg: SettingsService.get('cameraAngleDeg'),
      ...config,
    };
    this.followPoint = new Vector3(0, 1, 0);

    const beta = this.degToRad(90 - this.config.elevationDeg);
    this.camera = new ArcRotateCamera(
      'iso-cam',
      -Math.PI / 2,
      beta,
      this.config.zoomDefault,
      this.followPoint.clone(),
      scene
    );
    this.camera.lowerRadiusLimit = this.config.zoomMin;
    this.camera.upperRadiusLimit = this.config.zoomMax;
    this.camera.lowerBetaLimit = this.degToRad(90 - 60);
    this.camera.upperBetaLimit = this.degToRad(90 - 30);
    scene.activeCamera = this.camera;

    // 360° orbit via middle-mouse drag (browser/Electron only).
    /* istanbul ignore next — pointer wiring needs a real DOM */
    if (typeof document !== 'undefined') {
      this.setupPointerControls(scene);
    }
  }

  getCamera(): ArcRotateCamera {
    return this.camera;
  }

  setTarget(node: TransformNode): void {
    this.target = node;
  }

  /**
   * Movement yaw (radians) for camera-relative WASD. ArcRotateCamera.alpha is
   * the orbit angle of the camera *position*; the direction it looks (and thus
   * "forward" for the player) is offset by +90°. Returning that offset lets the
   * pure rotation in PlayerController/VehicleController point W where the camera
   * faces, A/D to its sides, regardless of orbit.
   */
  getYaw(): number {
    return this.camera.alpha + Math.PI / 2;
  }

  /** Continuously orbit the view around the target (used by middle-mouse drag). */
  orbit(deltaRadians: number): void {
    this.camera.alpha += deltaRadians;
  }

  clearTarget(): void {
    this.target = null;
  }

  /** Rotate the view by one snap increment. dir = 1 (CW) or -1 (CCW). */
  rotate(dir: 1 | -1): void {
    this.camera.alpha += dir * this.degToRad(this.config.rotationSnapDeg);
  }

  /** Adjust zoom. delta < 0 zooms in, > 0 zooms out. */
  zoom(delta: number): void {
    const next = this.camera.radius + delta;
    this.camera.radius = Scalar.Clamp(next, this.config.zoomMin, this.config.zoomMax);
  }

  setElevation(deg: number): void {
    const clamped = Scalar.Clamp(deg, 30, 60);
    this.config.elevationDeg = clamped;
    this.camera.beta = this.degToRad(90 - clamped);
  }

  /**
   * Switch to vehicle framing: pull the camera further out and lower the follow
   * damping so it lags behind speed. Idempotent. Restored by exitVehicleMode().
   */
  enterVehicleMode(): void {
    if (this.vehicleMode) return;
    this.vehicleMode = true;
    this.savedRadius = this.camera.radius;
    this.savedDamping = this.config.followDamping;
    this.camera.radius = this.config.zoomMax;
    this.config.followDamping = Math.min(this.savedDamping, 0.06);
  }

  /** Restore on-foot framing. Idempotent. */
  exitVehicleMode(): void {
    if (!this.vehicleMode) return;
    this.vehicleMode = false;
    this.camera.radius = this.savedRadius;
    this.config.followDamping = this.savedDamping;
  }

  isVehicleMode(): boolean {
    return this.vehicleMode;
  }

  /**
   * Cinematic conversation framing: pull the camera in close and focus the
   * speaking NPC. Saves the current radius + follow target so exit can restore
   * the on-foot framing. Idempotent. The follow `update()` then smoothly pans
   * to the NPC (and back on exit) since followPoint lerps toward the target.
   */
  enterConversationMode(node: TransformNode, radius: number = CONVERSATION_RADIUS): void {
    if (this.conversationMode) return;
    this.conversationMode = true;
    this.convSavedRadius = this.camera.radius;
    this.convSavedTarget = this.target;
    this.camera.radius = Scalar.Clamp(radius, this.config.zoomMin, this.config.zoomMax);
    this.setTarget(node);
  }

  /** Restore on-foot framing (radius + previous follow target). Idempotent. */
  exitConversationMode(): void {
    if (!this.conversationMode) return;
    this.conversationMode = false;
    this.camera.radius = this.convSavedRadius;
    this.target = this.convSavedTarget;
    this.convSavedTarget = null;
  }

  /** Allow/deny mouse-wheel zoom on foot (used by the Adjust tool). */
  setWheelZoomEnabled(on: boolean): void { this.wheelZoomOverride = on; }

  isConversationMode(): boolean {
    return this.conversationMode;
  }

  /**
   * Free "RTS" camera for tactical combat: detach from the follow target so the
   * view stays where the player pans/orbits/zooms it (instead of re-centring on a
   * fighter each turn). Frames `focus` initially. Pan with panFree(), orbit with
   * rotate()/orbit(), zoom with zoom(). Idempotent; restored by exitFreeMode().
   */
  enterFreeMode(focus: Vector3, radius?: number): void {
    if (this.freeMode) return;
    this.freeMode = true;
    this.freeSavedRadius = this.camera.radius;
    this.freeSavedTarget = this.target;
    this.target = null; // detach follow — update() becomes a no-op
    this.followPoint.copyFrom(focus);
    this.camera.target.copyFrom(focus);
    if (radius !== undefined) this.camera.radius = Scalar.Clamp(radius, this.config.zoomMin, this.config.zoomMax);
  }

  /** Restore the previous follow target + radius. Idempotent. */
  exitFreeMode(): void {
    if (!this.freeMode) return;
    this.freeMode = false;
    this.camera.radius = this.freeSavedRadius;
    this.target = this.freeSavedTarget;
    this.freeSavedTarget = null;
  }

  isFreeMode(): boolean {
    return this.freeMode;
  }

  /**
   * Pan the free camera over the ground, camera-relative: `forward` slides the
   * view the way the camera faces, `right` to its right (both in metres). No-op
   * unless in free mode.
   */
  panFree(forward: number, right: number): void {
    if (!this.freeMode) return;
    // Use the camera's ACTUAL look direction (projected on the ground), so panning is
    // relative to wherever Z/C has orbited the view — not world axes.
    const dir = this.camera.getForwardRay().direction;
    const f = new Vector3(dir.x, 0, dir.z);
    if (f.lengthSquared() < 1e-8) return;
    f.normalize();
    const rx = f.z; // screen-right = forward rotated +90° on the ground (left-handed: +x right when looking +z)
    const rz = -f.x;
    this.camera.target.x += forward * f.x + right * rx;
    this.camera.target.z += forward * f.z + right * rz;
    this.followPoint.copyFrom(this.camera.target);
  }

  /** Called each frame — smoothly follow the target. */
  update(): void {
    if (!this.target) return;
    const desired = this.target.position.add(new Vector3(0, 1, 0));
    this.followPoint = Vector3.Lerp(this.followPoint, desired, this.config.followDamping);
    // Mutate the pivot in place. Using setTarget() here would call
    // rebuildAnglesAndRadius() and reset alpha/beta every frame — destroying the
    // middle-mouse orbit. copyFrom moves the focus while preserving the orbit.
    this.camera.target.copyFrom(this.followPoint);
  }

  getConfig(): CameraConfig {
    return { ...this.config };
  }

  dispose(): void {
    /* istanbul ignore next — pointer listeners only exist in browser */
    if (this.detachPointer) {
      this.detachPointer();
      this.detachPointer = null;
    }
    this.camera.dispose();
    this.target = null;
  }

  /**
   * Middle-mouse-drag orbit via native canvas listeners. We avoid Babylon's
   * scene.onPointerObservable because it only fires once a camera/scene
   * attachControl has run — the iso camera never attaches, so those events
   * never arrived. Native listeners on the canvas always fire.
   */
  /* istanbul ignore next — browser pointer wiring */
  private setupPointerControls(scene: Scene): void {
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) return;

    let dragging = false;
    const onDown = (e: MouseEvent): void => {
      if (e.button === 1) { dragging = true; e.preventDefault(); } // middle button
    };
    const onUp = (e: MouseEvent): void => {
      if (e.button === 1) dragging = false;
    };
    const onMove = (e: MouseEvent): void => {
      if (dragging) this.orbit((e.movementX || 0) * ORBIT_SENSITIVITY);
    };
    const onAux = (e: MouseEvent): void => {
      if (e.button === 1) e.preventDefault(); // suppress middle-click autoscroll
    };
    const onWheel = (e: WheelEvent): void => {
      // Wheel zoom in the free tactical-combat camera OR while the Adjust tool is open
      // (to inspect a held prop). On foot otherwise it's blocked (anti-metagaming).
      if (!this.freeMode && !this.wheelZoomOverride) return;
      this.zoom(Math.sign(e.deltaY) * 2);
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('auxclick', onAux);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    this.detachPointer = () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('auxclick', onAux);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }

  private degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
