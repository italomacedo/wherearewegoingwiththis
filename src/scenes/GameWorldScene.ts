import {
  Engine, Color4, Color3, Vector3, MeshBuilder, StandardMaterial, AbstractMesh,
} from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SceneManager } from '@core/SceneManager';
import {
  SaveService, VehicleSaveState, DEFAULT_PLAYER_HEALTH, DEFAULT_VEHICLE_STATE,
} from '@systems/SaveService';
import { HealthState } from '@entities/Health';
import { ZoneManager } from '@systems/ZoneManager';
import { PauseMenu } from '@systems/PauseMenu';
import { WorldHud } from '@systems/WorldHud';
import { CameraSystem, KEY_ORBIT_SPEED } from '@systems/CameraSystem';
import { InputSystem } from '@systems/InputSystem';
import { PhysicsService } from '@systems/PhysicsService';
import { PlayerController } from '@entities/PlayerController';
import { VehicleController } from '@entities/VehicleController';
import { MercadoSombrasZone } from '@entities/zones/MercadoSombrasZone';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';
import { NPCManager, NPCMemoryMap } from '@systems/NPCManager';
import { ClaudeNPCService, ClaudeBridge } from '@systems/ClaudeNPCService';
import { DialogSystem, DialogLine } from '@systems/DialogSystem';
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
  private vehicle: VehicleController | null = null;
  private npcManager: NPCManager | null = null;
  private injectedService: ClaudeNPCService | null = null;
  private dialog: DialogSystem | null = null;
  private pauseMenu: PauseMenu | null = null;
  private hud: WorldHud | null = null;
  private npcMeshes: AbstractMesh[] = [];
  private detachInput: (() => void) | null = null;
  private startZoneId = 'mercado_sombras';
  private appearance: CharacterAppearance = DEFAULT_APPEARANCE;
  private npcMemory: NPCMemoryMap = {};
  private playerName = 'Operative';
  private gameTimeSeconds = 0;
  private saveId = '';
  private spawnOverride: Vector3 | null = null;
  private playerHealthState: HealthState = { ...DEFAULT_PLAYER_HEALTH };
  private vehicleState: VehicleSaveState = {
    health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
  };
  private gameOver = false;

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

  /** Adopts saveId/appearance/name/memory/position from a session, if present. */
  private adoptSession(session: GameSession | null): void {
    if (!session) return;
    this.saveId = session.saveId;
    this.appearance = session.character.appearance;
    this.playerName = session.character.name;
    this.npcMemory = session.npcMemory ?? {};
    this.gameTimeSeconds = session.gameTimeSeconds;
    this.playerHealthState = session.playerHealth ?? { ...DEFAULT_PLAYER_HEALTH };
    this.vehicleState = session.vehicle ?? {
      health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
    };
    if (session.world?.zone) this.startZoneId = session.world.zone;
    const [x, y, z] = session.world?.position ?? [0, 0, 0];
    // Treat an all-zero saved position as "use the zone's spawn point".
    if (x !== 0 || y !== 0 || z !== 0) {
      this.spawnOverride = new Vector3(x, y, z);
    }
  }

  /** Writes world position + NPC memory + health (player & bike) back to disk. */
  private persistSession(): void {
    if (!this.saveId) return;
    const save = SaveService.load(this.saveId);
    if (!save) return;

    const memory = this.npcManager?.serializeMemory() ?? {};
    const pos = this.player?.getPosition();
    const world = {
      zone: this.startZoneId,
      position: (pos ? [pos.x, pos.y, pos.z] : [0, 0, 0]) as [number, number, number],
      rotation: 0,
    };
    const playerHealth = this.player?.getHealth().toState() ?? this.playerHealthState;
    const vehicle: VehicleSaveState = this.vehicle
      ? { health: this.vehicle.getHealth().toState(), destroyed: this.vehicle.isDestroyed() }
      : this.vehicleState;

    SaveService.save({
      ...save, world, gameTimeSeconds: this.gameTimeSeconds, npcMemory: memory, playerHealth, vehicle,
    });

    const session = ServiceLocator.tryGet<GameSession>('gameSession');
    if (session) {
      session.world = world;
      session.npcMemory = memory;
      session.gameTimeSeconds = this.gameTimeSeconds;
      session.playerHealth = playerHealth;
      session.vehicle = vehicle;
    }
  }

  async onEnter(): Promise<void> {
    // Pull the active session (set by Character Creator / Load Game). Direct
    // setters still win if a test injected them before onEnter.
    this.adoptSession(ServiceLocator.tryGet<GameSession>('gameSession'));

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
    await this.player.spawn(this.spawnOverride ?? zone.getSpawnPoint(), this.appearance);
    ServiceLocator.register('player', this.player);
    this.cameraSystem.setTarget(this.player.getRoot());

    this.player.setHealthState(this.playerHealthState);

    // Park a flying motorcycle near the spawn point.
    this.vehicle = new VehicleController(this.babylonScene);
    this.vehicle.spawn(zone.getSpawnPoint().add(new Vector3(4, 0, 0)));
    this.vehicle.setHealthState(this.vehicleState.health);
    this.vehicle.setDestroyed(this.vehicleState.destroyed);
    ServiceLocator.register('vehicle', this.vehicle);

    this.setupNPCs();
    this.dialog = new DialogSystem(this.babylonScene);
    this.wireDialog();

    // HUD: floating labels + contextual action prompts (Phase 8/9 evidence).
    this.hud = new WorldHud(this.babylonScene);
    const zaraMesh = this.npcMeshes[0];
    const npc = this.npcManager?.getAgents()[0];
    // Show the NPC's name only after it introduces itself (no metagaming).
    if (zaraMesh && npc) this.hud.addLabel(zaraMesh, npc.getDisplayName(), 'npc');
    if (this.vehicle) this.hud.addLabel(this.vehicle.getRoot(), 'Flying Bike', 'vehicle');

    // Pause menu (ESC) with in-game Save (Phase 5 evidence).
    this.pauseMenu = new PauseMenu(this.babylonScene);
    this.wirePauseMenu();

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
    // Autosave before tearing anything down (npcManager is disposed below).
    this.persistSession();
    this.detachInput?.();
    this.player?.dispose();
    this.vehicle?.dispose();
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.npcManager?.dispose();
    this.dialog?.dispose();
    this.pauseMenu?.dispose();
    this.hud?.dispose();
    this.npcMeshes.forEach((m) => m.dispose());
    this.npcMeshes = [];
    this.player = null;
    this.vehicle = null;
    this.zoneManager = null;
    this.cameraSystem = null;
    this.inputSystem = null;
    this.physics = null;
    this.npcManager = null;
    this.dialog = null;
    this.pauseMenu = null;
    this.hud = null;
    this.detachInput = null;
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player', 'vehicle', 'npcManager'].forEach((k) =>
      ServiceLocator.unregister(k)
    );
  }

  update(): void {
    const dt = this.engine.getDeltaTime() / 1000;

    // ESC toggles the pause menu (unless the dialog owns the keyboard). While
    // paused, the world is frozen — only the menu (and camera follow) live on.
    this.handlePauseInput();
    if (this.pauseMenu?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // While the dialog is open the keyboard belongs to the text input — freeze
    // player movement so typing doesn't move the character.
    const dialogOpen = this.dialog?.isOpen() ?? false;
    if (!dialogOpen) {
      this.handleCameraKeys(dt);
      this.handleVehicleInput();
      const driving = this.vehicle?.isOccupied() ?? false;
      if (!driving) {
        // On foot: camera-relative movement + gravity (fall damage on landing).
        if (this.cameraSystem && this.player) {
          this.player.setCameraYaw(this.cameraSystem.getYaw());
        }
        this.player?.update(dt);
      }
    }
    // Vehicle physics run every frame: piloted it flies; abandoned it falls.
    this.tickVehicle(dt);
    this.cameraSystem?.update();
    this.updateNPCs(dt);
    if (!(this.vehicle?.isOccupied() ?? false)) this.handleInteractInput();
    this.updateHud(dialogOpen);
    this.checkGameOver();
    this.inputSystem?.endFrame();
    this.gameTimeSeconds += dt;
  }

  /** When the hero dies, end the run and return to the main menu. */
  private checkGameOver(): void {
    if (this.gameOver || !this.player?.isDead()) return;
    this.gameOver = true;
    void ServiceLocator.get<SceneManager>('sceneManager').loadScene('main-menu');
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
    mat.diffuseColor = new Color3(0.7, 0.3, 0.55);
    // Bright emissive so the NPC reads clearly against the dark market.
    mat.emissiveColor = new Color3(0.55, 0.15, 0.45);
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
      // Don't close while the player is typing — the 'E' belongs to the field.
      if (!this.dialog.isInputFocused()) this.dialog.close();
      return;
    }
    const agent = this.npcManager.getConversableAgent(this.player.getPosition());
    if (agent) {
      // Seed the transcript with the prior conversation so history is visible.
      const seed: DialogLine[] = agent.conversation.getFullHistory().flatMap((ex) => [
        { role: 'player' as const, text: ex.player },
        { role: 'npc' as const, text: ex.npc },
      ]);
      this.dialog.open(agent.getDisplayName(), seed);
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

    // Pre-moderation: screen the player's input against Anthropic's Usage Policy
    // BEFORE it ever reaches the NPC. Out-of-policy input is refused up front and
    // never shown/sent. Fails open (allows) on any moderation error.
    this.dialog.setThinking(true);
    const allowed = await this.npcManager.moderate(agent.definition.id, message);
    if (!allowed) {
      this.dialog.addSystemLine("You can't say or do that.");
      return;
    }

    const world: WorldSnapshot = {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters: agent.distanceTo(this.player.getPosition()),
      playerAction: this.derivePlayerAction(),
      recentEvents: [],
    };

    // Show what the player said, then stream the reply beneath it.
    this.dialog.addPlayerLine(message);
    this.dialog.setThinking(true);
    try {
      const reply = await this.npcManager.sendMessage(agent.definition.id, world, message, (chunk) =>
        this.dialog?.appendChunk(chunk)
      );
      if (!reply) {
        // Nothing came back — show a hint instead of an empty bubble.
        this.dialog.setNpcText('( … no reply. Is the Claude CLI path set in Options → Game? )');
      } else {
        // Replace the streamed raw text with the sanitized (in-character) reply.
        this.dialog.setNpcText(reply);
        if (agent.revealNameIfMentioned(reply)) {
          this.dialog.setNpcName(agent.definition.name);
          this.hud?.setLabelText('npc', agent.definition.name);
        }
      }
    } catch (err) {
      // Surface the real error (CLI exit code + stderr) to help diagnose.
      const msg = err instanceof Error ? err.message : String(err);
      this.dialog.setNpcText(`( Claude error: ${msg.slice(0, 180)} )`);
    }
  }

  private formatGameTime(): string {
    const totalMinutes = Math.floor(this.gameTimeSeconds / 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}, day 1`;
  }

  // ─── Vehicles ───────────────────────────────────────────────────────────────

  /**
   * Step the vehicle physics every frame. While piloted it flies from input;
   * while abandoned the engine is off so it falls and crashes (handled inside
   * VehicleController.update).
   */
  private tickVehicle(dt: number): void {
    if (!this.vehicle || !this.cameraSystem) return;
    const driving = this.vehicle.isOccupied();
    const input = driving && this.inputSystem
      ? { axis: this.inputSystem.getMovementAxis(), vertical: this.inputSystem.getVerticalAxis() }
      : { axis: { x: 0, z: 0 }, vertical: 0 };
    this.vehicle.update(dt, input, this.cameraSystem.getYaw());
  }

  /** Mount on F when near a parked vehicle; dismount on F while piloting. */
  private handleVehicleInput(): void {
    if (!this.inputSystem || !this.vehicle || !this.player || !this.cameraSystem) return;
    if (!this.inputSystem.wasJustPressed('vehicle.enter')) return;

    if (this.vehicle.isOccupied()) {
      // Dismount beside the bike at its current altitude, then fall (gravity +
      // fall damage). The abandoned bike loses lift and falls too.
      this.vehicle.exit();
      const p = this.vehicle.getPosition();
      this.player.getRoot().position.set(p.x + 1.5, p.y, p.z);
      this.player.getRoot().setEnabled(true);
      this.player.startFalling(p.y);
      this.cameraSystem.setTarget(this.player.getRoot());
      this.cameraSystem.exitVehicleMode();
    } else if (this.vehicle.canEnter(this.player.getPosition())) {
      this.vehicle.enter();
      this.player.getRoot().setEnabled(false);
      this.cameraSystem.setTarget(this.vehicle.getRoot());
      this.cameraSystem.enterVehicleMode();
    }
  }

  /** Hold Z / C to orbit the camera left / right around the hero (also MMB-drag). */
  private handleCameraKeys(dt: number): void {
    if (!this.inputSystem || !this.cameraSystem) return;
    if (this.inputSystem.isActionActive('camera.rotateLeft')) {
      this.cameraSystem.orbit(KEY_ORBIT_SPEED * dt);
    }
    if (this.inputSystem.isActionActive('camera.rotateRight')) {
      this.cameraSystem.orbit(-KEY_ORBIT_SPEED * dt);
    }
  }

  // ─── Pause + HUD ─────────────────────────────────────────────────────────────

  /** ESC toggles pause, except while the dialog field is focused. */
  private handlePauseInput(): void {
    if (!this.inputSystem || !this.pauseMenu) return;
    if (!this.inputSystem.wasJustPressed('pause')) return;
    if (this.dialog?.isOpen()) {
      // ESC closes the dialog rather than pausing.
      if (!this.dialog.isInputFocused()) this.dialog.close();
      return;
    }
    this.pauseMenu.toggle();
  }

  private wirePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.setHandlers({
      onResume: () => {},
      onSave: () => this.persistSession(),
      onLoad: () => {
        this.persistSession();
        void ServiceLocator.get<SceneManager>('sceneManager').loadScene('load-game');
      },
      onMainMenu: () => {
        void ServiceLocator.get<SceneManager>('sceneManager').loadScene('main-menu');
      },
    });
  }

  /** Refresh the HUD each frame: hero HP, bike status, and the action prompt. */
  private updateHud(dialogOpen: boolean): void {
    if (!this.hud) return;

    if (this.player) this.hud.setPlayerHealth(this.player.getHealth().fraction());
    this.hud.setVehicleStatus(this.deriveVehicleStatus());
    this.hud.setActionPrompt(this.deriveActionPrompt(dialogOpen));
  }

  /** Bike status line: destroyed / live HP% while relevant, else hidden. */
  private deriveVehicleStatus(): string | null {
    if (!this.vehicle) return null;
    if (this.vehicle.isDestroyed()) return 'BIKE DESTROYED';
    if (this.vehicle.isOccupied() || this.vehicle.isSmoking()) {
      return `BIKE ${Math.round(this.vehicle.getHealth().fraction() * 100)}%`;
    }
    return null;
  }

  private deriveActionPrompt(dialogOpen: boolean): string | null {
    if (dialogOpen) return null;
    if (this.vehicle?.isOccupied()) return '[F] Exit bike';
    if (this.player && this.vehicle?.canEnter(this.player.getPosition())) return '[F] Enter bike';
    if (this.npcManager && this.player) {
      const agent = this.npcManager.getConversableAgent(this.player.getPosition());
      // Don't leak the name in the prompt before the NPC introduces itself.
      if (agent) return agent.isNameKnown() ? `[E] Talk to ${agent.definition.name}` : '[E] Talk';
    }
    return null;
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  getZoneManager(): ZoneManager | null { return this.zoneManager; }
  getCameraSystem(): CameraSystem | null { return this.cameraSystem; }
  getPlayer(): PlayerController | null { return this.player; }
  getVehicle(): VehicleController | null { return this.vehicle; }
  getInputSystem(): InputSystem | null { return this.inputSystem; }
  getNpcManager(): NPCManager | null { return this.npcManager; }
  getDialog(): DialogSystem | null { return this.dialog; }
  getPauseMenu(): PauseMenu | null { return this.pauseMenu; }
  getHud(): WorldHud | null { return this.hud; }
}
