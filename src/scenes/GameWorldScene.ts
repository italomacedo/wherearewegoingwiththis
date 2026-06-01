import {
  Engine, Color4, Vector3, AbstractMesh, TransformNode, MeshBuilder,
  PhysicsAggregate, PhysicsShapeType, AnimationGroup,
} from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SceneManager } from '@core/SceneManager';
import {
  SaveService, VehicleSaveState, DEFAULT_PLAYER_HEALTH, DEFAULT_VEHICLE_STATE,
} from '@systems/SaveService';
import { HealthState, describeCondition } from '@entities/Health';
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
import { NPCManager, NPCMemoryMap, AutonomyContext, AutonomyJob } from '@systems/NPCManager';
import { ClaudeCallQueue, queueConfigFromSettings } from '@systems/ClaudeCallQueue';
import { IntentCandidate } from '@systems/npc/Intent';
import { computeRoute } from '@systems/Pathfinding';
import { WAYPOINT_GRAPH } from '@assets/WorldAssetCatalog';
import { ClaudeNPCService, ClaudeBridge } from '@systems/ClaudeNPCService';
import { DialogSystem, DialogLine } from '@systems/DialogSystem';
import { createZara } from '@entities/npcs/zara';
import { createMback } from '@entities/npcs/mback';
import { PlayerAction, NPCDefinition, NPCAgent } from '@entities/NPCAgent';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { WorldSnapshot } from '@systems/npc/PromptBuilder';
import { resolveAddressee, AddressCandidate, stripShout } from '@systems/npc/Addressing';
import { hasEmote, isCheckTimeEmote, isSelfExamEmote, narrateTime } from '@systems/npc/EmoteIntent';
import {
  CharacterStats, AttributeId, createDefaultStats, checkValue, applySkillUse,
} from '@entities/CharacterStats';
import { resolveCheck } from '@systems/SkillCheck';
import { t, getLocale, languageName } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';

export class GameWorldScene extends BaseScene {
  /** Setting used for the ambient "react to surroundings" narration (global chat). */
  private static readonly SURROUNDINGS =
    'a rainy, neon-lit downtown street lined with shuttered shopfronts and a vendor stall';

  /** Attribute used for a deterministic action when the classifier names neither
   *  a skill nor an attribute (rare fallback). */
  private static readonly DEFAULT_CHECK_ATTRIBUTE: AttributeId = 'forca';

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
  private npcHolderById = new Map<string, TransformNode>();
  private npcAnimById = new Map<string, { walk: AnimationGroup | null; idle: AnimationGroup | null }>();
  private npcAnchors: AbstractMesh[] = [];
  // ─── Autonomy (Fase 5) ──────────────────────────────────────────────────────
  private autonomyQueue: ClaudeCallQueue<AutonomyJob> | null = null;
  private autonomyAccumMs = 0;
  /** Active approach routes per NPC id: polyline + cursor + who they walk toward. */
  private npcRoutes = new Map<string, { path: Vector3[]; i: number; partnerId: string }>();
  /** NPC ids currently mid-gossip (so a route completion fires the exchange once). */
  private gossiping = new Set<string>();
  /** Overheard NPC↔NPC gossip lines, shown in the global (T) chat history. */
  private gossipLog: string[] = [];
  private static readonly GOSSIP_LOG_MAX = 12;
  private static readonly AUTONOMY_TICK_MS = 1000; // throttle the driver itself
  private static readonly NPC_WALK_SPEED = 2.2;    // u/s for autonomous walking
  private static readonly ENGAGE_DIST = 1.8;       // arrival threshold for gossip
  private entityColliders: AbstractMesh[] = [];
  private entityAggregates: PhysicsAggregate[] = [];
  private detachInput: (() => void) | null = null;
  private startZoneId = 'mercado_sombras';
  private appearance: CharacterAppearance = DEFAULT_APPEARANCE;
  private npcMemory: NPCMemoryMap = {};
  private playerName = 'Operative';
  private playerStats: CharacterStats = createDefaultStats();
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
    this.playerStats = session.character.stats ?? createDefaultStats();
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

    const character = { ...save.character, stats: this.playerStats };
    SaveService.save({
      ...save, character, world, gameTimeSeconds: this.gameTimeSeconds, npcMemory: memory, playerHealth, vehicle,
    });

    const session = ServiceLocator.tryGet<GameSession>('gameSession');
    if (session) {
      session.character = character;
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
      ...this.npcAnchors,
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
    this.npcHolderById.clear();
    this.npcAnimById.clear();
    this.npcAnchors = [];
    this.autonomyQueue?.clear();
    this.autonomyQueue = null;
    this.autonomyAccumMs = 0;
    this.npcRoutes.clear();
    this.gossiping.clear();
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

    const definitions = [createZara(), createMback()];
    for (const def of definitions) {
      const conversation = NPCManager.restoreConversation(this.npcMemory, def.id);
      const agent = this.npcManager.spawn(def, conversation);
      agent.setDisposition(NPCManager.restoreDisposition(this.npcMemory, def.id, def.initialDisposition ?? 'neutral'));
      const anchor = await this.buildNPCVisual(def);
      this.npcAnchors.push(anchor);
    }

    // Autonomy queue (throttled per the player's Options). With ≥2 co-located
    // NPCs, an `approach` deliberation now surfaces live on-screen gossip.
    this.autonomyQueue = new ClaudeCallQueue<AutonomyJob>(
      queueConfigFromSettings(SettingsService.get('npcCallsPerMinute')),
    );
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
    const idle = groups.find((g) => g.name.toLowerCase().includes('idle')) ?? null;
    const walk = groups.find((g) => g.name.toLowerCase().includes('walk')) ?? null;
    idle?.start(true);
    this.npcVisuals.push(assembled);
    this.npcHolders.push(holder);
    this.npcHolderById.set(npc.id, holder);
    this.npcAnimById.set(npc.id, { walk, idle });
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
    this.driveAutonomy(dt);
    this.stepNpcMovers(dt);
  }

  /**
   * Autonomy driver (browser/Electron only — the pure decision logic lives in
   * NPCManager.tickAutonomy and is unit-tested). Gated on the Options switch;
   * throttled to AUTONOMY_TICK_MS so we deliberate at most ~1×/s, then the
   * ClaudeCallQueue applies the real cost throttle on top.
   */
  /* istanbul ignore next — browser/Electron autonomy loop (Claude + meshes) */
  private driveAutonomy(dt: number): void {
    if (typeof document === 'undefined') return;
    if (!this.npcManager || !this.autonomyQueue) return;
    if (!SettingsService.get('npcAutonomy')) return;

    this.autonomyAccumMs += dt * 1000;
    if (this.autonomyAccumMs < GameWorldScene.AUTONOMY_TICK_MS) return;
    const now = this.autonomyAccumMs;

    const ctx: AutonomyContext = {
      gameTimeLabel: this.formatGameTime(),
      playerPresent: true,
      reflectionMs: SettingsService.get('npcReflectionMinutes') * 60_000,
      language: languageName(getLocale()),
      nearbyOf: (agent) => this.nearbyCandidatesFor(agent),
    };

    void this.npcManager.tickAutonomy(this.autonomyQueue, now, ctx).then((res) => {
      const d = res.deliberated;
      if (d && d.intent.kind === 'approach' && d.intent.targetNpcId) {
        // The agent that deliberated walks toward its chosen target.
        this.beginApproach(d.agentId, d.intent.targetNpcId);
      }
      if (res.attackers.length > 0) {
        console.warn(`[NPC] attack intent flagged (combat stub): ${res.attackers.join(', ')}`);
      }
    });
  }

  /** Other known NPCs near the given agent (within ~20m) it could engage. */
  /* istanbul ignore next — browser-only helper */
  private nearbyCandidatesFor(agent: NPCAgent): IntentCandidate[] {
    const out: IntentCandidate[] = [];
    this.npcManager?.getAgents().forEach((other) => {
      if (other.definition.id === agent.definition.id) return;
      if (agent.distanceTo(other.getPosition()) > 20) return;
      out.push({ id: other.definition.id, name: other.getDisplayName() });
    });
    return out;
  }

  /** Plan an A* route for `moverId` to walk toward `partnerId`. */
  /* istanbul ignore next — browser-only mesh routing */
  private beginApproach(moverId: string, partnerId: string): void {
    if (moverId === partnerId) return; // never approach/gossip with oneself
    const mover = this.npcHolderById.get(moverId);
    const partner = this.npcHolderById.get(partnerId);
    if (!mover || !partner || this.npcRoutes.has(moverId) || this.gossiping.has(moverId)) return;
    const from: [number, number, number] = [mover.position.x, 0, mover.position.z];
    const to: [number, number, number] = [partner.position.x, 0, partner.position.z];
    const poly = computeRoute(WAYPOINT_GRAPH, from, to);
    if (!poly) return;
    this.npcRoutes.set(moverId, { path: poly.map((p) => new Vector3(p[0], 0, p[2])), i: 1, partnerId });
    // Play the walk clip while travelling (avatar has Idle/Walk groups).
    const anim = this.npcAnimById.get(moverId);
    anim?.idle?.stop();
    anim?.walk?.start(true);
  }

  /** Advance any NPCs walking a route; on arrival, run a one-shot gossip exchange. */
  /* istanbul ignore next — browser-only mesh stepping */
  private stepNpcMovers(dt: number): void {
    if (this.npcRoutes.size === 0) return;
    const step = GameWorldScene.NPC_WALK_SPEED * dt;
    this.npcRoutes.forEach((route, moverId) => {
      const holder = this.npcHolderById.get(moverId);
      const partner = this.npcHolderById.get(route.partnerId);
      if (!holder || !partner) { this.npcRoutes.delete(moverId); return; }

      if (Vector3.Distance(holder.position, partner.position) <= GameWorldScene.ENGAGE_DIST) {
        this.npcRoutes.delete(moverId);
        this.npcManager?.getAgent(moverId)?.setPosition(holder.position);
        // Stop walking, turn to face the partner, back to idle, then gossip.
        const anim = this.npcAnimById.get(moverId);
        anim?.walk?.stop();
        anim?.idle?.start(true);
        holder.rotation.y = Math.atan2(partner.position.x - holder.position.x, partner.position.z - holder.position.z);
        this.triggerGossip(moverId, route.partnerId);
        return;
      }
      const target = route.path[route.i];
      if (!target) { this.npcRoutes.delete(moverId); return; }
      const to = target.subtract(holder.position);
      const dist = to.length();
      if (dist <= step) {
        holder.position.copyFrom(target);
        route.i += 1;
      } else {
        holder.position.addInPlace(to.scale(step / dist));
        holder.rotation.y = Math.atan2(to.x, to.z);
      }
      // Keep the agent's logical position in sync so the [E] Talk prompt,
      // proximity and conversation framing follow the NPC as it walks.
      this.npcManager?.getAgent(moverId)?.setPosition(holder.position);
    });
  }

  /** Fire a single live gossip exchange between two NPCs and surface it. */
  /* istanbul ignore next — browser-only Claude gossip */
  private triggerGossip(speakerId: string, listenerId: string): void {
    if (!this.npcManager || this.gossiping.has(speakerId)) return;
    this.gossiping.add(speakerId);
    void this.npcManager.runGossip(speakerId, listenerId, languageName(getLocale())).then((lines) => {
      const sp = this.npcManager?.getAgent(speakerId)?.getDisplayName() ?? 'NPC';
      const lp = this.npcManager?.getAgent(listenerId)?.getDisplayName() ?? 'NPC';
      // Record the exchange in the gossip log so it shows in the global (T) chat
      // history, and live if that chat is already open. (Each NPC also keeps it
      // in their own conversation, so opening E with either shows it too.)
      if (lines.speaker) this.recordGossipLine(`${sp}: ${lines.speaker}`);
      if (lines.listener) this.recordGossipLine(`${lp}: ${lines.listener}`);
      this.gossiping.delete(speakerId);
    });
  }

  /** Append a gossip line to the overheard-log + live into an open dialog. */
  /* istanbul ignore next — only reached from the browser-only gossip trigger */
  private recordGossipLine(text: string): void {
    this.gossipLog.push(text);
    if (this.gossipLog.length > GameWorldScene.GOSSIP_LOG_MAX) this.gossipLog.shift();
    /* istanbul ignore next — browser-only live update */
    if (this.dialog?.isOpen()) this.dialog.addNarrationLine(text);
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
      // scene origin instead. Look the holder up by the agent's id (multi-NPC).
      const holder = this.npcHolderById.get(agent.definition.id);
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
    // Seed with any overheard NPC↔NPC gossip so it shows in the T history.
    const seed: DialogLine[] = this.gossipLog.map((text) => ({ role: 'narration' as const, text }));
    this.dialog.open(t('dialog.openChannel'), seed);
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
      this.dialog.addSystemLine(t('dialog.cantSay'));
      return;
    }

    this.dialog.addPlayerLine(spoken);
    // Emote pipeline: a deterministic action resolves via a cRPG check + narration
    // (and the NPC reacts); otherwise fall through to a normal NPC reply.
    if (await this.resolvePlayerAction(spoken, agent)) return;

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
    const agent = resolution.kind === 'npc' ? this.npcManager.getAgent(resolution.id) : null;
    const modId = agent ? agent.definition.id : 'world';
    const spoken = stripShout(message);

    this.dialog.setThinking(true);
    const allowed = await this.npcManager.moderate(modId, spoken);
    if (!allowed) {
      this.dialog.addSystemLine(t('dialog.cantSay'));
      return;
    }

    this.dialog.addPlayerLine(spoken);
    // Deterministic action → cRPG check + narration (+ NPC reaction if addressed).
    if (await this.resolvePlayerAction(spoken, agent)) return;

    if (agent) {
      this.dialog.setNpcName(agent.getDisplayName());
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent.distanceTo(this.player.getPosition())), spoken);
    } else {
      this.dialog.setThinking(true);
      const narration = await this.npcManager.narrateAmbient(spoken, this.formatGameTime(), GameWorldScene.SURROUNDINGS, languageName(getLocale()));
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
        this.dialog.setNpcText(t('dialog.noReply'));
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
   * If the message is an emote that classifies as a deterministic action, resolve
   * it as a cRPG check and narrate the outcome (no numbers), then — if an NPC is
   * addressed — let the NPC react. Returns true when handled; pure speech (or a
   * NARRATIVE emote) → false, so the caller falls through to normal chat.
   *
   * "Check the time" short-circuits the classifier (unambiguous + free).
   */
  private async resolvePlayerAction(message: string, agent: NPCAgent | null): Promise<boolean> {
    if (!this.dialog || !this.npcManager) return false;
    if (!hasEmote(message)) return false;

    if (isCheckTimeEmote(message)) {
      this.dialog.addNarrationLine(
        narrateTime(this.clock.label(this.gameTimeSeconds), this.clock.period(this.gameTimeSeconds))
      );
      return true;
    }

    // Self-exam: a Medicina-gated read of your own condition (diegetic, no numbers).
    if (isSelfExamEmote(message) && this.player) {
      const value = checkValue(this.playerStats, 'medicina', 'inteligencia');
      const result = resolveCheck({ value });
      if (result.success) {
        this.playerStats = applySkillUse(this.playerStats, 'medicina', SettingsService.get('skillGainMultiplier'));
      }
      this.dialog.addNarrationLine(describeCondition(this.player.getHealth().fraction(), result.success));
      return true;
    }

    this.dialog.setThinking(true);
    const cls = await this.npcManager.classifyAction(agent?.definition.id ?? 'world', message);
    if (!cls.deterministic) return false;

    // Resolve the check: skill% if one fits, else the governing attribute%
    // (fallback), vs the chosen difficulty. One d100 against the power-ratio P.
    const attribute = cls.attribute ?? GameWorldScene.DEFAULT_CHECK_ATTRIBUTE;
    const value = checkValue(this.playerStats, cls.skillId, attribute);
    const result = resolveCheck({ value, opponent: cls.difficulty });

    // Learning by doing — only on success (owner's rule), × the Options multiplier.
    if (result.success && cls.skillId) {
      this.playerStats = applySkillUse(this.playerStats, cls.skillId, SettingsService.get('skillGainMultiplier'));
    }

    const narration = await this.npcManager.narrateOutcome(message, result.success, languageName(getLocale()));
    this.dialog.addNarrationLine(narration || (result.success ? 'You pull it off.' : "It doesn't go your way."));

    // The addressed NPC reacts to the action.
    if (agent) {
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent.distanceTo(this.player!.getPosition())), message);
    }
    return true;
  }

  private buildWorldSnapshot(distanceMeters: number): WorldSnapshot {
    return {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters,
      playerAction: this.derivePlayerAction(),
      recentEvents: [],
      language: languageName(getLocale()),
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
    if (this.vehicle.isDestroyed()) return t('hud.naveDestroyed');
    if (this.vehicle.isOccupied() || this.vehicle.isSmoking()) {
      return t('hud.naveStatus', { pct: Math.round(this.vehicle.getHealth().fraction() * 100) });
    }
    return null;
  }

  private deriveActionPrompt(dialogOpen: boolean): string | null {
    if (dialogOpen) return null;
    if (this.vehicle?.isOccupied()) return t('hud.exitBike');
    if (this.player && this.vehicle?.canEnter(this.player.getPosition())) return t('hud.enterBike');
    if (this.npcManager && this.player) {
      const agent = this.npcManager.getConversableAgent(this.player.getPosition());
      // Don't leak the name in the prompt before the NPC introduces itself.
      if (agent) return agent.isNameKnown() ? t('hud.talkTo', { name: agent.definition.name }) : t('hud.talk');
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
