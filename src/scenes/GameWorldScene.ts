import {
  Engine, Color4, Color3, Vector3, MeshBuilder, StandardMaterial, AbstractMesh,
} from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { ZoneManager } from '@systems/ZoneManager';
import { CameraSystem } from '@systems/CameraSystem';
import { InputSystem } from '@systems/InputSystem';
import { PhysicsService } from '@systems/PhysicsService';
import { PlayerController } from '@entities/PlayerController';
import { MercadoSombrasZone } from '@entities/zones/MercadoSombrasZone';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';
import { NPCManager, NPCMemoryMap } from '@systems/NPCManager';
import { ClaudeNPCService, ClaudeBridge } from '@systems/ClaudeNPCService';
import { DialogSystem } from '@systems/DialogSystem';
import { createZara } from '@entities/npcs/zara';
import { PlayerAction } from '@entities/NPCAgent';
import { WorldSnapshot } from '@systems/npc/PromptBuilder';
import { SettingsService } from '@systems/SettingsService';

export class GameWorldScene extends BaseScene {
  private zoneManager: ZoneManager | null = null;
  private cameraSystem: CameraSystem | null = null;
  private inputSystem: InputSystem | null = null;
  private physics: PhysicsService | null = null;
  private player: PlayerController | null = null;
  private npcManager: NPCManager | null = null;
  private injectedService: ClaudeNPCService | null = null;
  private dialog: DialogSystem | null = null;
  private npcMeshes: AbstractMesh[] = [];
  private detachInput: (() => void) | null = null;
  private startZoneId = 'mercado_sombras';
  private appearance: CharacterAppearance = DEFAULT_APPEARANCE;
  private npcMemory: NPCMemoryMap = {};
  private playerName = 'Operative';
  private gameTimeSeconds = 0;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.01, 0.03, 1);
  }

  setAppearance(appearance: CharacterAppearance): void {
    this.appearance = appearance;
  }

  setNpcMemory(memory: NPCMemoryMap): void {
    this.npcMemory = memory;
  }

  setPlayerName(name: string): void {
    this.playerName = name;
  }

  async onEnter(): Promise<void> {
    // Camera FIRST — guarantees the scene always has an active camera so it
    // renders even if a later async step (physics WASM, asset load) is slow.
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

    this.setupNPCs();
    this.dialog = new DialogSystem(this.babylonScene);
    this.wireDialog();

    // Physics LAST and resilient — Havok WASM load failure must never block
    // the world from rendering. PlayerController falls back to direct movement.
    this.physics = new PhysicsService();
    ServiceLocator.register('physics', this.physics);
    try {
      await this.physics.init(this.babylonScene);
    } catch {
      // ignore — movement falls back to non-physics path
    }
  }

  async onExit(): Promise<void> {
    this.detachInput?.();
    this.player?.dispose();
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.npcManager?.dispose();
    this.dialog?.dispose();
    this.npcMeshes.forEach((m) => m.dispose());
    this.npcMeshes = [];
    this.player = null;
    this.zoneManager = null;
    this.cameraSystem = null;
    this.inputSystem = null;
    this.physics = null;
    this.npcManager = null;
    this.dialog = null;
    this.detachInput = null;
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player', 'npcManager'].forEach((k) =>
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
    this.updateNPCs(dt);
    this.handleInteractInput();
    this.inputSystem?.endFrame();
    this.gameTimeSeconds += dt;
  }

  // ─── NPCs ──────────────────────────────────────────────────────────────────

  /** Injectable Claude service (used by tests / future runtime wiring). */
  setClaudeService(service: ClaudeNPCService): void {
    this.injectedService = service;
  }

  private setupNPCs(): void {
    const service = this.injectedService ?? this.createClaudeService();
    this.npcManager = new NPCManager(service);
    ServiceLocator.register('npcManager', this.npcManager);

    const zara = createZara();
    const conversation = NPCManager.restoreConversation(this.npcMemory, zara.id);
    this.npcManager.spawn(zara, conversation);
    this.npcMeshes.push(this.buildNPCMesh(zara.id, zara.position));
  }

  /** Builds a ClaudeNPCService when running in Electron; null otherwise. */
  private createClaudeService(): ClaudeNPCService | null {
    /* istanbul ignore next — Electron-only branch */
    if (typeof window !== 'undefined' && window.electronAPI) {
      return new ClaudeNPCService({
        claudePath: SettingsService.get('claudeCliPath'),
        bridge: window.electronAPI as unknown as ClaudeBridge,
      });
    }
    return null;
  }

  private buildNPCMesh(id: string, position: [number, number, number]): AbstractMesh {
    const body = MeshBuilder.CreateCapsule(`npc-${id}`, { height: 1.7, radius: 0.3 }, this.babylonScene);
    body.position = new Vector3(position[0], 0.85, position[2]);
    const mat = new StandardMaterial(`npc-mat-${id}`, this.babylonScene);
    mat.diffuseColor = new Color3(0.5, 0.2, 0.4);
    mat.emissiveColor = new Color3(0.2, 0.05, 0.15);
    body.material = mat;
    return body;
  }

  private updateNPCs(dt: number): void {
    if (!this.npcManager || !this.player) return;
    this.npcManager.update(this.player.getPosition(), this.derivePlayerAction(), dt);
  }

  /** Derives the perceived player action from current input. */
  derivePlayerAction(): PlayerAction {
    if (!this.inputSystem) return 'idle';
    const axis = this.inputSystem.getMovementAxis();
    const moving = axis.x !== 0 || axis.z !== 0;
    if (!moving) return 'idle';
    return this.inputSystem.isSprinting() ? 'running' : 'walking';
  }

  private handleInteractInput(): void {
    if (!this.inputSystem || !this.npcManager || !this.player || !this.dialog) return;
    if (!this.inputSystem.wasJustPressed('interact')) return;

    if (this.dialog.isOpen()) {
      this.dialog.close();
      return;
    }
    const agent = this.npcManager.getConversableAgent(this.player.getPosition());
    if (agent) {
      this.dialog.open(agent.definition.name);
    }
  }

  private wireDialog(): void {
    if (!this.dialog) return;
    this.dialog.onSubmit((message) => void this.sendToActiveNPC(message));
  }

  /** Builds the world snapshot and routes a message to the conversable NPC. */
  async sendToActiveNPC(message: string): Promise<void> {
    if (!this.npcManager || !this.player || !this.dialog) return;
    const agent = this.npcManager.getConversableAgent(this.player.getPosition());
    if (!agent) return;

    const world: WorldSnapshot = {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters: agent.distanceTo(this.player.getPosition()),
      playerAction: this.derivePlayerAction(),
      recentEvents: [],
    };

    this.dialog.setThinking(true);
    try {
      await this.npcManager.sendMessage(agent.definition.id, world, message, (chunk) =>
        this.dialog?.appendChunk(chunk)
      );
    } catch {
      this.dialog.setNpcText('...');
    }
  }

  private formatGameTime(): string {
    const totalMinutes = Math.floor(this.gameTimeSeconds / 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}, day 1`;
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

  // ─── Getters ────────────────────────────────────────────────────────────────

  getZoneManager(): ZoneManager | null { return this.zoneManager; }
  getCameraSystem(): CameraSystem | null { return this.cameraSystem; }
  getPlayer(): PlayerController | null { return this.player; }
  getInputSystem(): InputSystem | null { return this.inputSystem; }
  getNpcManager(): NPCManager | null { return this.npcManager; }
  getDialog(): DialogSystem | null { return this.dialog; }
}
