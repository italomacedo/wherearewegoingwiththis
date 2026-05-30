import { Engine, Color4, MeshBuilder, Vector3 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { ZoneManager } from '@systems/ZoneManager';
import { CameraSystem } from '@systems/CameraSystem';
import { MercadoSombrasZone } from '@entities/zones/MercadoSombrasZone';

export class GameWorldScene extends BaseScene {
  private zoneManager: ZoneManager | null = null;
  private cameraSystem: CameraSystem | null = null;
  private startZoneId = 'mercado_sombras';

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.01, 0.03, 1);
  }

  async onEnter(): Promise<void> {
    this.cameraSystem = new CameraSystem(this.babylonScene);
    ServiceLocator.register('cameraSystem', this.cameraSystem);

    this.zoneManager = new ZoneManager();
    this.zoneManager.register('mercado_sombras', () => new MercadoSombrasZone());
    ServiceLocator.register('zoneManager', this.zoneManager);

    const zone = await this.zoneManager.loadZone(this.startZoneId, this.babylonScene);

    // Phase 7 replaces this with the actual player mesh
    const spawnMarker = MeshBuilder.CreateBox('spawn-marker', { size: 0.5 }, this.babylonScene);
    spawnMarker.position = zone.getSpawnPoint().add(new Vector3(0, 0.25, 0));
    this.cameraSystem.setTarget(spawnMarker);
  }

  async onExit(): Promise<void> {
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.zoneManager = null;
    this.cameraSystem = null;
    ServiceLocator.unregister('zoneManager');
    ServiceLocator.unregister('cameraSystem');
  }

  update(): void {
    this.cameraSystem?.update();
  }

  getZoneManager(): ZoneManager | null {
    return this.zoneManager;
  }

  getCameraSystem(): CameraSystem | null {
    return this.cameraSystem;
  }
}
