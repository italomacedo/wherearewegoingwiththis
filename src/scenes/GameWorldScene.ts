import {
  Engine, Color4, Vector3, AbstractMesh, TransformNode, MeshBuilder,
  PhysicsAggregate, PhysicsShapeType,
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
import { WorldZone } from '@entities/WorldZone';
import { GameClock, DayPeriod } from '@systems/GameClock';
import { CharacterAppearance, DEFAULT_APPEARANCE } from '@entities/CharacterData';
import { NPCManager, NPCMemoryMap } from '@systems/NPCManager';
import { ClaudeNPCService, ClaudeBridge } from '@systems/ClaudeNPCService';
import { DialogSystem, DialogLine } from '@systems/DialogSystem';
import { createZara } from '@entities/npcs/zara';
import { PlayerAction, NPCDefinition, NPCAgent } from '@entities/NPCAgent';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { WorldSnapshot } from '@systems/npc/PromptBuilder';
import { resolveAddressee, AddressCandidate, stripShout } from '@systems/npc/Addressing';
import { hasEmote, isCheckTimeEmote, narrateTime, DETERMINISTIC_PLACEHOLDER } from '@systems/npc/EmoteIntent';
import { SettingsService } from '@systems/SettingsService';

export class GameWorldScene extends BaseScene {
  /** Setting used for the ambient "react to surroundings" narration (global chat). */
  private static readonly SURROUNDINGS =
    'a rainy, neon-lit downtown street lined with shuttered shopfronts and a vendor stall';

  private zoneManager: ZoneManager | null = null;
  private zone: WorldZone | null = null;
  private clock = new GameClock(); // wall-clock mode by default (mirrors the PC clock)
  private lastPeriod: DayPeriod | null = null;
  private cameraSystem: CameraSystem | null = null;
  private inputSystem: InputSystem | null = null;
  private physics: PhysicsService | null = null;
  private player: PlayerController | null = null;
  private vehicle: VehicleController | null = null;
  private npcManager: NPCManager | null = null;
  private injectedService: ClaudeNPCService | null = null;
  private dialog: DialogSystem | null = null;
  private chatMode: 'npc' | 'global' = 'npc';
  private pauseMenu: PauseMenu | null = null;
  private hud: WorldHud | null = null;
  private npcMeshes: AbstractMesh[] = [];
  private npcVisuals: AssembledCharacter[] = [];
  private npcHolders: TransformNode[] = [];
  private npcLabelAnchor: AbstractMesh | null = null;
  private entityColliders: AbstractMesh[] = [];
  private entityAggregates: PhysicsAggregate[] = [];
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

    // Physics BEFORE the zone + player so the zone can build static colliders and
    // the hero gets a Havok character controller. Resilient: if the WASM fails the
    // world still loads (movement falls back to the kinematic path).
    this.physics = new PhysicsService();
    ServiceLocator.register('physics', this.physics);
    try {
      await this.physics.init(this.babylonScene);
    } catch {
      // ignore — movement falls back to non-physics path
    }

    this.zoneManager = new ZoneManager();
    this.zoneManager.register('mercado_sombras', () => new MercadoSombrasZone());
    ServiceLocator.register('zoneManager', this.zoneManager);

    const zone = await this.zoneManager.loadZone(this.startZoneId, this.babylonScene);
    this.zone = zone;
    this.updateTimeOfDay(); // initial light/fog tint for the current time of day

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

    await this.setupNPCs();
    this.dialog = new DialogSystem(this.babylonScene);
    this.wireDialog();

    // HUD: contextual action prompt only (no floating name tags — more immersive;
    // the NPC's name lives in the chat window + the [E] Talk prompt once revealed).
    this.hud = new WorldHud(this.babylonScene);

    // Pause menu (ESC) with in-game Save (Phase 5 evidence).
    this.pauseMenu = new PauseMenu(this.babylonScene);
    this.wirePauseMenu();

    // Static colliders for the nave + Zara so the hero can't walk through them.
    if (this.babylonScene.isPhysicsEnabled()) {
      /* istanbul ignore next — physics colliders are browser/Electron only */
      this.buildEntityColliders();
    }
  }

  /* istanbul ignore next — physics colliders are browser/Electron only */
  private buildEntityColliders(): void {
    const targets: Array<AbstractMesh | undefined> = [
      this.vehicle?.getRoot() as unknown as AbstractMesh,
      this.npcLabelAnchor ?? undefined,
    ];
    for (const t of targets) {
      if (!t) continue;
      const { min, max } = t.getHierarchyBoundingVectors(true);
      const size = max.subtract(min);
      if (size.x < 0.05 || size.y < 0.05 || size.z < 0.05) continue;
      const box = MeshBuilder.CreateBox(`col-entity-${t.name}`, { width: size.x, height: size.y, depth: size.z }, this.babylonScene);
      box.position.copyFrom(min.add(max).scale(0.5));
      box.isVisible = false;
      const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, this.babylonScene);
      this.entityColliders.push(box);
      this.entityAggregates.push(agg);
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
    /* istanbul ignore next — entity colliders only exist in browser with physics */
    this.entityAggregates.forEach((a) => a.dispose());
    this.entityAggregates = [];
    this.entityColliders.forEach((c) => c.dispose());
    this.entityColliders = [];
    this.npcMeshes.forEach((m) => m.dispose());
    this.npcMeshes = [];
    this.npcVisuals.forEach((v) => v.dispose());
    this.npcVisuals = [];
    this.npcHolders.forEach((h) => h.dispose());
    this.npcHolders = [];
    this.npcLabelAnchor = null;
    this.player = null;
    this.vehicle = null;
    this.zoneManager = null;
    this.zone = null;
    this.lastPeriod = null;
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
    this.updateTimeOfDay();
    if (!(this.vehicle?.isOccupied() ?? false)) {
      this.handleInteractInput();
      this.handleChatInput();
    }
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

  private async setupNPCs(): Promise<void> {
    const service = this.injectedService ?? this.createClaudeService();
    this.npcManager = new NPCManager(service);
    ServiceLocator.register('npcManager', this.npcManager);

    const zara = createZara();
    const conversation = NPCManager.restoreConversation(this.npcMemory, zara.id);
    this.npcManager.spawn(zara, conversation);
    this.npcLabelAnchor = await this.buildNPCVisual(zara);
  }

  /**
   * Builds an NPC's visual via the player avatar pipeline (CharacterAssembler):
   * a real Quaternius avatar with a looping idle animation. Uses the NPC's own
   * appearance, or DEFAULT_APPEARANCE if none. Returns the mesh used as the
   * floating-label anchor. (CharacterAssembler falls back to a procedural
   * placeholder headlessly / when GLBs are missing, so this is safe in tests.)
   */
  private async buildNPCVisual(npc: NPCDefinition): Promise<AbstractMesh> {
    const assembler = new CharacterAssembler(this.babylonScene);
    const assembled = await assembler.assemble(npc.appearance ?? DEFAULT_APPEARANCE);
    const holder = new TransformNode(`npc-${npc.id}`, this.babylonScene);
    holder.position = new Vector3(npc.position[0], 0, npc.position[2]);
    assembled.meshes.forEach((m) => {
      if (!m.parent) m.parent = holder;
    });
    const groups = assembled.getAnimationGroups?.() ?? [];
    const idle = groups.find((g) => g.name.toLowerCase().includes('idle'));
    idle?.start(true);
    this.npcVisuals.push(assembled);
    this.npcHolders.push(holder);
    return assembled.rootMesh;
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
      if (!this.dialog.isInputFocused()) this.closeDialog();
      return;
    }
    const agent = this.npcManager.getConversableAgent(this.player.getPosition());
    if (agent) {
      // Seed the transcript with the prior conversation so history is visible.
      const seed: DialogLine[] = agent.conversation.getFullHistory().flatMap((ex) => [
        { role: 'player' as const, text: ex.player },
        { role: 'npc' as const, text: ex.npc },
      ]);
      this.chatMode = 'npc';
      this.dialog.open(agent.getDisplayName(), seed);
      // Cinematic framing: focus the NPC we're talking to. Target the holder (a
      // top-level node at the NPC's world position) — the camera follows
      // target.position (local), so the parented mesh anchor would frame the
      // scene origin instead. Single NPC for now; multi-NPC maps agent.id → holder.
      const holder = this.npcHolders[0];
      if (holder) {
        // Turn the NPC to face the player (avatar faces +Z at rotation.y=0, so
        // rotation.y = atan2(dx, dz) toward the player). The player is frozen
        // while the dialog is open, so a one-shot snap is enough.
        const pp = this.player.getPosition();
        holder.rotation.y = Math.atan2(pp.x - holder.position.x, pp.z - holder.position.z);
        this.cameraSystem?.enterConversationMode(holder);
      }
    }
  }

  /** Close the active dialog and restore the on-foot camera framing. */
  private closeDialog(): void {
    this.dialog?.close();
    this.cameraSystem?.exitConversationMode();
  }

  private wireDialog(): void {
    if (!this.dialog) return;
    this.dialog.onSubmit((message) => {
      if (this.chatMode === 'global') void this.sendGlobalMessage(message);
      else void this.sendToActiveNPC(message);
    });
  }

  /** T opens the chat anywhere — react to the world or hail an NPC in the scene. */
  private handleChatInput(): void {
    if (!this.inputSystem || !this.dialog || !this.player) return;
    if (!this.inputSystem.wasJustPressed('chat.open')) return;
    if (this.dialog.isOpen()) return;
    this.chatMode = 'global';
    this.dialog.open('Open channel');
  }

  /** Builds the world snapshot and routes a message to the conversable NPC (E). */
  async sendToActiveNPC(message: string): Promise<void> {
    if (!this.npcManager || !this.player || !this.dialog) return;
    const agent = this.npcManager.getConversableAgent(this.player.getPosition());
    if (!agent) return;

    // Pre-moderation: screen the player's input against Anthropic's Usage Policy
    // BEFORE it ever reaches the NPC. Out-of-policy input is refused up front and
    // never shown/sent. Fails open (allows) on any moderation error.
    const spoken = stripShout(message);
    this.dialog.setThinking(true);
    const allowed = await this.npcManager.moderate(agent.definition.id, spoken);
    if (!allowed) {
      this.dialog.addSystemLine("You can't say or do that.");
      return;
    }

    this.dialog.addPlayerLine(spoken);
    // Emote pipeline: a deterministic action is narrated (cRPG check is Phase 4);
    // otherwise fall through to a normal NPC reply.
    if (await this.handleDeterministicEmote(agent.definition.id, spoken)) return;

    const world = this.buildWorldSnapshot(agent.distanceTo(this.player.getPosition()));
    await this.streamNpcReply(agent, world, spoken);
  }

  /**
   * Global chat (T): resolve who the player is addressing (name → aim → ambient,
   * reach by tone) BEFORE any Claude call, then route to that NPC or narrate the
   * surroundings.
   */
  async sendGlobalMessage(message: string): Promise<void> {
    if (!this.npcManager || !this.player || !this.dialog) return;
    // Tone + name are read from the raw message; the shout marker is then stripped
    // (it sets reach, it is not a spoken word or an action emote).
    const resolution = resolveAddressee(message, this.playerAim(), this.buildAddressCandidates());
    const modId = resolution.kind === 'npc' ? resolution.id : 'world';
    const spoken = stripShout(message);

    this.dialog.setThinking(true);
    const allowed = await this.npcManager.moderate(modId, spoken);
    if (!allowed) {
      this.dialog.addSystemLine("You can't say or do that.");
      return;
    }

    this.dialog.addPlayerLine(spoken);
    if (await this.handleDeterministicEmote(modId, spoken)) return;

    if (resolution.kind === 'npc') {
      const agent = this.npcManager.getAgent(resolution.id);
      if (!agent) { this.dialog.addNarrationLine('No one answers.'); return; }
      this.dialog.setNpcName(agent.getDisplayName());
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent.distanceTo(this.player.getPosition())), spoken);
    } else {
      this.dialog.setThinking(true);
      const narration = await this.npcManager.narrateAmbient(spoken, this.formatGameTime(), GameWorldScene.SURROUNDINGS);
      this.dialog.addNarrationLine(narration || 'The street murmurs on, indifferent.');
    }
  }

  /** Stream an NPC's reply into the dialog (shared by the E and T paths). */
  private async streamNpcReply(agent: NPCAgent, world: WorldSnapshot, message: string): Promise<void> {
    if (!this.dialog || !this.npcManager) return;
    this.dialog.setThinking(true);
    try {
      const reply = await this.npcManager.sendMessage(agent.definition.id, world, message, (chunk) =>
        this.dialog?.appendChunk(chunk)
      );
      if (!reply) {
        this.dialog.setNpcText('( … no reply. Is the Claude CLI path set in Options → Game? )');
      } else {
        this.dialog.setNpcText(reply);
        if (agent.revealNameIfMentioned(reply)) this.dialog.setNpcName(agent.definition.name);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.dialog.setNpcText(`( Claude error: ${msg.slice(0, 180)} )`);
    }
  }

  /**
   * If the message is an emote that classifies as a deterministic action, narrate
   * its outcome (check-the-time today; a placeholder until Phase 4 wires real
   * skill checks) and return true (handled). Pure speech → false (normal chat).
   */
  private async handleDeterministicEmote(npcId: string, message: string): Promise<boolean> {
    if (!this.dialog || !this.npcManager) return false;
    if (!hasEmote(message)) return false;
    // "Check the time" is unambiguously deterministic — narrate it directly,
    // skipping the LLM classifier (reliable + no extra call).
    if (isCheckTimeEmote(message)) {
      this.dialog.addNarrationLine(this.resolveDeterministicEmote(message));
      return true;
    }
    this.dialog.setThinking(true);
    const verdict = await this.npcManager.classifyEmote(npcId, message);
    if (verdict !== 'DETERMINISTIC') return false;
    this.dialog.addNarrationLine(this.resolveDeterministicEmote(message));
    return true;
  }

  /** The narrated result of a deterministic emote (Phase 2: time, else placeholder). */
  private resolveDeterministicEmote(message: string): string {
    if (isCheckTimeEmote(message)) {
      return narrateTime(this.clock.label(this.gameTimeSeconds), this.clock.period(this.gameTimeSeconds));
    }
    return DETERMINISTIC_PLACEHOLDER;
  }

  private buildWorldSnapshot(distanceMeters: number): WorldSnapshot {
    return {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters,
      playerAction: this.derivePlayerAction(),
      recentEvents: [],
    };
  }

  /** Player position + facing for the addressing resolver. */
  private playerAim(): { x: number; z: number; facingYaw: number } {
    const p = this.player!.getPosition();
    return { x: p.x, z: p.z, facingYaw: this.player!.getFacing() };
  }

  /** All spawned NPCs as addressing candidates (name known only after introduction). */
  private buildAddressCandidates(): AddressCandidate[] {
    return (this.npcManager?.getAgents() ?? []).map((a) => {
      const pos = a.getPosition();
      return { id: a.definition.id, name: a.definition.name, nameKnown: a.isNameKnown(), position: { x: pos.x, z: pos.z } };
    });
  }

  /** In-world time for the NPC prompt: "HH:MM (period)" from the GameClock. */
  private formatGameTime(): string {
    return `${this.clock.label(this.gameTimeSeconds)} (${this.clock.period(this.gameTimeSeconds)})`;
  }

  /** Re-tint the zone's light/fog when the time-of-day period changes. */
  private updateTimeOfDay(): void {
    if (!this.zone) return;
    const period = this.clock.period(this.gameTimeSeconds);
    if (period === this.lastPeriod) return;
    this.lastPeriod = period;
    this.zone.applyTimeOfDay(period);
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
      if (!this.dialog.isInputFocused()) this.closeDialog();
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

  /** Refresh the HUD each frame: bike status and the contextual action prompt.
   * (No hero HP bar — health is learned diegetically; see WorldHud.) */
  private updateHud(dialogOpen: boolean): void {
    if (!this.hud) return;

    this.hud.setVehicleStatus(this.deriveVehicleStatus());
    this.hud.setActionPrompt(this.deriveActionPrompt(dialogOpen));
  }

  /** Nave status line: destroyed / live HP% while relevant, else hidden. */
  private deriveVehicleStatus(): string | null {
    if (!this.vehicle) return null;
    if (this.vehicle.isDestroyed()) return 'NAVE DESTROYED';
    if (this.vehicle.isOccupied() || this.vehicle.isSmoking()) {
      return `NAVE ${Math.round(this.vehicle.getHealth().fraction() * 100)}%`;
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
