import {
  Engine, Color4, Color3, Vector3, Matrix, AbstractMesh, TransformNode, MeshBuilder,
  PhysicsAggregate, PhysicsShapeType, AnimationGroup, Animation, LinesMesh,
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
import { GameOverMenu } from '@systems/GameOverMenu';
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
import { PlayerAction, NPCDefinition, NPCAgent, friendlyFireDefection } from '@entities/NPCAgent';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { WorldSnapshot } from '@systems/npc/PromptBuilder';
import { resolveAddressee, AddressCandidate, stripShout } from '@systems/npc/Addressing';
import { hasEmote, isCheckTimeEmote, isSelfExamEmote, narrateTime, ActionClassification } from '@systems/npc/EmoteIntent';
import {
  CharacterStats, AttributeId, createDefaultStats, checkValue, applySkillUse,
} from '@entities/CharacterStats';
import { resolveCheck } from '@systems/SkillCheck';
import { t, getLocale, languageName } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';
import { CombatOverlay } from '@systems/combat/CombatOverlay';
import { CombatController, CombatLogEntry, MELEE_ONLY_CAPS } from '@systems/combat/CombatController';
import { combatClipFor } from '@assets/AvatarMeshCatalog';
import { CombatEncounter, CombatantInit, CombatOutcome } from '@systems/combat/CombatEncounter';
import {
  combatTuningFromSettings, CombatTuning, Point2, Pathfinder,
  distance2, moveApCost, MELEE_RANGE, centroidOf,
} from '@systems/combat/CombatMath';
import { buildWalkGrid, gridPathfinder } from '@systems/combat/CombatMovement';
import { recruitSides, RecruitParticipant, SIDE_INITIATOR, SIDE_TARGET } from '@systems/combat/CombatRecruiter';
import { COMBAT_OBSTACLES, COMBAT_BOUNDS } from '@assets/WorldAssetCatalog';

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
  private combat: CombatOverlay | null = null;
  private gameOverMenu: GameOverMenu | null = null;
  private combatFocus: TransformNode | null = null;
  private static readonly COMBAT_CAMERA_RADIUS = 9;
  // ─── Tactical combat targeting (Fase 8A, browser-only) ───────────────────────
  /** Routed pathfinder + tuning for the active encounter (set in startCombat). */
  private combatPathfind: Pathfinder | null = null;
  private combatTuning: CombatTuning | null = null;
  /** Current player targeting mode (Attack picks a foe avatar; Move picks ground). */
  private combatTargeting:
    | { mode: 'attack'; attackKind: 'melee' | 'ranged' | undefined }
    | { mode: 'move' }
    | null = null;
  private moveTrail: LinesMesh | null = null;
  /** Hover highlight under the combatant the cursor is nearest, during attack targeting. */
  private targetRing: LinesMesh | null = null;
  /** Click tolerance (m): the cursor's ground point must land within this of a combatant. */
  private static readonly TARGET_PICK_RADIUS = 2.0;
  /** Active N-way encounter + the player's side (for friendly-fire defection). */
  private combatEnc: CombatEncounter | null = null;
  private combatPlayerSide: string | null = null;
  /** Accumulated seconds toward the next paced AI/spectator turn. */
  private combatTurnAccum = 0;
  private static readonly COMBAT_TURN_DELAY = 0.7; // seconds between AI turns (live pacing)
  /** True for a player-absent fight (cinematic centroid camera); else free RTS camera. */
  private combatSpectator = false;
  private static readonly COMBAT_PAN_SPEED = 14; // metres/second for free-camera panning
  private hud: WorldHud | null = null;
  private npcMeshes: AbstractMesh[] = [];
  private npcVisuals: AssembledCharacter[] = [];
  private npcHolders: TransformNode[] = [];
  private npcHolderById = new Map<string, TransformNode>();
  private npcAnimById = new Map<string, { walk: AnimationGroup | null; idle: AnimationGroup | null }>();
  /** Full AnimationGroup set per NPC (idle/walk/run/interact + combat clips) for combat playback. */
  private npcGroupsById = new Map<string, AnimationGroup[]>();
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

    // Turn-based combat overlay (triggered by a hostile NPC's attack intent).
    this.combat = new CombatOverlay(this.babylonScene);

    // Game-over overlay (shown on death): Load last save / Return to main menu.
    this.gameOverMenu = new GameOverMenu(this.babylonScene);
    this.gameOverMenu.setHandlers({
      onLoad: () => this.reloadLastSave(),
      onMainMenu: () => { void ServiceLocator.get<SceneManager>('sceneManager').loadScene('main-menu'); },
    });

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
    // Autosave before tearing anything down (npcManager is disposed below) —
    // but NOT on game over, or we'd overwrite the save with the dead state.
    if (!this.gameOver) this.persistSession();
    this.detachInput?.();
    this.player?.dispose();
    this.vehicle?.dispose();
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.npcManager?.dispose();
    this.dialog?.dispose();
    this.pauseMenu?.dispose();
    this.combat?.dispose();
    this.gameOverMenu?.dispose();
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
    // Game over freezes everything but the camera until the player picks an option.
    this.checkGameOver();
    if (this.gameOverMenu?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    this.handlePauseInput();
    if (this.pauseMenu?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // Turn-based combat owns the screen: freeze the world, only the camera lives.
    if (this.combat?.isOpen()) {
      this.handleCombatCameraKeys(dt);
      this.tickCombat(dt);
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
    this.inputSystem?.endFrame();
    this.gameTimeSeconds += dt;
  }

  /** When the hero dies, freeze the run and show the Game Over menu (once). */
  private checkGameOver(): void {
    if (this.gameOver || !this.player?.isDead()) return;
    this.gameOver = true;
    this.gameOverMenu?.openMenu();
  }

  /** Reload the player's last save and re-enter the world (Game Over → Load). */
  private reloadLastSave(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    const save = SaveService.load(this.saveId);
    if (save) {
      ServiceLocator.register('gameSession', GameSession.fromSave(save));
      void sm.loadScene('game-world');
    } else {
      void sm.loadScene('main-menu');
    }
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
      // Restore the NPC→NPC ledger only when persisted; otherwise keep the seeded one.
      const savedLedger = NPCManager.restoreRelationships(this.npcMemory, def.id);
      if (savedLedger) agent.restoreRelationships(savedLedger);
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
    this.npcGroupsById.set(npc.id, groups);
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
      // Autonomous NPC↔NPC fight: a deliberated `attack` on a hated NPC starts a
      // live spectator combat (8B). The player isn't a participant.
      if (d && d.intent.kind === 'attack' && d.intent.targetNpcId && !this.combat?.isOpen()) {
        this.beginCombat(d.agentId, d.intent.targetNpcId);
      } else if (res.attackers.length > 0 && !this.combat?.isOpen()) {
        // A hostile-to-player NPC commits to an attack → interactive duel with the player.
        this.startCombat(res.attackers[0]!);
      }
    });
  }

  /** Player provokes a fight with an NPC → interactive combat. */
  /* istanbul ignore next — browser-only combat wiring */
  private startCombat(enemyId: string): void {
    this.beginCombat('player', enemyId);
  }

  /**
   * Begin an N-way fight: recruit sides from everyone present by their relationship
   * ledgers (CombatRecruiter), build the pure CombatEncounter at the fighters' real
   * positions, and wire the overlay. The fight is interactive when the player is the
   * initiator/target, or a live spectator autopilot otherwise (8B). Browser-only.
   */
  /* istanbul ignore next — browser-only combat wiring (pure logic is tested) */
  private beginCombat(initiatorId: string, targetId: string): void {
    if (typeof document === 'undefined' || !this.combat || this.combat.isOpen()) return;
    const mgr = this.npcManager;
    if (!mgr) return;
    this.dialog?.close();

    const playerInvolved = initiatorId === 'player' || targetId === 'player';
    // Whole-scene recruitment: each NPC's relationships come from its disposition
    // (toward the player) and its ledger (toward other NPCs).
    const participants: RecruitParticipant[] = [];
    if (playerInvolved) participants.push({ id: 'player', relationTo: () => 'neutral' });
    for (const a of mgr.getAgents()) {
      participants.push({
        id: a.definition.id,
        relationTo: (other) => (other === 'player' ? a.getDisposition() : a.getRelationship(other)),
      });
    }
    const sides = recruitSides({ initiatorId, targetId, participants });
    const ids = Object.keys(sides);

    const tuning = combatTuningFromSettings(SettingsService.load());
    this.combatPathfind = gridPathfinder(buildWalkGrid([...COMBAT_OBSTACLES], COMBAT_BOUNDS, 1, 0.6));
    this.combatTuning = tuning;
    this.combatTurnAccum = 0;

    const names: Record<string, string> = {};
    const sources: Record<string, TransformNode> = {};
    const combatants: CombatantInit[] = [];
    for (const id of ids) {
      const side = sides[id]!;
      if (id === 'player') {
        const p = this.player?.getRoot().position ?? Vector3.Zero();
        combatants.push({ id, name: this.playerName, isPlayer: true, stats: this.playerStats, health: this.playerHealthState, pos: { x: p.x, z: p.z }, side });
        names[id] = this.playerName;
        if (this.player) sources[id] = this.player.getRoot();
      } else {
        const a = mgr.getAgent(id);
        const holder = this.npcHolderById.get(id);
        if (!a) continue;
        const pos = holder?.position ?? a.getPosition();
        combatants.push({ id, name: a.getDisplayName(), isPlayer: false, stats: this.enemyStatsFor(a), health: { current: 100, max: 100 }, pos: { x: pos.x, z: pos.z }, side });
        names[id] = a.getDisplayName();
        if (holder) sources[id] = holder;
      }
    }
    // Need at least two distinct sides among the recruited combatants.
    if (combatants.length < 2 || new Set(combatants.map((c) => c.side)).size < 2) return;

    this.combatPlayerSide = sides['player'] ?? null;
    const enc = new CombatEncounter(combatants, { tuning, pathfind: this.combatPathfind });
    this.combatEnc = enc;
    // Melee-only for now (no firearms/cover). Player id '__none__' for a spectator fight.
    const controller = new CombatController(enc, names, playerInvolved ? 'player' : '__none__', MELEE_ONLY_CAPS);

    const language = languageName(getLocale());
    this.combat.setHandlers({
      narrate: (beat) => this.npcManager?.narrateCombat(beat, language) ?? Promise.resolve(beat),
      onEnd: (outcome) => this.endCombat(outcome),
      onBeat: (entry) => this.onCombatBeat(entry),
      onRequestTarget: (attackKind) => { this.combatTargeting = { mode: 'attack', attackKind }; },
      onRequestMove: () => { this.combatTargeting = { mode: 'move' }; },
      onTargetMove: () => this.previewCombatTargeting(),
      onTargetCommit: () => this.commitCombatTargeting(),
    });
    this.combat.setPortraitSources(sources);
    this.combat.start(controller);
    // Camera: the player gets a FREE tactical camera (pan/orbit/zoom, so they can pull
    // back to flee); a player-absent fight keeps the cinematic centroid framing.
    this.combatSpectator = !playerInvolved;
    if (this.combatSpectator) {
      this.frameCombatCamera();
    } else if (this.cameraSystem && this.combatEnc) {
      const live = this.combatEnc.getState().combatants.filter((x) => x.alive && !x.removed);
      const ctr = centroidOf(live.map((x) => x.pos));
      this.cameraSystem.enterFreeMode(new Vector3(ctr.x, 0, ctr.z), GameWorldScene.COMBAT_CAMERA_RADIUS + 6);
    }
  }

  /** Free-camera controls during combat: arrows/WASD pan, Z/C orbit (wheel zooms via CameraSystem). */
  /* istanbul ignore next — browser-only camera input */
  private handleCombatCameraKeys(dt: number): void {
    if (!this.inputSystem || !this.cameraSystem || this.combatSpectator) return;
    if (this.inputSystem.isActionActive('camera.rotateLeft')) this.cameraSystem.orbit(KEY_ORBIT_SPEED * dt);
    if (this.inputSystem.isActionActive('camera.rotateRight')) this.cameraSystem.orbit(-KEY_ORBIT_SPEED * dt);
    const step = GameWorldScene.COMBAT_PAN_SPEED * dt;
    let forward = 0;
    let right = 0;
    if (this.inputSystem.isActionActive('move.forward')) forward += step;
    if (this.inputSystem.isActionActive('move.backward')) forward -= step;
    if (this.inputSystem.isActionActive('move.right')) right += step;
    if (this.inputSystem.isActionActive('move.left')) right -= step;
    if (forward !== 0 || right !== 0) this.cameraSystem.panFree(forward, right);
  }

  /** Pace AI / spectator turns one per COMBAT_TURN_DELAY; the player's own turn waits for input. */
  /* istanbul ignore next — browser-only turn driver */
  private tickCombat(dt: number): void {
    const c = this.combat?.getController();
    if (!c || c.isOver()) return;
    const standing = c.getState().combatants.some((x) => x.isPlayer && !x.removed && x.alive);
    if (standing && c.isPlayerTurn()) { this.combatTurnAccum = 0; return; } // wait for the player's click
    this.combatTurnAccum += dt;
    if (this.combatTurnAccum < GameWorldScene.COMBAT_TURN_DELAY) return;
    this.combatTurnAccum = 0;
    this.combat?.renderEntries(c.stepNextAiTurn());
    // Only the spectator (cinematic) camera re-centres; the player's free camera stays put.
    if (this.combatSpectator) this.frameCombatCamera();
  }

  /** Frame the combat camera on the centroid of the still-standing combatants. */
  /* istanbul ignore next — browser-only camera */
  private frameCombatCamera(): void {
    if (!this.cameraSystem || !this.combatEnc) return;
    const live = this.combatEnc.getState().combatants.filter((c) => c.alive && !c.removed);
    if (live.length === 0) return;
    const c = centroidOf(live.map((x) => x.pos));
    if (!this.combatFocus) this.combatFocus = new TransformNode('combat-focus', this.babylonScene);
    this.combatFocus.position.set(c.x, 0, c.z);
    this.cameraSystem.enterConversationMode(this.combatFocus, GameWorldScene.COMBAT_CAMERA_RADIUS);
  }

  /** Per-applied-beat hook: play the animation, then apply friendly-fire defection. */
  /* istanbul ignore next — browser-only */
  private onCombatBeat(entry: CombatLogEntry): void {
    this.animateCombatBeat(entry);
    this.applyFriendlyFire(entry);
  }

  /** Intentionally striking an ally worsens its disposition and may flip it against you. */
  /* istanbul ignore next — browser-only */
  private applyFriendlyFire(entry: CombatLogEntry): void {
    if (!entry.friendlyFire || !entry.isPlayerActor || !entry.targetId) return;
    if (entry.kind !== 'hit' && entry.kind !== 'death') return;
    const agent = this.npcManager?.getAgent(entry.targetId);
    if (!agent) return;
    const { disposition, defects } = friendlyFireDefection(agent.getDisposition());
    agent.setDisposition(disposition);
    if (defects && this.combatEnc && this.combatPlayerSide) {
      const opposing = this.combatPlayerSide === SIDE_INITIATOR ? SIDE_TARGET : SIDE_INITIATOR;
      this.combatEnc.setSide(entry.targetId, opposing); // the betrayed ally turns on the player
    }
  }

  /** Play attack/hit/dodge/death animations on the world meshes for a resolved combat beat. */
  /* istanbul ignore next — browser-only animation playback */
  private animateCombatBeat(entry: CombatLogEntry): void {
    // Movement: walk the avatar along the routed polyline to its new position.
    if (entry.kind === 'move' && entry.path && entry.path.length > 1) {
      this.walkAlongPath(entry.actorId, entry.path);
      return;
    }
    // NOTE: cover/hunker have NO pose and a miss has NO dodge for now — the Quaternius
    // rig lacks block/crouch clips and Roll read badly. Proper block + crouch clips
    // need a rig retarget (future work; see ADR-0019 deferred list).
    if (!entry.attackKind || !(entry.kind === 'hit' || entry.kind === 'miss' || entry.kind === 'death')) return;
    const dead = entry.kind === 'death';
    const landed = entry.kind === 'hit' || dead;
    // Turn the fighters to face each other before the blow (attacker → target; the
    // struck one turns back toward the attacker so HitRecieve/Death reads right).
    const attackerNode = this.combatNode(entry.actorId);
    const targetNode = entry.targetId ? this.combatNode(entry.targetId) : null;
    if (attackerNode && targetNode) {
      this.faceToward(attackerNode, targetNode.position);
      if (landed) this.faceToward(targetNode, attackerNode.position);
    }
    // Target reacts ONLY when actually hit (HitRecieve / Death). Misses: no reaction.
    if (landed && entry.targetId) {
      this.playCombatClip(entry.targetId, dead ? 'death' : 'hit', dead);
    }
    // Attacker: melee lunges in, strikes, and retreats; ranged shoots in place.
    if (entry.attackKind === 'melee' && entry.targetId) {
      this.meleeLunge(entry.actorId, entry.targetId);
    } else {
      this.playCombatClip(entry.actorId, combatClipFor(entry.attackKind), false);
    }
  }

  /** Yaw `node` to face `targetPos` on the ground (avatars face +Z at rotation.y = 0). */
  /* istanbul ignore next — browser-only */
  private faceToward(node: TransformNode, targetPos: Vector3): void {
    const dx = targetPos.x - node.position.x;
    const dz = targetPos.z - node.position.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    node.rotation.y = Math.atan2(dx, dz);
  }

  /** The world node for a combatant id (player root or NPC holder). */
  /* istanbul ignore next — browser-only */
  private combatNode(actorId: string): TransformNode | null {
    return actorId === 'player' ? (this.player?.getRoot() ?? null) : (this.npcHolderById.get(actorId) ?? null);
  }

  /** Melee choreography: dash ~1 m toward the target, punch, then slide back to origin. */
  /* istanbul ignore next — browser-only animation playback */
  private meleeLunge(attackerId: string, targetId: string): void {
    const attacker = this.combatNode(attackerId);
    const target = this.combatNode(targetId);
    if (!attacker || !target) { this.playCombatClip(attackerId, 'punch', false); return; }
    const origin = attacker.position.clone();
    const flat = target.position.subtract(attacker.position);
    flat.y = 0;
    const gap = flat.length();
    const step = gap > 0.001 ? Math.min(1, Math.max(0.3, gap - 1)) : 0;
    const lungeTo = gap > 0.001 ? origin.add(flat.normalize().scale(step)) : origin;
    // CONSTANT loop mode = absolute keyframe values. (RELATIVE/0 offsets relative to
    // the current position and ACCUMULATES, drifting the hero away each strike.)
    const ABS = Animation.ANIMATIONLOOPMODE_CONSTANT;
    Animation.CreateAndStartAnimation('lunge-in', attacker, 'position', 60, 7, origin, lungeTo, ABS);
    this.playCombatClip(attackerId, 'punch', false, () => {
      Animation.CreateAndStartAnimation('lunge-out', attacker, 'position', 60, 9, attacker.position.clone(), origin, ABS);
    });
  }

  /** One-shot a named avatar clip on a combatant's mesh, returning to idle (unless `hold`). */
  /* istanbul ignore next — browser-only animation playback */
  private playCombatClip(actorId: string, key: string, hold: boolean, onEnd?: () => void): void {
    const groups = actorId === 'player'
      ? (this.player?.getAnimationGroups() ?? [])
      : (this.npcGroupsById.get(actorId) ?? []);
    const clip = groups.find((g) => g.name.toLowerCase() === key);
    if (!clip) { onEnd?.(); return; }
    const idle = groups.find((g) => g.name.toLowerCase() === 'idle') ?? null;
    groups.forEach((g) => g.stop());
    clip.start(false);
    if (!hold) {
      clip.onAnimationEndObservable.addOnce(() => { idle?.start(true); onEnd?.(); });
    }
  }

  /**
   * Hover preview, driven by the overlay scrim's pointer-move:
   *  - move mode: routed on-ground trail (green affordable / red over the AP budget);
   *  - attack mode: a ring under the combatant nearest the cursor — GREEN when it is
   *    within melee range (strikeable), RED when out of range.
   */
  /* istanbul ignore next — browser-only pointer/targeting */
  private previewCombatTargeting(): void {
    const c = this.combat?.getController();
    const targeting = this.combatTargeting;
    if (!targeting || !c || !c.isPlayerTurn()) {
      this.clearTargetingVisuals();
      return;
    }
    const me = c.getState().combatants.find((x) => x.isPlayer);
    const to = this.groundPointFromPointer();

    if (targeting.mode === 'move') {
      if (this.targetRing) { this.targetRing.dispose(); this.targetRing = null; }
      const path = me && to && this.combatPathfind ? this.combatPathfind(me.pos, to) : null;
      const reachable = !!path && !!this.combatTuning && !!me && path.meters > 0 && moveApCost(path.meters, this.combatTuning) <= me.ap;
      this.drawMoveTrail(path, reachable);
      return;
    }

    // Attack mode: ring the combatant nearest the cursor; green if in melee range.
    if (this.moveTrail) { this.moveTrail.dispose(); this.moveTrail = null; }
    const cand = me && to ? this.combatantNearGround(to) : null;
    const inRange = !!cand && !!me && distance2(me.pos, cand.pos) <= MELEE_RANGE;
    this.drawTargetRing(cand ? cand.pos : null, inRange);
  }

  /**
   * Commit the active targeting on a click in the battlefield (scrim pointer-up):
   *  - move → walk to a reachable ground point;
   *  - attack → strike the clicked combatant when it is within melee range.
   * The action buttons consume their own clicks, so this only fires for world clicks.
   */
  /* istanbul ignore next — browser-only pointer/targeting */
  private commitCombatTargeting(): void {
    const targeting = this.combatTargeting;
    const c = this.combat?.getController();
    if (!targeting || !c || !c.isPlayerTurn() || c.isOver()) return;
    const me = c.getState().combatants.find((x) => x.isPlayer);
    if (!me) return;

    if (targeting.mode === 'move') {
      const to = this.groundPointFromPointer();
      const path = to && this.combatPathfind ? this.combatPathfind(me.pos, to) : null;
      const reachable = !!path && !!this.combatTuning && path.meters > 0 && moveApCost(path.meters, this.combatTuning) <= me.ap;
      if (reachable && to) {
        this.clearCombatTargeting();
        this.combat?.submitPlayerAction({ type: 'move', to });
      }
      return;
    }

    // Attack: the combatant nearest the cursor's ground point is the target (robust —
    // no fragile mesh pick); strike only if it is within melee range (≤1 m).
    const to = this.groundPointFromPointer();
    const cand = to ? this.combatantNearGround(to) : null;
    if (!cand || distance2(me.pos, cand.pos) > MELEE_RANGE) return; // none / out of range → ignore
    this.clearCombatTargeting();
    this.combat?.submitPlayerAction({ type: 'attack', attackKind: targeting.attackKind, targetId: cand.id });
  }

  /** The non-player combatant whose position is nearest the ground point, within the click radius. */
  /* istanbul ignore next — browser-only picking */
  private combatantNearGround(point: Point2): { id: string; pos: Point2 } | null {
    const c = this.combat?.getController();
    if (!c) return null;
    let best: { id: string; pos: Point2 } | null = null;
    let bestD = GameWorldScene.TARGET_PICK_RADIUS;
    for (const cb of c.getState().combatants) {
      if (cb.isPlayer || !cb.alive || cb.removed) continue; // self / downed are not targets
      const d = distance2(point, cb.pos);
      if (d < bestD) { bestD = d; best = { id: cb.id, pos: cb.pos }; }
    }
    return best;
  }

  /** Ground-plane (y=0) point under the cursor, or null if the ray is parallel. */
  /* istanbul ignore next — browser-only picking */
  private groundPointFromPointer(): Point2 | null {
    // Use the pointer camera (the main combat camera), NOT scene.activeCamera: rendering
    // the portrait strip via scene.activeCameras leaves activeCamera on the last portrait
    // camera, which would cast the ground ray from the wrong POV.
    const cam = this.babylonScene.cameraToUseForPointers ?? this.babylonScene.activeCamera;
    if (!cam) return null;
    const ray = this.babylonScene.createPickingRay(this.babylonScene.pointerX, this.babylonScene.pointerY, Matrix.Identity(), cam);
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const tHit = -ray.origin.y / ray.direction.y;
    if (tHit < 0) return null;
    const p = ray.origin.add(ray.direction.scale(tHit));
    return { x: p.x, z: p.z };
  }

  /** Draw/replace the hover ring under a target combatant (green = strikeable, red = out of range). */
  /* istanbul ignore next — browser-only rendering */
  private drawTargetRing(center: Point2 | null, valid: boolean): void {
    this.targetRing?.dispose();
    this.targetRing = null;
    if (!center) return;
    const pts: Vector3[] = [];
    const r = 0.7;
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new Vector3(center.x + Math.cos(a) * r, 0.12, center.z + Math.sin(a) * r));
    }
    const ring = MeshBuilder.CreateLines('combat-target-ring', { points: pts }, this.babylonScene);
    ring.color = valid ? Color3.Green() : Color3.Red();
    ring.isPickable = false;
    this.targetRing = ring;
  }

  /** Dispose both targeting visuals (trail + ring). */
  /* istanbul ignore next — browser-only rendering */
  private clearTargetingVisuals(): void {
    this.moveTrail?.dispose();
    this.moveTrail = null;
    this.targetRing?.dispose();
    this.targetRing = null;
  }

  /** Draw/replace the on-ground move trail; green when affordable, red when over budget. */
  /* istanbul ignore next — browser-only rendering */
  private drawMoveTrail(path: { points: Point2[] } | null, reachable: boolean): void {
    this.moveTrail?.dispose();
    this.moveTrail = null;
    if (!path || path.points.length < 2) return;
    const pts = path.points.map((p) => new Vector3(p.x, 0.15, p.z));
    const line = MeshBuilder.CreateLines('combat-move-trail', { points: pts }, this.babylonScene);
    line.color = reachable ? Color3.Green() : Color3.Red();
    line.isPickable = false;
    this.moveTrail = line;
  }

  /** Leave targeting mode and clear the trail. */
  /* istanbul ignore next — browser-only */
  private clearCombatTargeting(): void {
    this.combatTargeting = null;
    this.clearTargetingVisuals();
  }

  /** Walk an avatar along the routed polyline (walk clip + facing), then idle. */
  /* istanbul ignore next — browser-only animation playback */
  private walkAlongPath(actorId: string, path: Point2[]): void {
    const node = this.combatNode(actorId);
    if (!node || path.length < 2) return;
    const groups = actorId === 'player'
      ? (this.player?.getAnimationGroups() ?? [])
      : (this.npcGroupsById.get(actorId) ?? []);
    const y = node.position.y;
    const keys: { frame: number; value: Vector3 }[] = [{ frame: 0, value: new Vector3(path[0]!.x, y, path[0]!.z) }];
    let frame = 0;
    const fps = 60;
    const speed = 3.5; // metres/second, matches the walk cadence
    for (let i = 1; i < path.length; i++) {
      const seg = distance2(path[i - 1]!, path[i]!);
      frame += Math.max(1, (seg / speed) * fps);
      keys.push({ frame, value: new Vector3(path[i]!.x, y, path[i]!.z) });
    }
    // Face the final travel direction (avatars face +Z at rotation.y = 0).
    const last = path[path.length - 1]!;
    const prev = path[path.length - 2]!;
    node.rotation.y = Math.atan2(last.x - prev.x, last.z - prev.z);

    const anim = new Animation('combat-walk', 'position', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    anim.setKeys(keys);
    const walk = groups.find((g) => g.name.toLowerCase() === 'walk') ?? null;
    const idle = groups.find((g) => g.name.toLowerCase() === 'idle') ?? null;
    groups.forEach((g) => g.stop());
    walk?.start(true);
    this.babylonScene.beginDirectAnimation(node, [anim], 0, frame, false, 1, () => {
      walk?.stop();
      idle?.start(true);
    });
  }

  /** Apply a resolved combat outcome to the world (player HP, defeat, disposition). */
  /* istanbul ignore next — browser-only combat wiring */
  private endCombat(outcome: CombatOutcome): void {
    const state = this.combat?.getController()?.getState();
    const me = state?.combatants.find((c) => c.isPlayer);
    if (me) {
      this.playerHealthState = { current: me.hp.current, max: me.hp.max };
      this.player?.setHealthState(this.playerHealthState);
    }
    // Relax every surviving enemy (a different side than the player) on a win/flee/resolve.
    if (outcome !== 'player_lost' && state && this.combatPlayerSide) {
      for (const c of state.combatants) {
        if (!c.isPlayer && c.side !== this.combatPlayerSide && c.alive) {
          this.npcManager?.getAgent(c.id)?.setDisposition('wary');
        }
      }
    }
    this.combat?.close();
    // Tear down targeting + encounter state.
    this.clearCombatTargeting();
    this.combatPathfind = null;
    this.combatTuning = null;
    this.combatEnc = null;
    this.combatPlayerSide = null;
    this.combatTurnAccum = 0;
    // Restore the on-foot camera framing (whichever combat mode was active).
    this.cameraSystem?.exitFreeMode();
    this.cameraSystem?.exitConversationMode();
    this.combatSpectator = false;
    this.combatFocus?.dispose();
    this.combatFocus = null;
    // On a loss the player HP is now 0 → checkGameOver ends the run next frame.
  }

  /** A credible combat sheet for an NPC (no per-NPC stats yet — a street-tough block). */
  /* istanbul ignore next — browser-only combat wiring */
  private enemyStatsFor(_agent: NPCAgent): CharacterStats {
    const s = createDefaultStats();
    s.attributes.destreza = 45;
    s.attributes.forca = 40;
    s.skills.armas_de_fogo = 45;
    s.skills.combate_corpo_a_corpo = 40;
    s.skills.percepcao = 35;
    return s;
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

    // A hostile action aimed at a present NPC worsens its disposition (F5 path);
    // once it turns hostile, the turn-based duel begins (consumes the attack stub).
    if (agent && cls.hostile) {
      const handled = await this.handleHostileAction(agent, message, cls);
      if (handled) return true;
    }

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

  /**
   * The player struck/threatened a present NPC. Resolve the strike for flavour,
   * worsen the NPC's disposition; if that pushed it to hostile, start the duel
   * (the F5 attack path → turn-based combat). Otherwise the NPC reacts with its
   * ultimatum. Always returns true (the action is fully handled here).
   */
  private async handleHostileAction(agent: NPCAgent, message: string, cls: ActionClassification): Promise<boolean> {
    if (!this.dialog || !this.npcManager || !this.player) return false;
    const value = checkValue(this.playerStats, cls.skillId ?? 'combate_corpo_a_corpo', cls.attribute ?? 'forca');
    const result = resolveCheck({ value, opponent: cls.difficulty });
    if (result.success && cls.skillId) {
      this.playerStats = applySkillUse(this.playerStats, cls.skillId, SettingsService.get('skillGainMultiplier'));
    }
    agent.onHostilePlayerAction();
    const narration = await this.npcManager.narrateOutcome(message, result.success, languageName(getLocale()));
    this.dialog.addNarrationLine(narration || (result.success ? 'Your blow lands hard.' : 'They reel back, snarling.'));

    if (agent.shouldInitiateCombat(true)) {
      this.dialog.close();
      this.startCombat(agent.definition.id);
      return true;
    }
    // Not yet hostile — the NPC reacts (its ultimatum) via a normal turn.
    await this.streamNpcReply(agent, this.buildWorldSnapshot(agent.distanceTo(this.player.getPosition())), message);
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
  getGameOverMenu(): GameOverMenu | null { return this.gameOverMenu; }
  getCombat(): CombatOverlay | null { return this.combat; }
  getHud(): WorldHud | null { return this.hud; }
}
