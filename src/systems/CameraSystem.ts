import { Scene, ArcRotateCamera, Vector3, AbstractMesh, Scalar } from '@babylonjs/core';
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
  zoomMin: 10,
  zoomMax: 50,
  zoomDefault: 25,
  followDamping: 0.1,
};

/**
 * Isometric-style camera using ArcRotateCamera locked to a fixed elevation.
 * Follows a target mesh with damping. Q/E rotate the view in 45° snaps.
 */
export class CameraSystem {
  private camera: ArcRotateCamera;
  private config: CameraConfig;
  private target: AbstractMesh | null = null;
  private followPoint: Vector3;

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
  }

  getCamera(): ArcRotateCamera {
    return this.camera;
  }

  setTarget(mesh: AbstractMesh): void {
    this.target = mesh;
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

  /** Called each frame — smoothly follow the target. */
  update(): void {
    if (!this.target) return;
    const desired = this.target.position.add(new Vector3(0, 1, 0));
    this.followPoint = Vector3.Lerp(this.followPoint, desired, this.config.followDamping);
    this.camera.setTarget(this.followPoint.clone());
  }

  getConfig(): CameraConfig {
    return { ...this.config };
  }

  dispose(): void {
    this.camera.dispose();
    this.target = null;
  }

  private degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
