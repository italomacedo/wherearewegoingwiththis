import { Engine, Color4 } from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { ZoneManager } from '@systems/ZoneManager';
import { CameraSystem } from '@systems/CameraSystem';
import { InputSystem } from '@systems/InputSystem';
import { PhysicsService } from '@systems/PhysicsService';
import { PlayerController } from '@entities/PlayerController';
import { MercadoSombrasZone } from '@entities/zones/MercadoSombrasZone';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';

export class GameWorldScene extends BaseScene {
  private zoneManager: ZoneManager | null = null;
  private cameraSystem: CameraSystem | null = null;
  private inputSystem: InputSystem | null = null;
  private physics: PhysicsService | null = null;
  private player: PlayerController | null = null;
  private detachInput: (() => void) | null = null;
  private startZoneId = 'mercado_sombras';
  private appearance: CharacterAppearance = DEFAULT_APPEARANCE;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.01, 0.03, 1);
  }

  /** Set the character appearance to spawn (from save or character creator). */
  setAppearance(appearance: CharacterAppearance): void {
    this.appearance = appearance;
  }

  async onEnter(): Promise<void> {
    this.physics = new PhysicsService();
    await this.physics.init(this.babylonScene);
    ServiceLocator.register('physics', this.physics);

    this.cameraSystem = new CameraSystem(this.babylonScene);
    ServiceLocator.register('cameraSystem', this.cameraSystem);

    this.inputSystem = new InputSystem();
    this.detachInput = this.inputSystem.attach();
    ServiceLocator.register('inputSystem', this.inputSystem);

    this.zoneManager = new ZoneManager();
    this.zoneManager.register('mercado_sombras', () => new MercadoSombrasZone());
    ServiceLocator.register('zoneManager', this.zoneManager);

    const zone = await this.zoneManager.loadZone(this.startZoneId, this.babylonScene);

    this.player = new PlayerController(this.babylonScene, this.inputSystem);
    await this.player.spawn(zone.getSpawnPoint(), this.appearance);
    ServiceLocator.register('player', this.player);

    this.cameraSystem.setTarget(this.player.getRoot());
  }

  async onExit(): Promise<void> {
    this.detachInput?.();
    this.player?.dispose();
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.player = null;
    this.zoneManager = null;
    this.cameraSystem = null;
    this.inputSystem = null;
    this.physics = null;
    this.detachInput = null;
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player'].forEach((k) =>
      ServiceLocator.unregister(k)
    );
  }

  update(): void {
    const dt = this.engine.getDeltaTime() / 1000;
    this.handleCameraInput();
    if (this.cameraSystem && this.player) {
      this.player.setCameraYaw(this.cameraSystem.getYaw());
    }
    this.player?.update(dt);
    this.cameraSystem?.update();
    this.inputSystem?.endFrame();
  }

  private handleCameraInput(): void {
    if (!this.inputSystem || !this.cameraSystem) return;
    if (this.inputSystem.wasJustPressed('camera.rotateLeft')) {
      this.cameraSystem.rotate(-1);
    }
    if (this.inputSystem.wasJustPressed('camera.rotateRight')) {
      this.cameraSystem.rotate(1);
    }
  }

  getZoneManager(): ZoneManager | null {
    return this.zoneManager;
  }

  getCameraSystem(): CameraSystem | null {
    return this.cameraSystem;
  }

  getPlayer(): PlayerController | null {
    return this.player;
  }

  getInputSystem(): InputSystem | null {
    return this.inputSystem;
  }
}
