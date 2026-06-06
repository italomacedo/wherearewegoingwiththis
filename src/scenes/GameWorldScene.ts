import {
  Engine, Color4, Color3, Vector3, Matrix, AbstractMesh, TransformNode, MeshBuilder,
  PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, AnimationGroup, Animation, LinesMesh,
  SpotLight, StandardMaterial,
} from '@babylonjs/core';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SceneManager } from '@core/SceneManager';
import {
  SaveService, VehicleSaveState, DEFAULT_PLAYER_HEALTH, DEFAULT_VEHICLE_STATE,
} from '@systems/SaveService';
import { HealthState, describeCondition } from '@entities/Health';
import { Hunger } from '@entities/Hunger';
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
import { CharacterAppearance, DEFAULT_APPEARANCE, applyArmorOverlay } from '@entities/CharacterData';
import { Inventory, defaultInventoryState } from '@entities/Inventory';
import { weaponProfile, itemDef, isMeleeWeapon, isFirearm, armorOverlayParts, itemValue } from '@entities/items/ItemCatalog';
import {
  resolveSkillAction, SkillActionInput, SkillTargetInfo, SkillMutation, BlockReason,
  SKILL_ACTION_RADIUS,
} from '@systems/skills/SkillActions';
import { craftTargetFromText, scrapCostFor, sabotageDamage } from '@systems/skills/Crafting';
import {
  canTrade, canOfferMission, priceFor, sellableItems, creditBalance, payCredits, grantCredits,
} from '@systems/economy/Economy';
import {
  Mission, RewardOffer, completeMission,
} from '@systems/economy/Missions';
import { InventoryOverlay } from '@systems/InventoryOverlay';
import { HeldItemRig, resolveAttachWith, boneFor, AttachOverrides, flashlightActive, holdsAimPose } from '@systems/HeldItems';
import { AdjustOverlay } from '@systems/AdjustOverlay';
import { ActionRibbon } from '@systems/ActionRibbon';
import { AimTarget, nearestToPoint } from '@systems/SurpriseTargeting';
import { createMuzzleFlash } from '@systems/ParticleEffects';
import type { AudioManager } from '@systems/AudioManager';
import type { TTSService } from '@systems/TTSService';
import { sfxForBeat, footstepInterval } from '@systems/SfxCatalog';
import { EquipSlot, ItemAttach } from '@entities/items/ItemCatalog';
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
import { WorldSnapshot, PromptBuilder, NearbyNpcSnapshot } from '@systems/npc/PromptBuilder';
import { resolveAddressee, AddressCandidate, stripShout } from '@systems/npc/Addressing';
import { hasEmote, isCheckTimeEmote, isSelfExamEmote, narrateTime, ActionClassification } from '@systems/npc/EmoteIntent';
// Fase 21 unified action pipeline (verbal path wired here; emote + autonomy migration in 21G).
import { PlayerActor, NpcActor } from '@systems/actions/Actor';
import { resolveAction, ResolveOptions } from '@systems/actions/Resolver';
import { applyMutations, ApplierContext } from '@systems/actions/Applier';
import {
  CharacterStats, AttributeId, createDefaultStats, checkValue, applySkillUse,
  detectPerkPointGrants, grantPerkPoints,
} from '@entities/CharacterStats';
import { CharacterSheetOverlay } from '@systems/CharacterSheetOverlay';
import { PdaOverlay } from '@systems/PdaOverlay';
import { PdaEntry, upsertPdaEntry } from '@systems/pda/Pda';
import { resolveCheck } from '@systems/SkillCheck';
import { t, getLocale, languageName } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';
import { CombatOverlay } from '@systems/combat/CombatOverlay';
import { CombatController, CombatLogEntry } from '@systems/combat/CombatController';
import { combatClipFor, attackClipFor, CombatClipState, genderOfOutfit } from '@assets/AvatarMeshCatalog';
import { CombatEncounter, CombatantInit, CombatOutcome } from '@systems/combat/CombatEncounter';
import {
  combatTuningFromSettings, CombatTuning, Point2, Pathfinder,
  distance2, moveApCost, MELEE_RANGE, centroidOf, targetRangeFor,
} from '@systems/combat/CombatMath';
import { buildWalkGrid, gridPathfinder } from '@systems/combat/CombatMovement';
import { recruitSides, RecruitParticipant, SIDE_INITIATOR, SIDE_TARGET } from '@systems/combat/CombatRecruiter';
import { COMBAT_OBSTACLES, COMBAT_BOUNDS } from '@assets/WorldAssetCatalog';
import { WorldStreamer } from '@systems/world/WorldStreamer';
import { TileScenery } from '@systems/world/TileScenery';
import { tileOf, tileKey, worldFloorBox, worldBounds, neighbors, type TileCoord } from '@systems/world/WorldGrid';
import { GroundItem, addGroundItem, removeGroundItemAt, nearestGroundItemIndex } from '@systems/world/GroundItems';
import { generateTile } from '@assets/world/ThemeRegistry';
import { AssetCache, babylonContainerLoader } from '@systems/world/AssetCache';

/** Max seconds a single frame may advance the simulation. */
export const MAX_FRAME_DELTA = 0.1;

/**
 * Convert an engine frame delta (ms) to seconds, CAPPED. When the window is
 * backgrounded (Alt+Tab / minimise) the render loop pauses, and the next
 * `getDeltaTime()` returns the whole elapsed gap (seconds). Feeding that into the
 * dt-integrated physics produced a multi-second leap: the abandoned nave's
 * free-fall velocity (gravity × dt) blew past the crash threshold and it exploded
 * while parked; the hero could likewise be launched. Capping any single frame
 * keeps the sim stable on focus loss. Pure + tested.
 */
export function clampFrameDelta(deltaMs: number, maxSeconds = MAX_FRAME_DELTA): number {
  const s = deltaMs / 1000;
  if (!(s > 0)) return 0;            // NaN / negative / zero → no advance
  return s > maxSeconds ? maxSeconds : s;
}

/**
 * Capsule dimensions from a holder's bbox extents (x,y,z), GUARDED. A skinned
 * mesh can report NaN/Infinity bounds for a frame mid modular-rebind; feeding that
 * to a Havok capsule makes `{height:NaN, radius:NaN}`, and Havok's WASM `abort()`s
 * the WHOLE process with no JS stack (the "main PID gone, no crash handler" deaths).
 * `Math.max(0.8, NaN)` is itself NaN, so the old floor did NOT protect us. Fall back
 * to a human-sized default on bad bounds and clamp to sane limits. Pure + tested.
 */
export function safeCapsuleDims(sx: number, sy: number, sz: number): { height: number; radius: number } {
  if (!(Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz))) {
    return { height: 1.8, radius: 0.3 }; // degenerate/NaN bbox → safe human default
  }
  return {
    height: Math.min(5, Math.max(0.8, sy)),
    radius: Math.min(2, Math.max(0.2, Math.min(sx, sz) * 0.5)),
  };
}

export class GameWorldScene extends BaseScene {
  /** Setting used for the ambient "react to surroundings" narration (global chat). */
  private static readonly SURROUNDINGS =
    'a rainy, neon-lit downtown street lined with shuttered shopfronts and a vendor stall';

  /** Attribute used for a deterministic action when the classifier names neither
   *  a skill nor an attribute (rare fallback). */
  private static readonly DEFAULT_CHECK_ATTRIBUTE: AttributeId = 'forca';

  private zoneManager: ZoneManager | null = null;
  private zone: WorldZone | null = null;
  /** Seamless 3×3 tile streamer for the procedural mosaic (Fase 17). */
  private worldStreamer: WorldStreamer | null = null;
  /** Live procedural tile content keyed by "tx,tz" (tile (0,0) = the static zone). */
  private tileScenery = new Map<string, TileScenery>();
  /** NPC ids spawned for each streamed tile (for selective despawn on unload). */
  private tileNpcIds = new Map<string, string[]>();
  /** Shared GLB cache: parse each model once, instance clones per tile (Fase 17H). */
  private assetCache: AssetCache | null = null;
  /** Tiles (within the NPC radius) that currently have their NPCs spawned. */
  private npcTiles = new Set<string>();
  /** The authored hub NPC ids (tile 0,0): awake only while the player is in (0,0). */
  private zoneNpcIds: string[] = [];
  /** Time-sliced NPC-visual build queue (≤1 heavy avatar assemble per frame). */
  private npcSpawnQueue: Array<{ key: string; def: NPCDefinition }> = [];
  /** Guard so only one scenery-load pump runs at a time (serializes GLB work). */
  private pumpingTiles = false;
  /** Scenery preload radius (5×5) vs NPC radius (3×3). */
  private static readonly SCENERY_RADIUS = 2;
  private static readonly NPC_RADIUS = 1;
  /** Prop instantiations per scenery-pump (time-slice → no burst hitch). */
  private static readonly TILE_LOAD_BUDGET = 2;
  /** How close (metres) the player must be to pick up a dropped pile (Fase 18). */
  private static readonly PICKUP_RADIUS = 2;
  /** Only NPCs within this radius of a fight can be recruited into it — keeps the
   * streamed world's neighbouring-tile NPCs out of a local brawl (Fase 18). */
  private static readonly COMBAT_RECRUIT_RADIUS = 30;
  /** World seed for deterministic tile generation (from the save; Phase D persists it). */
  private worldSeed = 1;
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
  private inventoryOverlay: InventoryOverlay | null = null;
  private characterSheetOverlay: CharacterSheetOverlay | null = null;
  private pdaOverlay: PdaOverlay | null = null;
  /** Intel dossiers gathered by scanning/hacking NPCs (Fase 20 PDA), persisted. */
  private pda: PdaEntry[] = [];
  /** The weapon a pending `craft` action will produce (resolved from the emote text). */
  private skillCraftTarget = 'knife';
  /** Items dropped into the world (Fase 18), persisted in SaveGame.groundItems. */
  private groundItems: GroundItem[] = [];
  /** Live pickup markers, keyed by their GroundItem (browser-only). */
  private groundMarkers = new Map<GroundItem, AbstractMesh>();
  /** Cached AudioManager (resolved lazily) + footstep cadence accumulator. */
  private audio: AudioManager | null = null;
  private tts: TTSService | null = null;
  private footstepTimer = 0;
  /** Last frame's fall-damage reading, to fire the landing thud once per impact. */
  private prevFallDamage = 0;
  /** Tracks the nave's last destroyed state so the explosion SFX fires once. */
  private naveWasDestroyed = false;
  /** Visible held props on the hero (main-hand weapon/flashlight/firearm + backpack). */
  private playerHeldRig: HeldItemRig | null = null;
  /** Visible held weapon on each NPC avatar (keyed by NPC id). */
  private npcHeldRigById = new Map<string, HeldItemRig>();
  /** Per-item held-prop transform overrides (Adjust tool), persisted in the save. */
  private heldAttach: AttachOverrides = {};
  /** Held-prop calibration overlay (Adjust tool). */
  private adjustOverlay: AdjustOverlay | null = null;
  private actionRibbon: ActionRibbon | null = null;
  /** Spotlight projected forward while the flashlight is held (auto-on). */
  private flashlightLight: SpotLight | null = null;
  private combat: CombatOverlay | null = null;
  private gameOverMenu: GameOverMenu | null = null;
  private combatFocus: TransformNode | null = null;
  private static readonly COMBAT_CAMERA_RADIUS = 9;
  // ─── Tactical combat targeting (Fase 8A, browser-only) ───────────────────────
  /** Routed pathfinder + tuning for the active encounter (set in startCombat). */
  private combatPathfind: Pathfinder | null = null;
  private combatTuning: CombatTuning | null = null;
  /** Equipped weapon id per combatant (drives the melee swing clip: slash vs punch). */
  private combatWeaponId = new Map<string, string | null>();
  /** Current player targeting mode (Attack picks a foe avatar; Move picks ground). */
  private combatTargeting:
    | { mode: 'attack'; attackKind: 'melee' | 'ranged' | undefined }
    | { mode: 'move' }
    | null = null;
  /** Out-of-combat surprise-attack aiming (from the action ribbon). */
  private surpriseTargeting: { attackKind: 'melee' | 'ranged' } | null = null;
  private surpriseClickHandler: ((e: PointerEvent) => void) | null = null;
  private moveTrail: LinesMesh | null = null;
  /** Hover highlight under the combatant the cursor is nearest, during attack targeting. */
  private targetRing: LinesMesh | null = null;
  /** Click tolerance (m): the cursor's ground point must land within this of a combatant. */
  private static readonly TARGET_PICK_RADIUS = 2.0;
  /**
   * Reach (m) for committing an OUT-OF-COMBAT melee surprise attack. More forgiving
   * than the in-combat MELEE_RANGE (1 m): collision capsules keep the player from
   * standing within 1 m of an NPC, so a 1 m gate made melee ambush impossible to
   * commit. The lunge into adjacency happens at combat start (see beginCombat).
   */
  private static readonly SURPRISE_MELEE_REACH = 2.5;
  /** Active N-way encounter + the player's side (for friendly-fire defection). */
  private combatEnc: CombatEncounter | null = null;
  private combatPlayerSide: string | null = null;
  /** Accumulated seconds toward the next paced AI/spectator turn. */
  private combatTurnAccum = 0;
  private static readonly COMBAT_TURN_DELAY = 0.7; // seconds between AI turns (live pacing)
  /** True for a player-absent fight (cinematic centroid camera); else free RTS camera. */
  private combatSpectator = false;
  /** Set when a sabotaged NPC's gear blew at combat start (Fase 20H) — narrated once. */
  private combatSabotageNote: string | null = null;
  private static readonly COMBAT_PAN_SPEED = 14; // metres/second for free-camera panning
  /**
   * Desired facing yaw per combatant during combat, re-asserted every combat frame
   * so an idle clip can't snap the avatar back to its modelled forward (Bug A).
   */
  private combatFacing = new Map<string, number>();
  /** Combatants currently mid-walk — excluded from the per-frame facing pin so the
   *  walk's own per-segment rotation isn't fought. */
  private combatWalking = new Set<string>();
  private hud: WorldHud | null = null;
  private npcMeshes: AbstractMesh[] = [];
  private npcVisuals: AssembledCharacter[] = [];
  private npcHolders: TransformNode[] = [];
  private npcHolderById = new Map<string, TransformNode>();
  /** Full AnimationGroup set per NPC (idle/walk/run/interact + combat clips) for combat playback. */
  private npcGroupsById = new Map<string, AnimationGroup[]>();
  private npcAnchors: AbstractMesh[] = [];
  // ─── Autonomy (Fase 5) ──────────────────────────────────────────────────────
  private autonomyQueue: ClaudeCallQueue<AutonomyJob> | null = null;
  private autonomyAccumMs = 0;
  /**
   * True while a background deliberation's Claude CLI call is in flight. Caps
   * autonomous `claude.exe` spawns to ONE at a time — with the procedural NPCs of
   * Fase 17 the unguarded ~1 Hz dispatch piled up concurrent subprocesses and took
   * down the Electron main process (Lesson 34 family). Player turns bypass this.
   */
  private autonomyInFlight = false;
  /**
   * Active walks per NPC id — the SINGLE source of NPC locomotion (gossip + combat
   * both feed this). `points` is a world-space polyline; `onArrive` fires once at the
   * end. `combat` walks suspend the combat facing pin while moving.
   */
  private npcWalks = new Map<string, { points: Vector3[]; i: number; speed: number; combat: boolean; onArrive?: () => void }>();
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
  /**
   * Per-NPC physics CAPSULE parented to the holder — the NPC's own collision "mold"
   * (same shape the hero uses). An ANIMATED body with `disablePreStep=false` tracks the
   * holder automatically, so the collider follows wherever the NPC walks — no separate
   * static box to reposition.
   */
  private npcCapsuleById = new Map<string, { mesh: AbstractMesh; agg: PhysicsAggregate }>();
  private detachInput: (() => void) | null = null;
  private startZoneId = 'mercado_sombras';
  private appearance: CharacterAppearance = DEFAULT_APPEARANCE;
  private npcMemory: NPCMemoryMap = {};
  private playerName = 'Operative';
  private playerStats: CharacterStats = createDefaultStats();
  private playerInventory: Inventory = new Inventory();
  // Economy (Phase 16): active/complete kill-contracts + the last pending in-chat offer.
  private missions: Mission[] = [];
  private pendingTrade: { npcId: string; itemId: string; price: number } | null = null;
  private pendingMission: Mission | null = null;
  private gameTimeSeconds = 0;
  private saveId = '';
  private spawnOverride: Vector3 | null = null;
  private playerHealthState: HealthState = { ...DEFAULT_PLAYER_HEALTH };
  /** Live hunger (slow HP regen battery; persisted). */
  private playerHunger: Hunger = new Hunger();
  /** Edge-trigger for the diegetic "stomach growling" line. */
  private hungerWasLow = false;
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
    // Apply skill-driven stat modifiers (Phase 19C).
    this.player?.setAtletismo(this.playerStats.skills['atletismo'] ?? 10);
    this.playerInventory = Inventory.fromState(session.inventory ?? defaultInventoryState());
    this.heldAttach = session.heldAttach ?? {};
    this.npcMemory = session.npcMemory ?? {};
    this.gameTimeSeconds = session.gameTimeSeconds;
    this.playerHealthState = session.playerHealth ?? { ...DEFAULT_PLAYER_HEALTH };
    this.playerHunger = Hunger.fromState(session.playerHunger);
    this.missions = session.missions ?? [];
    this.groundItems = session.groundItems ?? [];
    this.pda = session.pda ?? [];
    this.vehicleState = session.vehicle ?? {
      health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
    };
    if (session.world?.zone) this.startZoneId = session.world.zone;
    if (typeof session.world?.worldSeed === 'number') this.worldSeed = session.world.worldSeed;
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

    // Merge the memory accumulated from already-DESPAWNED tiles (flushed into
    // this.npcMemory on unload) with the currently-loaded agents' live memory
    // (the latter wins). Without this, saving in the streamed world dropped the
    // memory of every NPC outside the loaded ring (Fase 18).
    const memory = { ...this.npcMemory, ...(this.npcManager?.serializeMemory() ?? {}) };
    const pos = this.player?.getPosition();
    const ct = this.worldStreamer?.getCurrentTile();
    const world = {
      zone: this.startZoneId,
      position: (pos ? [pos.x, pos.y, pos.z] : [0, 0, 0]) as [number, number, number],
      rotation: 0,
      worldSeed: this.worldSeed,
      currentTile: (ct ? [ct.tx, ct.tz] : [0, 0]) as [number, number],
    };
    const playerHealth = this.player?.getHealth().toState() ?? this.playerHealthState;
    const vehicle: VehicleSaveState = this.vehicle
      ? { health: this.vehicle.getHealth().toState(), destroyed: this.vehicle.isDestroyed() }
      : this.vehicleState;

    const character = { ...save.character, stats: this.playerStats };
    const inventory = this.playerInventory.toState();
    const playerHunger = this.playerHunger.toState();
    SaveService.save({
      ...save, character, world, gameTimeSeconds: this.gameTimeSeconds, npcMemory: memory, playerHealth, vehicle, inventory,
      heldAttach: this.heldAttach, playerHunger, missions: this.missions, groundItems: this.groundItems, pda: this.pda,
    });

    const session = ServiceLocator.tryGet<GameSession>('gameSession');
    if (session) {
      session.character = character;
      session.world = world;
      session.npcMemory = memory;
      session.gameTimeSeconds = this.gameTimeSeconds;
      session.playerHealth = playerHealth;
      session.vehicle = vehicle;
      session.inventory = inventory;
      session.heldAttach = this.heldAttach;
      session.playerHunger = playerHunger;
      session.missions = this.missions;
      session.groundItems = this.groundItems;
      session.pda = this.pda;
    }
  }

  async onEnter(): Promise<void> {
    // Pull the active session (set by Character Creator / Load Game). Direct
    // setters still win if a test injected them before onEnter.
    this.adoptSession(ServiceLocator.tryGet<GameSession>('gameSession'));

    // Raise the per-material light cap (Babylon default 4) on EVERY material —
    // including async-loaded world assets (sidewalks/props/buildings) — so the
    // player's flashlight (a 5th+ light alongside the street neons) lights them.
    /* istanbul ignore next — browser-only material wiring */
    if (typeof document !== 'undefined') {
      const lift = (m: unknown) => {
        const mat = m as { maxSimultaneousLights?: number };
        if ((mat.maxSimultaneousLights ?? 4) < 8) mat.maxSimultaneousLights = 8;
      };
      this.babylonScene.materials.forEach(lift);
      this.babylonScene.onNewMaterialAddedObservable.add(lift);
      // A left-click commits an out-of-combat surprise attack (the ribbon entered
      // aiming). Listen on the CANVAS DOM directly — the most reliable signal (the
      // Babylon pointer observable can be swallowed by the camera input). Button 0
      // only, so right/middle-drag camera orbit never fires.
      const canvas = this.engine.getRenderingCanvas();
      if (canvas) {
        this.surpriseClickHandler = (e: PointerEvent) => {
          if (this.surpriseTargeting && e.button === 0) this.commitSurpriseTargeting();
        };
        canvas.addEventListener('pointerdown', this.surpriseClickHandler);
      }
    }

    // Camera FIRST — guarantees the scene always has an active camera so it
    // renders even if a later async step (physics WASM, asset load) is slow.
    this.cameraSystem = new CameraSystem(this.babylonScene);
    ServiceLocator.register('cameraSystem', this.cameraSystem);

    // Give the AudioManager this scene so SFX cues can play.
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.setScene(this.babylonScene);

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
    // Apply skill-driven movement speed (Phase 19C).
    this.player.setAtletismo(this.playerStats.skills['atletismo'] ?? 10);
    ServiceLocator.register('player', this.player);
    this.cameraSystem.setTarget(this.player.getRoot());

    this.player.setHealthState(this.playerHealthState);

    // Show the hero's equipped props (weapon in hand, backpack on the back). The
    // rig no-ops headless (no skeleton); re-synced on every inventory change.
    this.playerHeldRig = new HeldItemRig(
      this.babylonScene, this.player.getSkeleton(), this.player.getRenderParts()[0] ?? null,
    );
    void this.syncPlayerHeldItems();
    // If the save has armor equipped, swap the avatar's regions to match (Phase 15).
    if (this.playerInventory.equippedArmorIds().length > 0) void this.rebuildPlayerArmor();

    // Park a flying motorcycle near the spawn point. Confine it to the closed
    // street (flying out of bounds and back was crashing the game).
    // Confine the nave to the whole mosaic world (Fase 17) — inside the border
    // walls (small margin), since the world is offset, not centred at the origin.
    this.vehicle = new VehicleController(this.babylonScene, { horizontalBounds: worldBounds(2) });
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

    // Inventory overlay (I) — manage the pack; loot a corpse. Freezes the world.
    this.inventoryOverlay = new InventoryOverlay(this.babylonScene);
    this.inventoryOverlay.setHandlers({
      onChange: () => { this.sfx('ui_click'); this.persistSession(); void this.syncPlayerHeldItems(); },
      onHeal: (amount) => { this.player?.getHealth().heal(amount); },
      onFeed: (itemId, amount) => this.eat(itemId, amount),
      // Looting a corpse framed the camera on it (conversation mode); restore the
      // normal follow camera when the overlay closes.
      onClose: () => this.cameraSystem?.exitConversationMode(),
      // "Adjust" button on an equipped row → open the calibration tool for it.
      onAdjust: (itemId, slot) => this.openAdjustFor(itemId, slot),
      // Armor equipped/removed → swap the avatar's region mesh (Phase 15).
      onEquipArmor: () => { void this.rebuildPlayerArmor(); },
      // Dropped item → drop a pickup pile at the player's feet (Fase 18).
      onDrop: (itemId) => this.dropToGround(itemId),
    });

    // Character sheet overlay (K) — attributes, skills, perk tree.
    this.characterSheetOverlay = new CharacterSheetOverlay(this.babylonScene);
    this.characterSheetOverlay.setHandlers({
      onPerkPick: (updated) => {
        this.playerStats = updated;
        this.persistSession();
      },
      onClose: () => { /* nothing to restore — no camera change */ },
    });

    // PDA overlay (Fase 20): intel dossiers gathered by scanning/hacking NPCs.
    this.pdaOverlay = new PdaOverlay(this.babylonScene);
    this.pdaOverlay.setHandlers({ onClose: () => { /* no camera change */ } });

    // Adjust tool (Phase 10.4b): live-calibrate a held prop's attach transform.
    this.adjustOverlay = new AdjustOverlay(this.babylonScene);
    this.adjustOverlay.setHandlers({
      onApply: (slot, attach) => this.adjustPreview(slot, attach),
      onSave: (itemId, _slot, attach) => this.adjustSave(itemId, attach),
      onClose: () => { /* camera unchanged while adjusting — nothing to restore */ },
    });

    // Main action ribbon (Phase 11): Attack Ranged / Melee / Talk / Inventory / Character.
    this.actionRibbon = new ActionRibbon(this.babylonScene);
    this.actionRibbon.setHandlers({
      onAttackRanged: () => { this.sfx('ui_click'); this.enterSurpriseTargeting('ranged'); },
      onAttackMelee: () => { this.sfx('ui_click'); this.enterSurpriseTargeting('melee'); },
      onTalk: () => { this.sfx('ui_click'); this.openTalkFromRibbon(); },
      onInventory: () => { this.sfx('ui_click'); this.inventoryOverlay?.openManage(this.playerInventory); },
      onCharacterSheet: () => { this.sfx('ui_open'); this.characterSheetOverlay?.show(this.playerStats); },
      onPda: () => { this.sfx('ui_open'); this.openPda(); },
    });

    // Turn-based combat overlay (triggered by a hostile NPC's attack intent).
    this.combat = new CombatOverlay(this.babylonScene);

    // Game-over overlay (shown on death): Load last save / Return to main menu.
    this.gameOverMenu = new GameOverMenu(this.babylonScene);
    this.gameOverMenu.setHandlers({
      onLoad: () => this.reloadLastSave(),
      onMainMenu: () => { void ServiceLocator.get<SceneManager>('sceneManager').loadScene('main-menu'); },
    });

    // Colliders: a static box for the nave + a self-following capsule per NPC.
    if (this.babylonScene.isPhysicsEnabled()) {
      /* istanbul ignore next — physics colliders are browser/Electron only */
      this.buildEntityColliders();
    }

    // Seamless world streaming (Fase 17): tile (0,0) is the static downtown zone
    // above; the streamer loads/unloads procedural SCENERY tiles in a 5×5 ring
    // (loaded ahead of a fast nave). NPCs (heavy avatars) only spawn in the inner
    // 3×3 (NPC_RADIUS), and all GLB work streams in a few props/frame (Fase 17H).
    this.assetCache = new AssetCache(babylonContainerLoader(this.babylonScene));
    const spawn = this.player.getPosition();
    this.worldStreamer = new WorldStreamer({
      onLoad: (c) => this.loadTile(c),
      onUnload: (c) => this.unloadTile(c),
      radius: GameWorldScene.SCENERY_RADIUS,
    });
    this.worldStreamer.setCurrent(tileOf(spawn.x, spawn.z));
    this.updateNpcRing(); // seed the inner NPC ring
    this.renderGroundMarkers(); // dropped-item piles persisted in this save (Fase 18)
  }

  /** Build a procedural neighbor tile's SCENERY (skip (0,0); props stream via the pump). */
  /* istanbul ignore next — browser-only scenery; the tile DATA is unit-tested */
  private loadTile(c: TileCoord): void {
    if (c.tx === 0 && c.tz === 0) return; // the static downtown zone owns this tile
    if (typeof document === 'undefined') return; // headless: bookkeeping only
    const key = tileKey(c.tx, c.tz);
    if (this.tileScenery.has(key)) return;
    const gen = generateTile(c.tx, c.tz, this.worldSeed);
    const scenery = new TileScenery(this.babylonScene, gen.coord, gen.props, this.worldSeed, gen.ground, gen.urban);
    scenery.build(); // cheap synchronous frame; props instantiate via pumpTileLoads
    this.tileScenery.set(key, scenery);
  }

  /** Tear down a procedural neighbor tile's scenery + any NPCs still on it. */
  /* istanbul ignore next — browser-only scenery/NPC disposal */
  private unloadTile(c: TileCoord): void {
    if (c.tx === 0 && c.tz === 0) return;
    const key = tileKey(c.tx, c.tz);
    this.tileScenery.get(key)?.dispose();
    this.tileScenery.delete(key);
    this.despawnTileNpcs(key); // belt-and-braces (NPCs normally leave via the r1 ring first)
  }

  /** Instantiate a few queued props per frame across loading tiles (no burst hitch). */
  /* istanbul ignore next — browser-only GLB instancing; AssetCache/budget are unit-tested */
  private async pumpTileLoads(): Promise<void> {
    if (this.pumpingTiles || !this.assetCache) return;
    this.pumpingTiles = true;
    try {
      let budget = GameWorldScene.TILE_LOAD_BUDGET;
      for (const sc of this.tileScenery.values()) {
        while (budget > 0 && sc.pendingCount() > 0) {
          await sc.step(this.assetCache);
          budget -= 1;
        }
        if (budget <= 0) break;
      }
    } finally {
      this.pumpingTiles = false;
    }
  }

  /**
   * Keep NPCs only within the inner 3×3 (NPC_RADIUS): spawn for tiles that just
   * entered the ring, despawn for tiles that left it. Heavy avatar builds are queued
   * (≤1/frame via pumpNpcSpawns). Called on every current-tile change.
   */
  /* istanbul ignore next — browser-only NPC orchestration; pure ring math is tested */
  private updateNpcRing(): void {
    if (typeof document === 'undefined') return; // headless: only the static (0,0) NPCs
    if (!this.worldStreamer || !this.npcManager) return;
    const cur = this.worldStreamer.getCurrentTile();
    const want = new Set(
      neighbors(cur.tx, cur.tz, GameWorldScene.NPC_RADIUS)
        .map((c) => tileKey(c.tx, c.tz))
        .filter((k) => k !== '0,0'), // (0,0) NPCs come from the static setupNPCs
    );
    for (const key of this.npcTiles) {
      if (!want.has(key)) this.despawnTileNpcs(key);
    }
    for (const key of want) {
      if (!this.npcTiles.has(key)) this.enqueueTileNpcs(key);
    }
    this.updateAwakeNpcs();
  }

  /**
   * Only the player's CURRENT quadrant's NPCs run background autonomy; the rest
   * hibernate. Caps the heavyweight `claude` CLI deliberation spawns to one tile's
   * NPCs (Fase 17H crash fix). Hibernating NPCs stay fully interactive on contact.
   */
  /* istanbul ignore next — browser-only; gated by updateNpcRing which headless skips */
  private updateAwakeNpcs(): void {
    if (!this.npcManager || !this.worldStreamer) return;
    const cur = this.worldStreamer.getCurrentTile();
    const curKey = tileKey(cur.tx, cur.tz);
    const awake = new Set<string>(curKey === '0,0' ? this.zoneNpcIds : (this.tileNpcIds.get(curKey) ?? []));
    for (const a of this.npcManager.getAgents()) a.setAwake(awake.has(a.definition.id));
  }

  /** Spawn a tile's logical NPC agents now; queue their (heavy) avatars for the pump. */
  /* istanbul ignore next — browser-only */
  private enqueueTileNpcs(key: string): void {
    if (this.npcTiles.has(key) || !this.npcManager) return;
    const [tx, tz] = key.split(',').map(Number);
    const gen = generateTile(tx, tz, this.worldSeed);
    if (gen.npcDefs.length === 0) { this.npcTiles.add(key); return; }
    this.npcManager.spawnTile(key, gen.npcDefs, this.npcMemory); // logical agents (cheap)
    this.tileNpcIds.set(key, gen.npcDefs.map((d) => d.id));
    for (const def of gen.npcDefs) this.npcSpawnQueue.push({ key, def });
    this.npcTiles.add(key);
  }

  /** Build at most ONE queued NPC avatar per frame (the heaviest streaming cost). */
  /* istanbul ignore next — browser-only avatar build */
  private async pumpNpcSpawns(): Promise<void> {
    const job = this.npcSpawnQueue.shift();
    if (!job || !this.npcTiles.has(job.key)) return; // tile despawned meanwhile
    await this.buildNPCVisual(job.def);
    const holder = this.npcHolderById.get(job.def.id);
    if (holder && this.babylonScene.isPhysicsEnabled()) this.buildNpcCapsule(job.def.id, holder);
    // If reloaded as a corpse: hold the Death pose so it stays down where it fell.
    if (this.npcManager?.getAgent(job.def.id)?.isDefeated()) this.playCombatClip(job.def.id, 'death', true);
  }

  /** Despawn a tile's NPCs (visuals + logical agents) and flush their memory. */
  /* istanbul ignore next — browser-only NPC disposal */
  private despawnTileNpcs(key: string): void {
    if (!this.npcTiles.has(key)) return;
    for (const id of this.tileNpcIds.get(key) ?? []) this.disposeNpcById(id);
    this.tileNpcIds.delete(key);
    this.npcSpawnQueue = this.npcSpawnQueue.filter((j) => j.key !== key); // drop unbuilt
    const result = this.npcManager?.despawnTile(key);
    if (result) Object.assign(this.npcMemory, result.memory);
    this.npcTiles.delete(key);
  }

  /** Dispose one NPC's visual + collider + held rig and forget it (streamed unload). */
  /* istanbul ignore next — browser-only mesh/physics disposal */
  private disposeNpcById(id: string): void {
    const cap = this.npcCapsuleById.get(id);
    if (cap) { cap.agg.dispose(); cap.mesh.dispose(); this.npcCapsuleById.delete(id); }
    this.npcHeldRigById.get(id)?.dispose();
    this.npcHeldRigById.delete(id);
    this.npcHolderById.get(id)?.dispose();
    this.npcHolderById.delete(id);
    this.npcGroupsById.delete(id);
  }

  /** Feed the player's world position to the streamer each frame (browser only). */
  /* istanbul ignore next — thin browser glue over the unit-tested WorldStreamer */
  private streamWorld(): void {
    // Follow whatever the player is actually moving with: the nave while piloting
    // (the hero stays at the mount point), else the hero on foot. Otherwise flying
    // to an adjacent scene never streams its neighbours in.
    const driving = this.vehicle?.isOccupied() ?? false;
    const pos = driving ? this.vehicle?.getPosition() : this.player?.getPosition();
    if (pos && this.worldStreamer) {
      const changed = this.worldStreamer.update(pos.x, pos.z); // diff-streams scenery (5×5)
      if (changed) this.updateNpcRing(); // re-scope NPCs to the inner 3×3
    }
    // Time-slice the heavy GLB/avatar work so streaming never bursts (Fase 17H).
    void this.pumpTileLoads();
    void this.pumpNpcSpawns();
  }

  /* istanbul ignore next — physics colliders are browser/Electron only */
  private buildEntityColliders(): void {
    // NOTE: the nave has NO physics collider. It moves kinematically (computeFlightStep
    // + a downward surface raycast), so a Havok body is unnecessary — and it was the
    // crash vector: hovering at hoverHeight above a rooftop (rooftop-landing probe),
    // pressing descend drove its ANIMATED collider DOWN into the building's static box
    // collider, and a kinematic-vs-static deep penetration aborts Havok natively (no
    // JS log, closes the app). Removing it costs only hero-vs-parked-nave blocking
    // (negligible for an atmospheric flyer). (Fase 17 crash fix.)

    // One big static floor under the WHOLE 24×24 world (no per-tile floor seams) —
    // so the hero never falls through walking onto a streamed neighbor tile. The
    // (0,0) zone keeps its own floor too (harmless overlap).
    const f = worldFloorBox();
    const floor = MeshBuilder.CreateBox('col-world-floor', { width: f.size[0], height: f.size[1], depth: f.size[2] }, this.babylonScene);
    floor.position.set(f.position[0], f.position[1], f.position[2]);
    floor.isVisible = false;
    const floorAgg = new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, this.babylonScene);
    this.entityColliders.push(floor);
    this.entityAggregates.push(floorAgg);

    // The nave is now a DYNAMIC Havok body (collides with buildings, lands on
    // rooftops, blocks the hero) — built here, after the world floor exists.
    this.vehicle?.enableDynamicPhysics();
    this.npcHolderById.forEach((holder, id) => this.buildNpcCapsule(id, holder));
  }

  /**
   * Give an NPC a physics capsule parented to its holder — the character's own
   * collision mold (same shape as the hero). An ANIMATED body with
   * `disablePreStep=false` reads the holder's world transform each step, so the
   * collider follows the NPC wherever it walks with no manual repositioning.
   */
  /* istanbul ignore next — physics colliders are browser/Electron only */
  private buildNpcCapsule(id: string, holder: TransformNode): void {
    holder.computeWorldMatrix(true);
    // Bake the (skinned) child world matrices so the bbox is valid — a stale/NaN one
    // would make a NaN capsule that ABORTS Havok natively (kills the process).
    for (const m of holder.getChildMeshes()) m.computeWorldMatrix(true);
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const { height, radius } = safeCapsuleDims(max.x - min.x, max.y - min.y, max.z - min.z);
    const mesh = MeshBuilder.CreateCapsule(`cap-npc-${id}`, { height, radius }, this.babylonScene);
    mesh.isVisible = false;
    mesh.parent = holder;
    mesh.position.set(0, height / 2, 0); // feet at the holder origin
    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.CAPSULE, { mass: 0 }, this.babylonScene);
    agg.body.setMotionType(PhysicsMotionType.ANIMATED); // code-moved mover the hero collides with
    agg.body.disablePreStep = false;                    // track the holder transform each step
    this.npcCapsuleById.set(id, { mesh, agg });
  }

  // ─── Centralized NPC locomotion (single source of truth) ───────────────────
  // Every NPC reposition/turn goes through these, so the visual holder, the logical
  // agent position (drives [E]/proximity/camera) and the capsule collider always agree.

  /**
   * Move a combatant — NPC or the player — keeping its logical position in sync so the
   * [E] prompt, proximity and camera follow it. The NPC capsule (parented to the holder)
   * and the player's physics capsule track their node automatically.
   */
  /* istanbul ignore next — browser-only mesh movement */
  private moveNpcTo(id: string, pos: Vector3): void {
    const node = this.combatNode(id);
    if (!node) return;
    node.position.copyFrom(pos);
    if (id !== 'player') this.npcManager?.getAgent(id)?.setPosition(node.position);
  }

  /** Turn a combatant to a yaw (avatars face +Z at rotation.y = 0). */
  /* istanbul ignore next — browser-only mesh rotation */
  private faceNpc(id: string, yaw: number): void {
    const node = this.combatNode(id);
    if (node) node.rotation.y = yaw;
  }

  /** Turn a combatant to face a world point. */
  /* istanbul ignore next — browser-only mesh rotation */
  private faceNpcToward(id: string, target: Vector3): void {
    const node = this.combatNode(id);
    if (!node) return;
    const dx = target.x - node.position.x;
    const dz = target.z - node.position.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    this.faceNpc(id, Math.atan2(dx, dz));
  }

  /** The walk/idle clips for a combatant (player avatar or NPC). */
  /* istanbul ignore next — browser-only animation lookup */
  private walkIdleClipsOf(id: string): { walk: AnimationGroup | null; idle: AnimationGroup | null } {
    const groups = id === 'player'
      ? (this.player?.getAnimationGroups() ?? [])
      : (this.npcGroupsById.get(id) ?? []);
    return {
      walk: groups.find((g) => g.name.toLowerCase().includes('walk')) ?? null,
      idle: groups.find((g) => g.name.toLowerCase().includes('idle')) ?? null,
    };
  }

  /**
   * Start a combatant walking a world-space polyline — the ONE locomotion entry used by
   * both gossip and combat moves. Plays the walk clip; `stepNpcWalks` advances it each
   * frame; `onArrive` fires once at the end. A `combat` walk suspends the facing pin
   * while moving and pins the final heading on arrival.
   */
  /* istanbul ignore next — browser-only mesh movement */
  private startNpcWalk(id: string, points: Vector3[], speed: number, opts: { combat?: boolean; onArrive?: () => void } = {}): void {
    if (points.length < 2) { opts.onArrive?.(); return; }
    this.npcWalks.set(id, { points, i: 1, speed, combat: !!opts.combat, onArrive: opts.onArrive });
    if (opts.combat) this.combatWalking.add(id);
    const { walk, idle } = this.walkIdleClipsOf(id);
    idle?.stop();
    walk?.start(true);
  }

  /** Advance every active walk one frame. Called from the live loop AND the combat branch. */
  /* istanbul ignore next — browser-only mesh movement */
  private stepNpcWalks(dt: number): void {
    if (this.npcWalks.size === 0) return;
    this.npcWalks.forEach((w, id) => {
      const node = this.combatNode(id);
      const target = node ? w.points[w.i] : undefined;
      if (!node || !target) { this.finishNpcWalk(id); return; }
      const to = target.subtract(node.position); to.y = 0;
      const dist = to.length();
      const step = w.speed * dt;
      if (dist <= step) {
        this.moveNpcTo(id, new Vector3(target.x, node.position.y, target.z));
        w.i += 1;
        if (w.i >= w.points.length) { this.finishNpcWalk(id); }
      } else {
        const dir = to.scale(1 / dist);
        this.moveNpcTo(id, node.position.add(dir.scale(step)));
        this.faceNpc(id, Math.atan2(dir.x, dir.z));
      }
    });
  }

  /** End a walk: stop the clip, idle, remember the combat facing, fire onArrive. */
  /* istanbul ignore next — browser-only mesh movement */
  private finishNpcWalk(id: string): void {
    const w = this.npcWalks.get(id);
    this.npcWalks.delete(id);
    const { walk, idle } = this.walkIdleClipsOf(id);
    walk?.stop();
    idle?.start(true);
    if (w?.combat) {
      this.combatWalking.delete(id);
      const node = this.combatNode(id);
      if (node) this.combatFacing.set(id, node.rotation.y); // pin the final heading
    }
    w?.onArrive?.();
  }

  async onExit(): Promise<void> {
    /* istanbul ignore next — browser-only listener cleanup */
    if (this.surpriseClickHandler) {
      this.engine.getRenderingCanvas()?.removeEventListener('pointerdown', this.surpriseClickHandler);
      this.surpriseClickHandler = null;
    }
    // Autosave before tearing anything down (npcManager is disposed below) —
    // but NOT on game over, or we'd overwrite the save with the dead state.
    if (!this.gameOver) this.persistSession();
    /* istanbul ignore next — stop the procedural engine drone on world exit */
    this.audio?.stopEngineTone();
    this.detachInput?.();
    // Tear down the streamed world (procedural neighbor tiles) before the zone.
    this.worldStreamer?.dispose();
    this.worldStreamer = null;
    this.tileScenery.forEach((s) => s.dispose());
    this.tileScenery.clear();
    /* istanbul ignore next — browser-only marker disposal */
    this.groundMarkers.forEach((m) => m.dispose());
    this.groundMarkers.clear();
    this.tileNpcIds.clear();
    this.npcTiles.clear();
    this.npcSpawnQueue = [];
    this.assetCache?.clear();
    this.assetCache = null;
    this.player?.dispose();
    this.vehicle?.dispose();
    this.zoneManager?.dispose();
    this.cameraSystem?.dispose();
    this.npcManager?.dispose();
    this.dialog?.dispose();
    this.pauseMenu?.dispose();
    this.inventoryOverlay?.dispose();
    this.characterSheetOverlay?.hide();
    this.characterSheetOverlay = null;
    this.pdaOverlay?.dispose();
    this.pdaOverlay = null;
    this.adjustOverlay?.dispose();
    this.adjustOverlay = null;
    this.actionRibbon?.dispose();
    this.actionRibbon = null;
    this.flashlightLight?.dispose();
    this.flashlightLight = null;
    this.playerHeldRig?.dispose();
    this.playerHeldRig = null;
    this.npcHeldRigById.forEach((r) => r.dispose());
    this.npcHeldRigById.clear();
    this.combat?.dispose();
    this.gameOverMenu?.dispose();
    this.hud?.dispose();
    /* istanbul ignore next — entity colliders only exist in browser with physics */
    this.entityAggregates.forEach((a) => a.dispose());
    this.entityAggregates = [];
    this.entityColliders.forEach((c) => c.dispose());
    this.entityColliders = [];
    this.npcCapsuleById.forEach(({ mesh, agg }) => { agg.dispose(); mesh.dispose(); });
    this.npcCapsuleById.clear();
    this.npcWalks.clear();
    this.npcMeshes.forEach((m) => m.dispose());
    this.npcMeshes = [];
    this.npcVisuals.forEach((v) => v.dispose());
    this.npcVisuals = [];
    this.npcHolders.forEach((h) => h.dispose());
    this.npcHolders = [];
    this.npcHolderById.clear();
    this.npcAnchors = [];
    this.autonomyQueue?.clear();
    this.autonomyQueue = null;
    this.autonomyInFlight = false;
    this.autonomyAccumMs = 0;
    this.npcWalks.clear();
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
    this.inventoryOverlay = null;
    this.characterSheetOverlay = null;
    this.pdaOverlay = null;
    this.hud = null;
    this.detachInput = null;
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player', 'vehicle', 'npcManager'].forEach((k) =>
      ServiceLocator.unregister(k)
    );
  }

  update(): void {
    // Capped so an Alt+Tab / minimise (which pauses the render loop) can't return a
    // multi-second delta that explodes the falling nave or launches the hero.
    const dt = clampFrameDelta(this.engine.getDeltaTime());

    // Keep the action ribbon in sync (shown only during free on-foot play; Attack
    // Ranged enabled only with a firearm in hand). Done before the early returns so
    // it hides while any overlay/combat/dialog/aiming/vehicle owns the screen.
    this.syncActionRibbon();

    // ESC toggles the pause menu (unless the dialog owns the keyboard). While
    // paused, the world is frozen — only the menu (and camera follow) live on.
    // Game over freezes everything but the camera until the player picks an option.
    this.checkGameOver();
    if (this.gameOverMenu?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // Surprise-attack aiming (from the action ribbon): the world is frozen while the
    // player picks a target; a click commits the ambush, ESC cancels. Checked before
    // pause so ESC backs out of aiming instead of opening the menu.
    if (this.surpriseTargeting) {
      this.handleSurpriseTargeting(dt);
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
      this.hud?.setHudTextVisible(false); // combat bar owns the bottom; hide key hints
      this.handleCombatCameraKeys(dt);
      this.tickCombat(dt);
      this.stepNpcWalks(dt); // advance any in-progress combat move
      this.pinCombatFacings();
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // Inventory overlay (I) — freezes the world like pause; ESC/I closes it.
    this.handleInventoryInput();
    if (this.inventoryOverlay?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // Character sheet overlay (K) — attributes, skills, perk tree.
    this.handleCharacterSheetInput();
    if (this.characterSheetOverlay?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // PDA overlay (P) — intel dossiers.
    this.handlePdaInput();
    if (this.pdaOverlay?.isOpen()) {
      this.cameraSystem?.update();
      this.inputSystem?.endFrame();
      return;
    }

    // Adjust tool (O) — freezes movement; the default close camera frames the
    // hero (no orbit/zoom override, to keep the on-foot view consistent).
    this.handleAdjustInput();
    if (this.adjustOverlay?.isOpen()) {
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
        this.tickFootsteps(dt);
        // A fresh hard landing (fall damage just applied) thuds like a body fall.
        const fd = this.player?.getLastFallDamage() ?? 0;
        if (fd > 0 && fd !== this.prevFallDamage) this.sfx('bodyfall');
        this.prevFallDamage = fd;
      }
    }
    // Vehicle physics run every frame: piloted it flies; abandoned it falls.
    this.tickVehicle(dt);
    // Seamless world streaming: load/unload the 3×3 tile ring as the player crosses edges.
    this.streamWorld();
    this.cameraSystem?.update();
    this.updateNPCs(dt);
    this.updateTimeOfDay();
    if (!(this.vehicle?.isOccupied() ?? false)) {
      this.handleInteractInput();
      this.handleChatInput();
    }
    this.tickHunger(dt);
    this.updateHud(dialogOpen);
    this.inputSystem?.endFrame();
    this.gameTimeSeconds += dt;
  }

  /**
   * Hunger drives slow HP regen / starvation drain (pure math in Hunger.tick) and
   * a diegetic "stomach growling" line when it first dips low. Per-frame browser
   * glue; the model + thresholds are unit-tested in Hunger.
   */
  /* istanbul ignore next — per-frame browser glue; Hunger model is unit-tested */
  private tickHunger(dt: number): void {
    if (!this.player) return;
    const health = this.player.getHealth();
    const delta = this.playerHunger.tick(dt, health.current >= health.max);
    if (delta > 0) health.heal(delta);
    else if (delta < 0) health.applyDamage(-delta);
    const low = this.playerHunger.isLow();
    if (low && !this.hungerWasLow) { this.recordGossipLine(t('hunger.growl')); this.sfx('growl'); }
    this.hungerWasLow = low;
  }

  /** Eat: restore hunger, play the eat animation, show the food in hand, then drop it. */
  /* istanbul ignore next — browser-only eat animation + transient prop */
  private eat(itemId: string, amount: number): void {
    this.playerHunger.feed(amount);
    void this.playerHeldRig?.showTransient(itemId);
    const groups = this.player?.getAnimationGroups() ?? [];
    const interact = groups.find((g) => g.name.toLowerCase() === 'interact');
    const idle = groups.find((g) => g.name.toLowerCase() === 'idle') ?? null;
    if (interact) {
      groups.forEach((g) => g.stop());
      interact.start(false);
      interact.onAnimationEndObservable.addOnce(() => {
        idle?.start(true);
        void this.playerHeldRig?.showTransient(null); // food consumed → remove from hand
      });
    } else {
      void this.playerHeldRig?.showTransient(null);
    }
    this.sfx('eat');
  }

  /** Fire a registered SFX cue through the AudioManager (no-op if unregistered). */
  /* istanbul ignore next — thin browser glue over the unit-tested AudioManager */
  private sfx(cue: string): void {
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.playCue(cue);
  }

  /** Speak an NPC's line in its assigned voice (Kokoro TTS; fail-open). */
  /* istanbul ignore next — thin browser glue over the unit-tested TTSService */
  private speakNpc(agent: NPCAgent, text: string): void {
    const gender = genderOfOutfit(agent.definition.appearance?.bodyBase ?? 'punk');
    (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null)
      ?.speakSubject({ id: agent.definition.id, gender }, text);
  }

  /** Voice a cinematic narration line in the narrator voice (fail-open). */
  /* istanbul ignore next — thin browser glue over the unit-tested TTSService */
  private speakNarration(text: string): void {
    (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null)?.speakNarrator(text);
  }

  /**
   * Footstep cadence: accumulate dt and fire the footstep cue at the interval
   * for the current loco state (silent when idle). Pure timing in footstepInterval.
   */
  /* istanbul ignore next — per-frame browser glue; footstepInterval is unit-tested */
  private tickFootsteps(dt: number): void {
    const state = this.player?.getLocoState() ?? 'idle';
    const interval = footstepInterval(state);
    if (interval <= 0) { this.footstepTimer = 0; return; }
    this.footstepTimer += dt;
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0;
      this.sfx('footstep');
    }
  }

  /** When the hero dies, freeze the run and show the Game Over menu (once). */
  private checkGameOver(): void {
    if (this.gameOver) return;
    // The player's combat HP lives in the controller and only syncs back to the
    // PlayerController in endCombat. In a MULTI-combatant fight the player's death
    // doesn't end the encounter (it continues as a spectator brawl), so endCombat
    // never runs — the run would never end and the combat music would loop on past
    // the death. Detect the dead player combatant here too. (Fase 18 bugfix.)
    const pc = this.combat?.isOpen()
      ? this.combat.getController()?.getState().combatants.find((c) => c.isPlayer)
      : undefined;
    const diedInCombat = !!pc && pc.hp.current <= 0;
    if (!this.player?.isDead() && !diedInCombat) return;
    this.gameOver = true;
    if (diedInCombat) {
      // Sync the lethal HP and tear down the live fight (stops the combat turn loop).
      // close() does NOT fire onEnd → endCombat (which would switch to the 'world'
      // bed); we go straight to the game-over bed below.
      this.playerHealthState = { current: 0, max: this.playerHealthState.max };
      this.player?.setHealthState(this.playerHealthState);
      this.combat?.close();
      this.combatEnc = null;
    }
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.playMusic('gameover');
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
    this.zoneNpcIds = definitions.map((d) => d.id);
    for (const def of definitions) {
      // Centralized restore (Fase 20 fix): spawnWithMemory restores conversation,
      // disposition, ledger, events, inventory, pervasive HP, tamper/sabotage,
      // POSITION and the `defeated` flag (the old manual path forgot these).
      const agent = this.npcManager.spawnWithMemory(def, this.npcMemory);
      const anchor = await this.buildNPCVisual(def);
      this.npcAnchors.push(anchor);
      // If reloaded as a corpse: hold the Death pose so it stays down where it fell.
      if (agent.isDefeated()) this.playCombatClip(def.id, 'death', true);
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
    groups.find((g) => g.name.toLowerCase().includes('idle'))?.start(true);
    this.npcVisuals.push(assembled);
    this.npcHolders.push(holder);
    this.npcHolderById.set(npc.id, holder);
    this.npcGroupsById.set(npc.id, groups);

    // Show the NPC's equipped weapon in its hand (consistency with combat).
    const agent = this.npcManager?.getAgent(npc.id);
    const rig = new HeldItemRig(
      this.babylonScene, assembled.getSkeleton?.() ?? null, assembled.meshes[0] ?? null,
    );
    this.npcHeldRigById.set(npc.id, rig);
    if (agent) void rig.sync(agent.getInventoryState().equipped);
    return assembled.rootMesh;
  }

  /**
   * Rebuild the hero avatar to reflect worn armor (Phase 15): overlay the
   * equipped armor molds onto the base appearance and re-assemble the rig, then
   * re-attach held props (the skeleton is new). No-op without a spawned player.
   */
  /* istanbul ignore next — browser-only avatar reassembly */
  private async rebuildPlayerArmor(): Promise<void> {
    if (!this.player) return;
    const gender = genderOfOutfit(this.appearance.bodyBase);
    const parts = armorOverlayParts(this.playerInventory.equippedArmorIds(), gender);
    await this.player.rebuildAppearance(applyArmorOverlay(this.appearance, parts));
    // The skeleton changed — recreate the held-prop rig against the new rig.
    this.playerHeldRig?.dispose();
    this.playerHeldRig = new HeldItemRig(
      this.babylonScene, this.player.getSkeleton(), this.player.getRenderParts()[0] ?? null,
    );
    await this.syncPlayerHeldItems();
  }

  /** Re-attach the hero's visible props to match its current inventory slots. */
  /* istanbul ignore next — browser-only held-prop rig + effects */
  private async syncPlayerHeldItems(): Promise<void> {
    await this.playerHeldRig?.sync(this.playerInventory.toState().equipped, this.heldAttach);
    this.updateHeldEffects();
  }

  /* istanbul ignore next — browser-only Adjust live preview */
  private adjustPreview(slot: EquipSlot, attach: ItemAttach): void {
    const bone = attach.bone ?? boneFor(this.playerInventory.equippedIn(slot) ?? '', slot, this.heldAttach);
    void this.playerHeldRig?.applyLiveTransform(slot, attach, bone);
  }

  /* istanbul ignore next — browser-only Adjust persist */
  private adjustSave(itemId: string, attach: ItemAttach): void {
    this.heldAttach = { ...this.heldAttach, [itemId]: attach };
    this.persistSession();
    void this.syncPlayerHeldItems();
  }

  /**
   * Apply non-mesh effects of the held main-hand item: the flashlight auto-lights a
   * forward spotlight and puts the hero in the aim pose; anything else clears them.
   */
  /* istanbul ignore next — browser-only light + pose */
  private updateHeldEffects(): void {
    if (typeof document === 'undefined' || !this.player) return;
    const equipped = this.playerInventory.toState().equipped;
    // Aim pose for a flashlight OR a firearm held in the main hand; light only for the flashlight.
    this.player.setIdleOverride(holdsAimPose(equipped) ? 'aim' : null);
    const on = flashlightActive(equipped);
    if (on) {
      if (!this.flashlightLight) {
        const light = new SpotLight(
          'flashlight', new Vector3(0, 1.3, 0.2), new Vector3(0, -0.2, 1),
          Math.PI / 2.6, 1.2, this.babylonScene,
        );
        light.diffuse = new Color3(1, 0.98, 0.9);
        // No specular: flat untextured surfaces (the road) otherwise show a harsh
        // blown-out hotspot. A soft, dimmer cone reads better everywhere.
        light.specular = new Color3(0, 0, 0);
        light.intensity = 18;
        light.range = 16;
        light.parent = this.player.getRoot(); // follows the hero's facing
        // (Material light caps are raised once in onEnter — incl. async assets.)
        this.flashlightLight = light;
      }
      this.flashlightLight.setEnabled(true);
    } else {
      this.flashlightLight?.setEnabled(false);
    }
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
    this.stepNpcWalks(dt); // gossip approaches (combat walks are stepped in the combat branch)
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
    // Never dispatch a new background deliberation while one is still running — caps
    // concurrent autonomous claude.exe to 1 (procedural NPCs would otherwise pile up).
    if (this.autonomyInFlight) return;
    const now = this.autonomyAccumMs;

    const ctx: AutonomyContext = {
      gameTimeLabel: this.formatGameTime(),
      playerPresent: true,
      reflectionMs: SettingsService.get('npcReflectionMinutes') * 60_000,
      language: languageName(getLocale()),
      nearbyOf: (agent) => this.nearbyCandidatesFor(agent),
    };

    this.autonomyInFlight = true;
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
    }).finally(() => { this.autonomyInFlight = false; });
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
  private beginCombat(
    initiatorId: string, targetId: string,
    opts: { ambush?: boolean; openingAttack?: 'melee' | 'ranged'; noLunge?: boolean } = {},
  ): void {
    if (typeof document === 'undefined' || !this.combat || this.combat.isOpen()) return;
    const mgr = this.npcManager;
    if (!mgr) return;
    // A defeated NPC never starts or is dragged into a new fight.
    if (initiatorId !== 'player' && mgr.getAgent(initiatorId)?.isDefeated()) return;
    if (targetId !== 'player' && mgr.getAgent(targetId)?.isDefeated()) return;
    this.dialog?.close();

    // Melee surprise: lunge the hero adjacent to the target so the opening strike
    // lands. Collision capsules keep the player just outside the 1 m melee gate, so
    // without this the auto opening attack would whiff. (Ranged needs no lunge; a
    // REMOTE attack like an IT hack also doesn't lunge — the player stays put.)
    if (opts.ambush && opts.openingAttack === 'melee' && !opts.noLunge && this.player && targetId !== 'player') {
      const tp = this.npcHolderById.get(targetId)?.position ?? mgr.getAgent(targetId)?.getPosition();
      if (tp) {
        const pp = this.player.getRoot().position;
        const dx = pp.x - tp.x;
        const dz = pp.z - tp.z;
        const d = Math.hypot(dx, dz);
        if (d > MELEE_RANGE) {
          const r = (MELEE_RANGE * 0.85) / (d || 1);
          this.player.teleport(new Vector3(tp.x + dx * r, pp.y, tp.z + dz * r));
        }
      }
    }

    const playerInvolved = initiatorId === 'player' || targetId === 'player';
    // Local recruitment: only NPCs within COMBAT_RECRUIT_RADIUS of one of the two
    // seed fighters can join. In the streamed mosaic ~20 NPCs are loaded across the
    // 3×3 tile ring, so whole-scene recruitment dragged in NPCs from neighbouring
    // quadrants; the radius keeps a brawl local (the seeds always qualify). (Fase 18.)
    const posOf = (id: string): { x: number; z: number } | null => {
      if (id === 'player') { const p = this.player?.getRoot().position; return p ? { x: p.x, z: p.z } : null; }
      const h = this.npcHolderById.get(id)?.position ?? mgr.getAgent(id)?.getPosition();
      return h ? { x: h.x, z: h.z } : null;
    };
    const anchors = [posOf(initiatorId), posOf(targetId)].filter(Boolean) as Array<{ x: number; z: number }>;
    const nearFight = (id: string): boolean => {
      if (id === initiatorId || id === targetId) return true; // seeds always in
      const p = posOf(id);
      return !!p && anchors.some((a) => Math.hypot(p.x - a.x, p.z - a.z) <= GameWorldScene.COMBAT_RECRUIT_RADIUS);
    };
    // Each NPC's relationships come from its disposition (toward the player) and
    // its ledger (toward other NPCs).
    const participants: RecruitParticipant[] = [];
    if (playerInvolved) participants.push({ id: 'player', relationTo: () => 'neutral' });
    for (const a of mgr.getAgents()) {
      if (a.isDefeated()) continue;           // the dead don't rejoin fights
      if (!nearFight(a.definition.id)) continue; // out-of-radius NPCs stay out
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
    this.combatWeaponId.clear();

    const names: Record<string, string> = {};
    const sources: Record<string, TransformNode> = {};
    const combatants: CombatantInit[] = [];
    for (const id of ids) {
      const side = sides[id]!;
      if (id === 'player') {
        const p = this.player?.getRoot().position ?? Vector3.Zero();
        const pw = this.playerInventory.combatWeaponId; // melee OR firearm (Phase 11)
        combatants.push({ id, name: this.playerName, isPlayer: true, stats: this.playerStats, health: this.playerHealthState, pos: { x: p.x, z: p.z }, side, weapon: weaponProfile(pw), weaponName: this.weaponLabel(pw), damageReduction: this.playerInventory.totalDamageReduction() });
        this.combatWeaponId.set(id, pw);
        names[id] = this.playerName;
        if (this.player) sources[id] = this.player.getRoot();
      } else {
        const a = mgr.getAgent(id);
        const holder = this.npcHolderById.get(id);
        if (!a || a.isDefeated()) continue;
        const pos = holder?.position ?? a.getPosition();
        // Sabotaged gear (Fase 20H): the rigged weapon blows as the NPC draws it for the
        // fight — self-damage on its pervasive HP before the encounter reads it.
        /* istanbul ignore next — browser-only sabotage hook (Crafting math is tested) */
        if (a.isSabotaged()) {
          const dmg = sabotageDamage(weaponProfile(a.getCombatWeaponId())?.damageBase ?? 8);
          a.getHealth().applyDamage(dmg);
          a.clearSabotage();
          this.combatSabotageNote = a.getDisplayName();
        }
        // Pervasive HP (Fase 20): the encounter reads the NPC's current world HP (so a
        // wounded NPC enters the fight already hurt) and writes it back on endCombat.
        combatants.push({ id, name: a.getDisplayName(), isPlayer: false, stats: this.enemyStatsFor(a), health: a.getHealthState(), pos: { x: pos.x, z: pos.z }, side, weapon: weaponProfile(a.getCombatWeaponId()), weaponName: this.weaponLabel(a.getCombatWeaponId()) });
        this.combatWeaponId.set(id, a.getCombatWeaponId());
        names[id] = a.getDisplayName();
        if (holder) sources[id] = holder;
      }
    }
    // Need at least two distinct sides among the recruited combatants.
    if (combatants.length < 2 || new Set(combatants.map((c) => c.side)).size < 2) return;

    this.combatPlayerSide = sides['player'] ?? null;
    // Phase 11 ambush: a surprise attack grants the player the very first turn.
    const ambusherId = opts.ambush && playerInvolved ? 'player' : undefined;
    const enc = new CombatEncounter(combatants, { tuning, pathfind: this.combatPathfind, ambusherId });
    this.combatEnc = enc;
    // Phase 11: the player's loadout drives caps — a firearm in hand enables Shoot;
    // melee/fists keep the Strike menu. (No scenery cover yet.) NPCs decide ranged vs
    // melee per their OWN weapon inside the controller. '__none__' = spectator fight.
    const playerMain = this.playerInventory.combatWeaponId;
    const caps = { firearm: playerInvolved && !!playerMain && isFirearm(playerMain), cover: false };
    const controller = new CombatController(enc, names, playerInvolved ? 'player' : '__none__', caps);

    const language = languageName(getLocale());
    this.combat.setHandlers({
      narrate: async (beat) => {
        const line = await (this.npcManager?.narrateCombat(beat, language) ?? Promise.resolve(beat));
        this.speakNarration(line); // voice the critical-hit line (narrator, TTS fail-open)
        return line;
      },
      onEnd: (outcome) => this.endCombat(outcome),
      onBeat: (entry) => this.onCombatBeat(entry),
      onRequestTarget: (attackKind) => { this.combatTargeting = { mode: 'attack', attackKind }; },
      onRequestMove: () => { this.combatTargeting = { mode: 'move' }; },
      onTargetMove: () => this.previewCombatTargeting(),
      onTargetCommit: () => this.commitCombatTargeting(),
    });
    this.combat.setPortraitSources(sources);
    this.combat.start(controller);
    // Narrate (TTS) a sabotaged-gear blow that fired as the fight opened (Fase 20H);
    // the self-damage already shows in the NPC's portrait HP.
    if (this.combatSabotageNote) {
      this.speakNarration(t('skill.sabotageBlows', { name: this.combatSabotageNote }));
      this.combatSabotageNote = null;
    }
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.playMusic('combat');
    // Seed each combatant facing its nearest foe so the fight opens looking engaged,
    // and the per-frame pin keeps it (Bug A).
    this.combatFacing.clear();
    this.combatWalking.clear();
    for (const c of enc.getState().combatants) {
      const foeId = enc.nearestFoeId(c.id);
      const foe = foeId ? enc.getState().combatants.find((x) => x.id === foeId) : null;
      if (foe) {
        this.pinCombatFacing(c.id, new Vector3(c.pos.x, 0, c.pos.z), new Vector3(foe.pos.x, 0, foe.pos.z));
      }
    }
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
    // Phase 11 surprise blow: with the ambusher acting first, immediately resolve the
    // opening strike/shot against the ambushed target (plays the swing/muzzle-flash,
    // deals damage, spends AP); the player keeps the rest of their first turn.
    if (opts.openingAttack && playerInvolved) {
      this.combat.submitPlayerAction({ type: 'attack', attackKind: opts.openingAttack, targetId });
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
    for (const cue of sfxForBeat(entry)) this.sfx(cue);
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
    // Movement: walk the avatar along the routed polyline to its new position
    // (the ONE locomotion path, shared with gossip).
    if (entry.kind === 'move' && entry.path && entry.path.length > 1) {
      const node = this.combatNode(entry.actorId);
      const y = node?.position.y ?? 0;
      const points = entry.path.map((p) => new Vector3(p.x, y, p.z));
      this.startNpcWalk(entry.actorId, points, GameWorldScene.NPC_WALK_SPEED, { combat: true });
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
      this.pinCombatFacing(entry.actorId, attackerNode.position, targetNode.position);
      if (landed && entry.targetId) this.pinCombatFacing(entry.targetId, targetNode.position, attackerNode.position);
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
      // Ranged shot → muzzle flash at the shooter's hand height, toward the target.
      if (entry.attackKind === 'ranged' && attackerNode) {
        const muzzle = attackerNode.position.add(new Vector3(0, 1.3, 0));
        const dir = targetNode ? targetNode.position.subtract(attackerNode.position) : new Vector3(0, 0, 1);
        void createMuzzleFlash(this.babylonScene, muzzle, dir);
      }
    }
  }

  /**
   * Pin a combatant's facing yaw: applies it now AND remembers it so the per-frame
   * combat pin keeps re-asserting it (an idle clip otherwise snaps the avatar back to
   * its modelled forward — Bug A). No-op if the two points coincide.
   */
  /* istanbul ignore next — browser-only */
  private pinCombatFacing(actorId: string, fromPos: Vector3, targetPos: Vector3): void {
    const dx = targetPos.x - fromPos.x;
    const dz = targetPos.z - fromPos.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    const yaw = Math.atan2(dx, dz);
    this.combatFacing.set(actorId, yaw);
    const node = this.combatNode(actorId);
    if (node) node.rotation.y = yaw;
  }

  /**
   * Re-assert every standing combatant's remembered facing each combat frame, except
   * those mid-walk (whose own per-segment rotation must win). This defeats the idle
   * clip resetting the avatar's yaw at the end of a move (Bug A).
   */
  /* istanbul ignore next — browser-only */
  private pinCombatFacings(): void {
    this.combatFacing.forEach((yaw, id) => {
      if (this.combatWalking.has(id)) return;
      const node = this.combatNode(id);
      if (node) node.rotation.y = yaw;
    });
  }

  /** The world node for a combatant id (player root or NPC holder). */
  /* istanbul ignore next — browser-only */
  private combatNode(actorId: string): TransformNode | null {
    return actorId === 'player' ? (this.player?.getRoot() ?? null) : (this.npcHolderById.get(actorId) ?? null);
  }

  /** Melee choreography: dash ~1 m toward the target, punch, then slide back to origin. */
  /* istanbul ignore next — browser-only animation playback */
  /** Swing clip for a combatant's melee strike: armed → slash (or the weapon's
   * holdClip), bare-fisted → punch. (Browser combat playback support; pure logic
   * lives in attackClipFor, fully tested.) */
  /* istanbul ignore next — browser-only combat playback support */
  private meleeClip(actorId: string): CombatClipState {
    const wid = this.combatWeaponId.get(actorId) ?? null;
    const override = wid ? itemDef(wid)?.holdClip : undefined;
    return attackClipFor('melee', isMeleeWeapon(wid ?? ''), override);
  }

  private meleeLunge(attackerId: string, targetId: string): void {
    const swing = this.meleeClip(attackerId);
    const attacker = this.combatNode(attackerId);
    const target = this.combatNode(targetId);
    if (!attacker || !target) { this.playCombatClip(attackerId, swing, false); return; }
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
    this.playCombatClip(attackerId, swing, false, () => {
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
    const range = me && this.combatEnc ? targetRangeFor(targeting.attackKind ?? 'melee', this.combatEnc.weaponOf(me.id)) : MELEE_RANGE;
    const inRange = !!cand && !!me && distance2(me.pos, cand.pos) <= range;
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
    // no fragile mesh pick); strike only if within reach (melee ≤1 m / firearm range).
    const to = this.groundPointFromPointer();
    const cand = to ? this.combatantNearGround(to) : null;
    const range = this.combatEnc ? targetRangeFor(targeting.attackKind ?? 'melee', this.combatEnc.weaponOf(me.id)) : MELEE_RANGE;
    if (!cand || distance2(me.pos, cand.pos) > range) return; // none / out of range → ignore
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

  // ─── Out-of-combat surprise attack (Phase 11) ──────────────────────────────

  /**
   * Enter surprise-attack aiming from the action ribbon. Ranged needs a firearm in
   * hand; melee always works (equipped melee weapon or fists). No-op while a dialog,
   * combat, or another overlay owns the screen.
   */
  /* istanbul ignore next — browser-only entry from the ribbon */
  enterSurpriseTargeting(attackKind: 'melee' | 'ranged'): void {
    if (typeof document === 'undefined') return;
    if (this.combat?.isOpen() || this.dialog?.isOpen() || this.inventoryOverlay?.isOpen()) return;
    if (this.vehicle?.isOccupied()) return;
    const mainHand = this.playerInventory.combatWeaponId;
    if (attackKind === 'ranged' && !(mainHand && isFirearm(mainHand))) return; // need a gun
    this.surpriseTargeting = { attackKind };
  }

  /** Living, non-defeated NPCs as aim targets at their current ground positions. */
  /* istanbul ignore next — browser-only (reads live holders) */
  private aimTargetsInScene(): AimTarget[] {
    const out: AimTarget[] = [];
    for (const a of this.npcManager?.getAgents() ?? []) {
      if (a.isDefeated()) continue;
      const p = this.npcHolderById.get(a.definition.id)?.position ?? a.getPosition();
      out.push({ id: a.definition.id, pos: { x: p.x, z: p.z } });
    }
    return out;
  }

  /** Reach (m) of the player's pending surprise attack: firearm range / melee 1 m. */
  /* istanbul ignore next — browser-only */
  private surpriseRange(attackKind: 'melee' | 'ranged'): number {
    if (attackKind === 'melee') return GameWorldScene.SURPRISE_MELEE_REACH;
    return targetRangeFor(attackKind, weaponProfile(this.playerInventory.combatWeaponId));
  }

  /** Per-frame aim feedback: ring the NPC under the cursor (green = in reach). */
  /* istanbul ignore next — browser-only pointer/rendering */
  private handleSurpriseTargeting(dt: number): void {
    if (this.inputSystem?.wasJustPressed('pause')) { this.clearSurpriseTargeting(); return; }
    this.handleCameraKeys(dt); // Z/C orbit to line up the shot
    const aim = this.surpriseTargeting;
    const me = this.player?.getRoot().position;
    const to = this.groundPointFromPointer();
    if (!aim || !me || !to) { this.drawTargetRing(null, false); return; }
    const cand = nearestToPoint(this.aimTargetsInScene(), to, GameWorldScene.TARGET_PICK_RADIUS);
    const inRange = !!cand && distance2({ x: me.x, z: me.z }, cand.pos) <= this.surpriseRange(aim.attackKind);
    this.drawTargetRing(cand ? cand.pos : null, inRange);
  }

  /** Click commit: ambush the NPC under the cursor if it is within reach. */
  /* istanbul ignore next — browser-only pointer */
  private commitSurpriseTargeting(): void {
    const aim = this.surpriseTargeting;
    const me = this.player?.getRoot().position;
    const to = this.groundPointFromPointer();
    if (!aim || !me || !to) return;
    const cand = nearestToPoint(this.aimTargetsInScene(), to, GameWorldScene.TARGET_PICK_RADIUS);
    if (!cand || distance2({ x: me.x, z: me.z }, cand.pos) > this.surpriseRange(aim.attackKind)) {
      this.sfx('ui_error'); // clicked an out-of-reach / empty spot
      return;
    }
    const attackKind = aim.attackKind;
    this.clearSurpriseTargeting();
    this.beginCombat('player', cand.id, { ambush: true, openingAttack: attackKind });
  }

  /** Leave surprise aiming, clearing the ring. */
  /* istanbul ignore next — browser-only */
  private clearSurpriseTargeting(): void {
    this.surpriseTargeting = null;
    this.targetRing?.dispose();
    this.targetRing = null;
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

  /** Apply a resolved combat outcome to the world (player HP, defeat, disposition). */
  /* istanbul ignore next — browser-only combat wiring */
  private endCombat(outcome: CombatOutcome): void {
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.playMusic('world'); // back to the street bed
    const state = this.combat?.getController()?.getState();
    const me = state?.combatants.find((c) => c.isPlayer);
    if (me) {
      this.playerHealthState = { current: me.hp.current, max: me.hp.max };
      this.player?.setHealthState(this.playerHealthState);
    }
    // Sync everyone's logical position to where combat left them (so the [E] prompt,
    // proximity and camera follow a fighter that repositioned), and persist each
    // combatant's fate so nobody "resurrects": the dead are marked defeated (stay down,
    // excluded from recruitment/autonomy/triggers); surviving enemies relax to wary.
    if (state) {
      for (const c of state.combatants) {
        if (c.isPlayer) {
          this.player?.teleport(new Vector3(c.pos.x, this.player.getPosition().y, c.pos.z));
          continue;
        }
        const agent = this.npcManager?.getAgent(c.id);
        const holder = this.npcHolderById.get(c.id);
        const y = holder?.position.y ?? 0;
        this.moveNpcTo(c.id, new Vector3(c.pos.x, y, c.pos.z)); // holder+agent; capsule follows
        if (!agent) continue;
        if (!c.alive) {
          agent.markDefeated();
          this.playCombatClip(c.id, 'death', true); // hold the downed pose
          // Fase 21: auto-pay-on-kill removed. The player must return to the
          // giver and verbally claim the contract (job_claim → Resolver →
          // Applier.claimMissionCompletion). Decision #14 plan.
        } else {
          agent.setHealthState({ current: c.hp.current, max: c.hp.max }); // persist wounds (Fase 20)
          if (outcome !== 'player_lost' && this.combatPlayerSide && c.side !== this.combatPlayerSide) {
            agent.setDisposition('wary');
          }
        }
      }
      // (C) Surviving NPCs learn who died — recorded in their memory so it surfaces in
      // their prompt ("recent events you witnessed"); persisted across saves.
      const dead = state.combatants.filter((c) => !c.isPlayer && !c.alive);
      const playerInFight = state.combatants.some((c) => c.isPlayer);
      if (dead.length > 0) {
        for (const survivor of state.combatants) {
          if (survivor.isPlayer || !survivor.alive) continue;
          const sAgent = this.npcManager?.getAgent(survivor.id);
          if (!sAgent) continue;
          for (const d of dead) {
            if (d.id === survivor.id) continue;
            const dName = this.npcManager?.getAgent(d.id)?.definition.name ?? 'someone';
            const byPlayer = playerInFight && !!this.combatPlayerSide && d.side !== this.combatPlayerSide;
            sAgent.rememberEvent(byPlayer
              ? `You saw ${this.playerName} kill ${dName} in a fight.`
              : `You saw ${dName} killed in a fight.`);
          }
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
    this.combatFacing.clear();
    this.combatWalking.clear();
    // Restore the on-foot camera framing (whichever combat mode was active).
    this.cameraSystem?.exitFreeMode();
    this.cameraSystem?.exitConversationMode();
    this.combatSpectator = false;
    this.combatFocus?.dispose();
    this.combatFocus = null;
    // On a loss the player HP is now 0 → checkGameOver ends the run next frame.
  }

  /**
   * A combat sheet for an NPC (no per-NPC stats yet — a shared, deliberately beatable
   * block). Tuned down from the original street-tough so the player can win: fewer AP
   * (Dex 30 → 3 AP ≈ one strike/turn), softer blows (Força 25), lower accuracy
   * (Combate 25) and easier to land hits on (Percepção 20). Raise these once per-NPC
   * stat blocks land.
   */
  /* istanbul ignore next — browser-only combat wiring */
  private enemyStatsFor(_agent: NPCAgent): CharacterStats {
    const s = createDefaultStats();
    s.attributes.destreza = 30;
    s.attributes.forca = 25;
    s.skills.armas_de_fogo = 25;
    s.skills.combate_corpo_a_corpo = 25;
    s.skills.percepcao = 20;
    return s;
  }

  /** Other known NPCs near the given agent (within ~20m) it could engage. */
  /* istanbul ignore next — browser-only helper */
  private nearbyCandidatesFor(agent: NPCAgent): IntentCandidate[] {
    const out: IntentCandidate[] = [];
    this.npcManager?.getAgents().forEach((other) => {
      if (other.definition.id === agent.definition.id) return;
      if (other.isDefeated()) return; // the dead aren't deliberation candidates (Fase 20)
      if (agent.distanceTo(other.getPosition()) > 20) return;
      out.push({ id: other.definition.id, name: other.getDisplayName() });
    });
    return out;
  }

  /** Plan an A* route for `moverId` to walk toward `partnerId`, then gossip on arrival. */
  /* istanbul ignore next — browser-only mesh routing */
  private beginApproach(moverId: string, partnerId: string): void {
    if (moverId === partnerId) return; // never approach/gossip with oneself
    const mover = this.npcHolderById.get(moverId);
    const partner = this.npcHolderById.get(partnerId);
    if (!mover || !partner || this.npcWalks.has(moverId) || this.gossiping.has(moverId)) return;
    const from: [number, number, number] = [mover.position.x, 0, mover.position.z];
    const to: [number, number, number] = [partner.position.x, 0, partner.position.z];
    const poly = computeRoute(WAYPOINT_GRAPH, from, to);
    if (!poly) return;
    const y = mover.position.y;
    // Stop an engagement distance short of the partner so they don't overlap.
    const points = this.trimPathTail(poly.map((p) => new Vector3(p[0], y, p[2])), GameWorldScene.ENGAGE_DIST);
    // The ONE locomotion path (shared with combat); on arrival, face + gossip.
    this.startNpcWalk(moverId, points, GameWorldScene.NPC_WALK_SPEED, {
      onArrive: () => {
        this.faceNpcToward(moverId, partner.position);
        this.triggerGossip(moverId, partnerId);
      },
    });
  }

  /** Shorten a polyline by `backoff` metres from its end (drops/clips the final segments). */
  /* istanbul ignore next — browser-only path helper */
  private trimPathTail(points: Vector3[], backoff: number): Vector3[] {
    if (points.length < 2 || backoff <= 0) return points;
    const pts = points.slice();
    let remaining = backoff;
    while (pts.length >= 2) {
      const last = pts[pts.length - 1]!;
      const prev = pts[pts.length - 2]!;
      const dir = last.subtract(prev); dir.y = 0;
      const seg = dir.length();
      if (seg > remaining) {
        pts[pts.length - 1] = seg > 1e-6 ? prev.add(dir.scale((seg - remaining) / seg)) : prev;
        return pts;
      }
      remaining -= seg;
      pts.pop();
    }
    return pts;
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

  // ─── Dropped ground items (Fase 18) ──────────────────────────────────────────

  /** Drop one unit of an item as a pickup pile at the player's feet. */
  /* istanbul ignore next — browser-only drop; the pure GroundItems helpers are tested */
  private dropToGround(itemId: string): void {
    if (!this.player) return;
    const p = this.player.getPosition();
    const c = this.worldStreamer?.getCurrentTile() ?? tileOf(p.x, p.z);
    const item: GroundItem = { tile: [c.tx, c.tz], pos: [p.x, 0.3, p.z], id: itemId, qty: 1 };
    this.groundItems = addGroundItem(this.groundItems, item);
    this.spawnGroundMarker(item);
    // The overlay's onChange (fired right after onDrop) persists the new groundItems.
  }

  /** Build pickup markers for every persisted ground pile (on scene enter). */
  /* istanbul ignore next — browser-only marker meshes */
  private renderGroundMarkers(): void {
    if (typeof document === 'undefined') return;
    for (const item of this.groundItems) this.spawnGroundMarker(item);
  }

  /** A small glowing box marking a dropped pile. */
  /* istanbul ignore next — browser-only marker mesh */
  private spawnGroundMarker(item: GroundItem): void {
    if (typeof document === 'undefined' || this.groundMarkers.has(item)) return;
    const m = MeshBuilder.CreateBox(`ground-${this.groundMarkers.size}`, { size: 0.4 }, this.babylonScene);
    m.position.set(item.pos[0], item.pos[1], item.pos[2]);
    const mat = new StandardMaterial(`gmat-${this.groundMarkers.size}`, this.babylonScene);
    mat.emissiveColor = new Color3(0.1, 0.9, 0.7);
    m.material = mat;
    m.isPickable = false;
    this.groundMarkers.set(item, m);
  }

  /** Pick up the nearest pile in reach into the pack (capacity-aware). */
  /* istanbul ignore next — browser-only pickup; nearestGroundItemIndex is tested */
  private tryPickupGroundItem(): void {
    if (!this.player) return;
    const p = this.player.getPosition();
    const idx = nearestGroundItemIndex(this.groundItems, p.x, p.z, GameWorldScene.PICKUP_RADIUS);
    if (idx < 0) return;
    const item = this.groundItems[idx];
    const moved = this.playerInventory.addRespectingCapacity(item.id, item.qty);
    if (moved <= 0) return; // pack full / too heavy — leave it on the ground
    if (moved >= item.qty) {
      this.groundMarkers.get(item)?.dispose();
      this.groundMarkers.delete(item);
      this.groundItems = removeGroundItemAt(this.groundItems, idx);
    } else {
      item.qty -= moved; // partial pickup — the rest stays in the pile
    }
    this.sfx('ui_click');
    this.persistSession();
    void this.syncPlayerHeldItems();
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
    if (!agent) {
      // No NPC in reach — E picks up a dropped pile if one is close (Fase 18).
      this.tryPickupGroundItem();
      return;
    }
    if (agent && agent.isDefeated()) {
      // A corpse never converses (no live persona) — searching it opens the loot
      // overlay, transferring the dead NPC's items to the player (Phase 9).
      const name = agent.isNameKnown() ? agent.definition.name : t('inventory.corpseUnknown');
      this.inventoryOverlay?.openLoot(this.playerInventory, agent.getInventory(), name);
      const holder = this.npcHolderById.get(agent.definition.id);
      if (holder) this.cameraSystem?.enterConversationMode(holder);
      return;
    }
    if (agent) {
      // Seed the transcript with the prior conversation so history is visible.
      const seed: DialogLine[] = agent.conversation.getFullHistory().flatMap((ex) => [
        { role: 'player' as const, text: ex.player },
        { role: 'npc' as const, text: ex.npc },
      ]);
      this.chatMode = 'npc';
      this.dialog.open(agent.getDisplayName(), seed);
      this.sfx('ui_open');
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
    /* istanbul ignore next — thin browser glue */
    (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null)?.cancel();
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
    this.sfx('ui_open');
  }

  /**
   * The ribbon's Talk button: open a conversation with a conversable NPC in reach,
   * else open the global channel (the same outcomes as E / T, mouse-driven).
   */
  /* istanbul ignore next — browser-only ribbon action */
  private openTalkFromRibbon(): void {
    if (!this.dialog || this.dialog.isOpen() || (this.vehicle?.isOccupied() ?? false)) return;
    const agent = this.player && this.npcManager ? this.npcManager.getConversableAgent(this.player.getPosition()) : null;
    if (agent && !agent.isDefeated()) {
      const seed: DialogLine[] = agent.conversation.getFullHistory().flatMap((ex) => [
        { role: 'player' as const, text: ex.player },
        { role: 'npc' as const, text: ex.npc },
      ]);
      this.chatMode = 'npc';
      this.dialog.open(agent.getDisplayName(), seed);
      this.sfx('ui_open');
      const holder = this.npcHolderById.get(agent.definition.id);
      if (holder && this.player) {
        const pp = this.player.getPosition();
        holder.rotation.y = Math.atan2(pp.x - holder.position.x, pp.z - holder.position.z);
        this.cameraSystem?.enterConversationMode(holder);
      }
      return;
    }
    this.chatMode = 'global';
    const seed: DialogLine[] = this.gossipLog.map((text) => ({ role: 'narration' as const, text }));
    this.dialog.open(t('dialog.openChannel'), seed);
    this.sfx('ui_open');
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
      this.sfx('ui_error');
      return;
    }

    this.dialog.addPlayerLine(spoken);
    // Emote pipeline: a deterministic action resolves via a cRPG check + narration
    // (and the NPC reacts); otherwise fall through to a normal NPC reply.
    if (await this.resolvePlayerAction(spoken, agent)) return;
    // Fase 21 verbal pipeline: pure speech to an addressed NPC may classify into
    // a deterministic verbal verb (job/commerce/persuade/intimidate/manipulate/info).
    // If so, Resolver+Applier stage the state change BEFORE the NPC replies — the
    // reply then narrates the just-decided outcome via its extraContext.
    await this.tryVerbalAction(agent, spoken);
    const world = this.buildWorldSnapshot(agent, agent.distanceTo(this.player.getPosition()));
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
      this.sfx('ui_error');
      return;
    }

    this.dialog.addPlayerLine(spoken);
    // Deterministic action → cRPG check + narration (+ NPC reaction if addressed).
    if (await this.resolvePlayerAction(spoken, agent)) return;

    if (agent) {
      this.dialog.setNpcName(agent.getDisplayName());
      // Fase 21 verbal pipeline (see sendToActiveNPC).
      await this.tryVerbalAction(agent, spoken);
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent, agent.distanceTo(this.player.getPosition())), spoken);
    } else {
      this.dialog.setThinking(true);
      const narration = await this.npcManager.narrateAmbient(spoken, this.formatGameTime(), GameWorldScene.SURROUNDINGS, languageName(getLocale()));
      const line = narration || 'The street murmurs on, indifferent.';
      this.dialog.addNarrationLine(line);
      this.speakNarration(line);
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
        this.speakNpc(agent, reply); // voice the NPC's spoken words (TTS, fail-open)
        // Fase 21: maybeHandleCommerce removed — pending trade/mission staging
        // is now handled BEFORE the reply by tryVerbalAction (verbal classifier
        // + Resolver). The legacy post-hoc classifier is no longer needed.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.dialog.setNpcText(`( Claude error: ${msg.slice(0, 180)} )`);
    }
  }

  /** Display name for an item id (i18n), e.g. for a buy confirmation line. */
  private itemName(id: string): string {
    const def = itemDef(id);
    return def ? t(def.nameKey) : id;
  }

  /**
   * Fase 21 — Verbal action pipeline (additive next to the legacy paths).
   *
   * Runs BEFORE streamNpcReply when the player addresses an NPC with PURE
   * SPEECH (no emote). Calls the verbal classifier, runs the unified
   * Resolver, applies the resulting Mutations to scene state via the
   * SceneApplierContext, then RETURNS — the caller still invokes
   * streamNpcReply for the NPC's in-character reply, now informed via
   * `extraContext` of what was decided. Returns boolean indicating whether
   * the message was a deterministic verbal verb (true) or pure chitchat
   * (false; caller falls through to the legacy NPC reply path).
   */
  /* istanbul ignore next — browser-only Fase 21 verbal wiring (Resolver+Applier are pure-tested) */
  private async tryVerbalAction(agent: NPCAgent, message: string): Promise<boolean> {
    if (!this.npcManager || !this.player) return false;
    const npcId = agent.definition.id;
    const npcName = agent.getDisplayName();
    const disp = agent.getDisposition();
    const sellable = canTrade(disp) ? sellableItems(agent.getInventory()) : [];
    const liveIds = this.npcManager.liveNpcIds();
    const rivals = liveIds.filter((other) => other !== npcId && agent.isAntagonisticToward(other));
    // Build a compact `pendings` snapshot for the classifier prompt (helps it
    // route accept/decline against the right offer on file).
    const pendings: { kind: 'trade' | 'mission'; itemId?: string; targetId?: string }[] = [];
    if (this.pendingTrade?.npcId === npcId) pendings.push({ kind: 'trade', itemId: this.pendingTrade.itemId });
    if (this.pendingMission?.giverId === npcId) pendings.push({ kind: 'mission', targetId: this.pendingMission.targetId });

    const cls = await this.npcManager.classifyVerbal(npcId, npcName, message, sellable, rivals, pendings);
    if (cls.verb === 'narrative') return false; // pure chitchat → legacy reply path

    // Build the actor adapters + ResolveOptions, then run the unified pipeline.
    const playerActor = new PlayerActor({
      controller: this.player,
      inventory: this.playerInventory,
      stats: this.playerStats,
      displayName: this.playerName,
    });
    const npcActor = new NpcActor(agent, this.enemyStatsFor(agent));
    const opts: ResolveOptions = {
      itemId: cls.itemId,
      otherTargetId: cls.target,
      proposedPrice: cls.proposedPrice,
      dir: cls.dir,
      npcSellableIds: sellable,
      pendingTrade: this.pendingTrade?.npcId === npcId
        ? { itemId: this.pendingTrade.itemId, price: this.pendingTrade.price }
        : null,
      pendingMission: this.pendingMission?.giverId === npcId
        ? { targetId: this.pendingMission.targetId, reward: this.missionRewardOf(this.pendingMission) }
        : null,
      priceFor: (id: string) => priceFor(id, disp),
      rivalIds: rivals,
      presentNpcIds: liveIds,
      activeMissions: this.missions.filter((m) => m.status === 'active').map((m) => ({ giverId: m.giverId, targetId: m.targetId })),
      defeatedNpcIds: this.npcManager.getAgents()
        .filter((a) => a.isDefeated()).map((a) => a.definition.id),
      giverCreditBalance: creditBalance(agent.getInventory()),
    };
    const result = resolveAction(playerActor, cls.verb, npcActor, opts, undefined, 'verbal');
    if (!result.allowed) {
      this.logSkill(`verbal verb=${cls.verb} BLOCKED: ${result.blockedReason}`);
      return false; // fall through to legacy reply path
    }
    // Diagnostic line per turn: classifier output + check outcome (when rolled).
    if (result.rolled) {
      const pct = Math.round(result.probability * 100);
      const roll = Math.round(result.roll);
      const outcome = result.success ? (result.critical ? 'CRIT' : 'HIT') : 'MISS';
      this.logSkill(`verbal verb=${cls.verb} · roll=${roll} vs P=${pct}% → ${outcome} · ${result.mutations.length} mutation(s)`);
    } else {
      this.logSkill(`verbal verb=${cls.verb} (no check) · ${result.mutations.length} mutation(s)`);
    }
    applyMutations(this.buildApplierContext(), result.mutations);
    // Visible failure feedback for haggle — the Resolver emits no discount
    // mutation on a miss, so the chat would be silent without this hint.
    if (cls.verb === 'commerce_haggle' && result.rolled && !result.success) {
      this.dialog?.addSystemLine(t('economy.haggleFailed'));
    }
    return true;
  }

  /** Extract a RewardOffer from a Mission (for ResolveOptions). */
  /* istanbul ignore next — trivial accessor */
  private missionRewardOf(m: Mission): RewardOffer {
    if (m.rewardKind === 'item' && m.rewardItemId) return { kind: 'item', itemId: m.rewardItemId };
    return { kind: 'credits', credits: m.rewardCredits ?? 0 };
  }

  /**
   * Build a SceneApplierContext that lets the Applier mutate this scene's
   * live world (inventory, HP, disposition, missions, PDA, narration, …).
   * This is the seam between the pure action layer and Babylon/save/GUI.
   */
  /* istanbul ignore next — browser-only scene-bound applier (each branch wires an existing scene method) */
  private buildApplierContext(): ApplierContext {
    const self = this;
    const agentById = (id: string) => self.npcManager?.getAgent(id) ?? null;
    return {
      // ── Inventory & credits ──────────────────────────────────────────
      transferItem(from, to, itemId, qty) {
        const fromInv = from === 'player' ? self.playerInventory : agentById(from)?.getInventory();
        const toInv = to === 'player' ? self.playerInventory : agentById(to)?.getInventory();
        if (!fromInv || !toInv) return;
        const id = itemId ?? sellableItems(fromInv)[0] ?? null;
        if (!id) return;
        fromInv.transferTo(toInv, id, qty);
        if (to === 'player') void self.syncPlayerHeldItems();
        self.persistSession();
      },
      transferCredits(from, to, amount) {
        const fromInv = from === 'player' ? self.playerInventory : agentById(from)?.getInventory();
        const toInv = to === 'player' ? self.playerInventory : agentById(to)?.getInventory();
        if (!fromInv || !toInv) return;
        const amt = amount < 0 ? creditBalance(fromInv) : Math.min(amount, creditBalance(fromInv));
        if (amt <= 0) return;
        payCredits(fromInv, amt);
        grantCredits(toInv, amt);
        self.persistSession();
      },
      // ── HP ───────────────────────────────────────────────────────────
      heal(target, amount) {
        if (target === 'player') self.player?.getHealth().heal(amount);
        else agentById(target)?.getHealth().heal(amount);
      },
      damage(target, amount, _source) {
        if (target === 'player') self.player?.getHealth().applyDamage(amount);
        else agentById(target)?.getHealth().applyDamage(amount);
      },
      // ── Disposition / relationship ───────────────────────────────────
      shiftDisposition(target, dir, steps) {
        const a = agentById(target);
        if (!a) return;
        for (let i = 0; i < steps; i++) {
          if (dir === 'up') a.improveDisposition(); else a.worsenDisposition();
        }
        self.persistSession();
      },
      alterRelationship(actor, otherId, dir, steps) {
        const a = agentById(actor);
        if (!a) return;
        for (let i = 0; i < steps; i++) {
          if (dir === 'up') a.improveRelationship(otherId); else a.worsenRelationship(otherId);
        }
        a.rememberEvent(dir === 'down' ? `Someone turned you against ${otherId}.` : `Someone reconciled you with ${otherId}.`);
        self.persistSession();
      },
      hostileReaction(target) {
        const a = agentById(target);
        if (!a) return;
        const { ultimatum } = a.onHostilePlayerAction();
        if (ultimatum) self.startCombat(target);
      },
      // ── Combat ───────────────────────────────────────────────────────
      beginCombat(attacker, defender, opts) {
        // Phase 21 mutation always names attacker+defender explicitly.
        if (attacker === 'player') {
          self.beginCombat('player', defender, { ambush: opts.ambush, openingAttack: opts.openingAttack, noLunge: opts.remote });
        } else {
          self.beginCombat(attacker, defender);
        }
      },
      disarm(_actor, _target) { /* TODO 21G — physical disarm (drop weapon as GroundItem) */ },
      // ── Sabotage ─────────────────────────────────────────────────────
      markSabotage(target) { agentById(target)?.markSabotaged(); self.persistSession(); },
      clearSabotage(target) { agentById(target)?.clearSabotage(); self.persistSession(); },
      // ── PDA ──────────────────────────────────────────────────────────
      addPdaEntry(subject, _source, _from, _lines) { self.recordPda(subject); },
      // ── Tamper ───────────────────────────────────────────────────────
      seedTamper(target, kind, playerSkillValue) {
        agentById(target)?.seedTamper({ kind, playerSkillValue });
        self.persistSession();
      },
      // ── Commerce — pending trade ─────────────────────────────────────
      stagePendingTrade(npc, itemId, price) {
        self.pendingTrade = { npcId: npc, itemId, price };
      },
      executePendingTrade(npc) {
        const a = agentById(npc);
        if (a) self.executePendingTrade(a);
      },
      applyHaggleDiscount(npc, factor) {
        const trade = self.pendingTrade;
        if (!trade || trade.npcId !== npc) return;
        // Floor at 50% of the neutral base price (Fase 21 plan).
        const base = priceFor(trade.itemId, 'neutral');
        const floor = Math.max(1, Math.round(base * 0.5));
        trade.price = Math.max(floor, Math.round(trade.price * factor));
        self.dialog?.addSystemLine(t('economy.haggled', { item: self.itemName(trade.itemId), price: trade.price }));
      },
      clearPendingTrade(_npc) { self.pendingTrade = null; },
      // ── Missions ─────────────────────────────────────────────────────
      stagePendingMission(giver, targetId, reward) {
        const mission: Mission = {
          id: `mission_${giver}_${targetId}`,
          giverId: giver,
          targetId,
          status: 'active',
          rewardKind: reward.kind,
          ...(reward.kind === 'credits' ? { rewardCredits: reward.credits } : { rewardItemId: reward.itemId }),
        };
        self.pendingMission = mission;
      },
      acceptPendingMission(_giver) { self.acceptPendingMission(); },
      declinePendingMission(_giver) {
        self.pendingMission = null;
        self.dialog?.addSystemLine(t('economy.missionDeclined'));
        self.persistSession();
      },
      claimMissionCompletion(giver, targetId) {
        // Find the active mission for this giver/target and pay out.
        const mission = self.missions.find((m) => m.status === 'active' && m.giverId === giver && m.targetId === targetId);
        if (!mission) return;
        const giverAgent = agentById(giver);
        if (giverAgent) {
          const dispBefore = giverAgent.getDisposition();
          const { mission: done } = completeMission(mission, self.playerInventory, giverAgent);
          mission.status = done.status;
          const giverName = giverAgent.getDisplayName();
          self.dialog?.addNarrationLine(t('economy.missionComplete', { giver: giverName }));
          // Show the disposition improvement explicitly — completeMission calls
          // improveDisposition under the hood, but the bump is invisible without
          // a system line (it only affects pricing / future replies / PDA).
          if (giverAgent.getDisposition() !== dispBefore) {
            self.dialog?.addSystemLine(t('economy.standingImproved', { giver: giverName }));
          }
          self.persistSession();
        }
      },
      cancelActiveMission(giver) {
        const mission = self.missions.find((m) => m.status === 'active' && m.giverId === giver);
        if (mission) {
          mission.status = 'cancelled';
          const giverName = agentById(giver)?.getDisplayName() ?? giver;
          self.dialog?.addSystemLine(t('economy.missionCancelled', { giver: giverName }));
          self.persistSession();
        }
      },
      // ── Crafting ─────────────────────────────────────────────────────
      craft(_actor, _weaponId, _scrapCost) { /* TODO — handled by existing craft branch in scene */ },
      repair(_actor, _itemId) { /* TODO — placeholder */ },
      // ── Locomotion (NPC autonomy — wired in 21G) ─────────────────────
      moveTo(_actor, _target, _coord) { /* TODO 21G */ },
      fleeFrom(_actor, _threat) { /* TODO 21G */ },
      wait(_actor) { /* no-op */ },
      talkTo(_actor, _target) { /* TODO 21G — gossip trigger */ },
      useItem(actor, itemId) {
        // NPC self-medication: consume item + heal (medkit = 30 HP).
        const a = agentById(actor);
        if (!a) return;
        const inv = a.getInventory();
        if (!inv.has(itemId)) return;
        inv.remove(itemId, 1);
        if (itemId === 'medkit') a.getHealth().heal(30);
        self.persistSession();
      },
      // ── Special narrations ───────────────────────────────────────────
      examineSelf(_actor, success) {
        if (!self.player || !self.dialog) return;
        const line = describeCondition(self.player.getHealth().fraction(), success);
        self.dialog.addNarrationLine(line);
        self.speakNarration(line);
      },
      narrateTime() {
        if (!self.dialog) return;
        const line = narrateTime(self.clock.label(self.gameTimeSeconds), self.clock.period(self.gameTimeSeconds));
        self.dialog.addNarrationLine(line);
        self.speakNarration(line);
      },
      narrateTargetAlive(targetId) {
        const name = agentById(targetId)?.getDisplayName() ?? 'they';
        const line = t('economy.targetStillAlive', { target: name });
        self.dialog?.addNarrationLine(line);
        self.speakNarration(line);
      },
      // ── Learn-by-doing ───────────────────────────────────────────────
      applySkillUse(actor, skillId) {
        if (actor !== 'player') return;
        const before = self.playerStats;
        self.playerStats = applySkillUse(before, skillId, SettingsService.get('skillGainMultiplier'));
        self.applyPerkPointGrants(before, self.playerStats);
      },
      // ── Pure narration / TTS gateway ─────────────────────────────────
      narrate(line, voice, agentId) {
        if (!self.dialog) return;
        if (voice === 'npc' && agentId) {
          const a = agentById(agentId);
          if (a) {
            self.dialog.setNpcText(line);
            self.speakNpc(a, line);
            return;
          }
        }
        self.dialog.addNarrationLine(line);
        self.speakNarration(line);
      },
    };
  }

  /* istanbul ignore next — browser-only trade execution (Economy core tested) */
  private executePendingTrade(agent: NPCAgent): void {
    const trade = this.pendingTrade;
    if (!trade || !this.dialog) return;
    this.pendingTrade = null;
    const npcInv = agent.getInventory();
    if (!npcInv.has(trade.itemId)) return; // sold/looted already
    if (creditBalance(this.playerInventory) < trade.price) {
      this.dialog.addSystemLine(t('economy.noCredits'));
      this.sfx('ui_error');
      return;
    }
    npcInv.transferTo(this.playerInventory, trade.itemId, 1);
    payCredits(this.playerInventory, trade.price);   // player pays …
    grantCredits(npcInv, trade.price);               // … the NPC receives
    this.dialog.addSystemLine(t('economy.bought', { item: this.itemName(trade.itemId), price: trade.price }));
    this.sfx('ui_click');
    this.persistSession();
    void this.syncPlayerHeldItems();
  }

  /* istanbul ignore next — browser-only mission accept (Missions core tested) */
  private acceptPendingMission(): void {
    const mission = this.pendingMission;
    if (!mission || !this.dialog) return;
    this.pendingMission = null;
    if (this.missions.some((m) => m.id === mission.id && m.status === 'active')) return; // already taken
    this.missions.push(mission);
    const target = this.npcManager?.getAgent(mission.targetId)?.getDisplayName() ?? mission.targetId;
    this.dialog.addSystemLine(t('economy.missionAccepted', { target }));
    this.sfx('ui_click');
    this.persistSession();
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
      const timeLine = narrateTime(this.clock.label(this.gameTimeSeconds), this.clock.period(this.gameTimeSeconds));
      this.dialog.addNarrationLine(timeLine);
      this.speakNarration(timeLine);
      return true;
    }

    // Self-exam: a Medicina-gated read of your own condition (diegetic, no numbers).
    if (isSelfExamEmote(message) && this.player) {
      const value = checkValue(this.playerStats, 'medicina', 'inteligencia');
      const result = resolveCheck({ value });
      if (result.success) {
        const before = this.playerStats;
        this.playerStats = applySkillUse(this.playerStats, 'medicina', SettingsService.get('skillGainMultiplier'));
        this.applyPerkPointGrants(before, this.playerStats);
      }
      const condLine = describeCondition(this.player.getHealth().fraction(), result.success);
      this.dialog.addNarrationLine(condLine);
      this.speakNarration(condLine);
      return true;
    }

    this.dialog.setThinking(true);
    const cls = await this.npcManager.classifyAction(agent?.definition.id ?? 'world', message);

    // Fase 20: a classified mechanical EFFECT (hack/steal/persuade/heal/sabotage/…)
    // routes to the skill-action engine, which gates by tool + skill and applies
    // the concrete world mutation. `none` falls through to the legacy paths below.
    if (cls.deterministic && cls.effect !== 'none') {
      return await this.applySkillEffect(message, agent, cls);
    }

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
      const before = this.playerStats;
      this.playerStats = applySkillUse(this.playerStats, cls.skillId, SettingsService.get('skillGainMultiplier'));
      this.applyPerkPointGrants(before, this.playerStats);
    }

    const narration = await this.npcManager.narrateOutcome(message, result.success, languageName(getLocale()));
    {
      const outcomeLine = narration || (result.success ? 'You pull it off.' : "It doesn't go your way.");
      this.dialog.addNarrationLine(outcomeLine);
      this.speakNarration(outcomeLine);
    }

    // The addressed NPC reacts to the action.
    if (agent) {
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent, agent.distanceTo(this.player!.getPosition())), message);
    }
    return true;
  }

  /**
   * Resolve a classified skill EFFECT (Fase 20): build the engine input from the
   * player's stats/inventory + the target NPC, run `resolveSkillAction`, apply the
   * returned mutations, narrate the outcome (TTS), learn-by-doing on success, and
   * let the target react. Always returns true (the action is fully handled here).
   */
  /* istanbul ignore next — browser-only scene wiring (SkillActions core is tested) */
  private async applySkillEffect(message: string, agent: NPCAgent | null, cls: ActionClassification): Promise<boolean> {
    if (!this.dialog || !this.npcManager || !this.player) return false;
    const attribute = cls.attribute ?? GameWorldScene.DEFAULT_CHECK_ATTRIBUTE;
    const skillValue = checkValue(this.playerStats, cls.skillId, attribute);
    const target = agent ? this.skillTargetInfo(agent, cls.target2) : null;
    const input: SkillActionInput = {
      effect: cls.effect, skillId: cls.skillId, skillValue, difficulty: cls.difficulty, dir: cls.dir,
      hasCyberdeck: this.playerInventory.has('cyberdeck'),
      hasScrap: this.playerInventory.has('scrap'),
      target,
    };
    const res = resolveSkillAction(input);

    // Dev trace: what the classifier decided + how the check resolved (Fase 20).
    this.logSkill(`classified effect=${cls.effect} skill=${cls.skillId ?? '—'} attr=${attribute} diff=${cls.difficulty} dir=${cls.dir ?? '—'} target=${target?.id ?? '—'}${target?.otherId ? `→${target.otherId}` : ''} value=${skillValue} deck=${input.hasCyberdeck}`);

    if (!res.allowed) {
      this.logSkill(`✗ BLOCKED: ${res.blockedReason}`);
      const line = this.skillBlockedLine(res.blockedReason);
      this.dialog.addNarrationLine(line);
      this.speakNarration(line);
      return true;
    }

    // attack opens combat (the engine returns begin_combat); resolve it and bail —
    // combat owns the screen, no narration/learn here (the fight handles that).
    if (cls.effect === 'attack') {
      this.logSkill(`attack → combat (ambush=${res.surprise})`);
      for (const m of res.mutations) this.applySkillMutation(m);
      return true;
    }

    const mode = !res.rolled ? 'no-check' : res.surprise ? 'SURPRISE' : (target ? 'RESISTED' : 'unresisted');
    this.logSkill(`${mode} · roll=${res.roll.toFixed(0)} vs P=${(res.probability * 100).toFixed(0)}% → ${res.success ? 'HIT' : 'MISS'}${res.critical ? ' (CRIT)' : ''}`);

    // Learn-by-doing on a successful, skilled check (owner's rule).
    if (res.success && cls.skillId) {
      const before = this.playerStats;
      this.playerStats = applySkillUse(this.playerStats, cls.skillId, SettingsService.get('skillGainMultiplier'));
      this.applyPerkPointGrants(before, this.playerStats);
    }

    // Crafting picks its output weapon from the emote text (Fase 20H).
    if (cls.effect === 'craft') this.skillCraftTarget = craftTargetFromText(message);

    if (res.mutations.length === 0) this.logSkill('mechanical: (none)');
    for (const m of res.mutations) this.applySkillMutation(m);

    const narration = await this.npcManager.narrateOutcome(message, res.success, languageName(getLocale()));
    const outcomeLine = narration || (res.success ? 'You pull it off.' : "It doesn't go your way.");
    this.logSkill(`narration: "${outcomeLine}"`);
    this.dialog.addNarrationLine(outcomeLine);
    this.speakNarration(outcomeLine);

    // A successful SURPRISE leaves a trace the target may notice on its next
    // deliberation (Fase 20G): seed a pending-tamper probe (Percepção/IT).
    if (res.success && res.surprise && agent && this.skillTamperKind(cls.effect)) {
      agent.seedTamper({ kind: this.skillTamperKind(cls.effect)!, playerSkillValue: skillValue });
    }

    // Social failures that come from PRESSURE (coerce, or an intimidation-driven
    // disposition shift) cost goodwill — caught trying to threaten or strong-arm
    // worsens disposition one step. Persuasion failures (effect=disposition with
    // skill=persuasao) and pure-narration paths don't punish. Pickpocket failures
    // count as "caught red-handed" by the same rule (Carisma 'hostil' family).
    const failed = !res.success && !!agent;
    const punitiveOnFail = failed && (
      cls.effect === 'steal' ||
      cls.effect === 'coerce' ||
      (cls.effect === 'disposition' && cls.skillId === 'intimidacao')
    );
    let caughtRedHanded = false;
    if (punitiveOnFail) {
      agent!.onHostilePlayerAction();
      caughtRedHanded = true;
      this.logSkill(`caught: ${cls.effect}/${cls.skillId} failed → ${agent!.definition.name} disposition=${agent!.getDisposition()}`);
    }

    // The target reacts (unless it was just robbed blind — a successful surprise
    // stays silent; being caught red-handed, by contrast, always provokes a reply).
    if (agent && (!res.surprise || caughtRedHanded)) {
      await this.streamNpcReply(agent, this.buildWorldSnapshot(agent, agent.distanceTo(this.player.getPosition())), message);
    }
    this.persistSession();
    return true;
  }

  /** The defensive profile + reachability of an NPC target for the skill engine. */
  /* istanbul ignore next — browser-only (reads runtime agents) */
  private skillTargetInfo(agent: NPCAgent, target2: string | null): SkillTargetInfo {
    const eStats = this.enemyStatsFor(agent);
    const other = target2 ? this.findAgentByName(target2) : null;
    const st = agent.getState();
    return {
      id: agent.definition.id,
      otherId: other?.definition.id ?? null,
      distance: agent.distanceTo(this.player!.getPosition()),
      aware: st === 'aware' || st === 'responding' || st === 'hostile',
      alive: !agent.isDefeated(),
      perception: eStats.skills['percepcao'] ?? 10,
      infotech: eStats.skills['tecnologia_informacao'] ?? 10,
      charisma: eStats.attributes.carisma,
      hasDeck: agent.getInventory().has('cyberdeck'),
    };
  }

  /** Find a live NPC by (display or real) name, case-insensitive. */
  /* istanbul ignore next — browser-only */
  private findAgentByName(name: string): NPCAgent | null {
    const n = name.trim().toLowerCase();
    for (const a of this.npcManager?.getAgents() ?? []) {
      if (a.isDefeated()) continue;
      if (a.definition.name.toLowerCase() === n || a.getDisplayName().toLowerCase() === n) return a;
    }
    return null;
  }

  /** Dev console trace for the skill-action pipeline (browser only; silent in tests). */
  /* istanbul ignore next — dev console logging, browser/Electron only */
  private logSkill(msg: string): void {
    if (typeof document === 'undefined') return;
    // eslint-disable-next-line no-console
    console.warn(`[Skill] ${msg}`);
  }

  /** Which tamper probe a surprise effect leaves on the target (Fase 20G), if any. */
  /* istanbul ignore next — browser-only skill-effect wiring */
  private skillTamperKind(effect: ActionClassification['effect']): 'theft' | 'hack' | 'social' | null {
    if (effect === 'steal') return 'theft';
    if (effect === 'info' || effect === 'sabotage') return 'hack';
    if (effect === 'relationship') return 'social';
    return null;
  }

  /** Diegetic line when a skill action is blocked (missing tool / range / target). */
  /* istanbul ignore next — browser-only skill-effect wiring */
  private skillBlockedLine(reason: BlockReason | undefined): string {
    switch (reason) {
      case 'no_tool': return t('skill.needTool');
      case 'out_of_range': return t('skill.outOfRange');
      case 'no_target': return t('skill.noTarget');
      case 'dead_target': return t('skill.deadTarget');
      default: return t('skill.cannot');
    }
  }

  /** Apply one resolved skill mutation to the world (browser-only). */
  /* istanbul ignore next — browser-only world mutation (engine plan is tested) */
  private applySkillMutation(m: SkillMutation): void {
    const mgr = this.npcManager;
    if (!mgr) return;
    this.logSkill(`mechanical: ${JSON.stringify(m)}`);
    switch (m.kind) {
      case 'begin_combat': {
        const mainHand = this.playerInventory.combatWeaponId;
        const openingAttack = mainHand && isFirearm(mainHand) ? 'ranged' : 'melee';
        // Remote attacks (IT hack) must not lunge the player into the target.
        this.beginCombat('player', m.targetId, { ambush: m.ambush, openingAttack, noLunge: m.remote });
        break;
      }
      case 'steal_credits': {
        const a = mgr.getAgent(m.targetId); if (!a) break;
        const bal = creditBalance(a.getInventory());
        if (bal > 0) {
          a.getInventory().transferTo(this.playerInventory, 'credstick', bal);
          this.dialog?.addSystemLine(t('skill.wired', { n: bal }));
        }
        break;
      }
      case 'steal_item': {
        const a = mgr.getAgent(m.targetId); if (!a) break;
        const loot = this.mostValuableLoot(a);
        if (loot) {
          a.getInventory().transferTo(this.playerInventory, loot, 1);
          this.dialog?.addSystemLine(t('skill.lifted', { item: t(itemDef(loot)?.nameKey ?? loot) }));
        }
        break;
      }
      case 'shift_disposition': {
        const a = mgr.getAgent(m.targetId); if (!a) break;
        for (let i = 0; i < m.steps; i++) m.dir === 'up' ? a.improveDisposition() : a.worsenDisposition();
        break;
      }
      case 'alter_relationship': {
        const a = mgr.getAgent(m.targetId); if (!a) break;
        for (let i = 0; i < m.steps; i++) m.dir === 'up' ? a.improveRelationship(m.otherId) : a.worsenRelationship(m.otherId);
        a.rememberEvent(`Someone turned you ${m.dir === 'up' ? 'toward' : 'against'} ${mgr.getAgent(m.otherId)?.definition.name ?? 'someone'}.`);
        break;
      }
      case 'coerce': {
        const a = mgr.getAgent(m.targetId); if (!a) break;
        for (let i = 0; i < m.steps; i++) a.worsenDisposition(); // fear
        const bal = creditBalance(a.getInventory());
        if (bal > 0) { a.getInventory().transferTo(this.playerInventory, 'credstick', bal); this.dialog?.addSystemLine(t('skill.wired', { n: bal })); }
        else { const loot = this.mostValuableLoot(a); if (loot) { a.getInventory().transferTo(this.playerInventory, loot, 1); this.dialog?.addSystemLine(t('skill.lifted', { item: t(itemDef(loot)?.nameKey ?? loot) })); } }
        break;
      }
      case 'heal': {
        const amount = 20 + Math.round((this.playerStats.skills['medicina'] ?? 10) / 5);
        if (m.targetId === null) { this.player?.getHealth().heal(amount); this.playerHealthState = this.player?.getHealth().toState() ?? this.playerHealthState; }
        else { mgr.getAgent(m.targetId)?.getHealth().heal(amount); }
        break;
      }
      case 'mark_sabotage': {
        mgr.getAgent(m.targetId)?.markSabotaged(); // combat hook lands in Fase 20H
        break;
      }
      case 'add_pda':
        this.recordPda(m.subjectId);
        break;
      case 'craft': {
        const wid = this.skillCraftTarget;
        const cost = scrapCostFor(wid) ?? 0;
        if (this.playerInventory.count('scrap') >= cost && cost > 0) {
          this.playerInventory.remove('scrap', cost);
          this.playerInventory.add(wid, 1);
          this.dialog?.addSystemLine(t('skill.crafted', { item: t(itemDef(wid)?.nameKey ?? wid), n: cost }));
        } else {
          this.dialog?.addSystemLine(t('skill.noScrap'));
        }
        break;
      }
      case 'repair':
        // No durability system yet — repair just succeeds narratively (placeholder).
        break;
      case 'haggle': {
        // A won haggle warms the NPC one step → the existing economy turns that into
        // a better discount (friendly −30% / neutral −15%). Reuses disposition.
        mgr.getAgent(m.targetId)?.improveDisposition();
        this.dialog?.addSystemLine(t('skill.haggled'));
        break;
      }
      case 'appraise':
        this.recordAppraisal(); // market read of what the player carries → PDA
        break;
    }
  }

  /**
   * Record intel on an NPC into the player's PDA (Fase 20 'info'/scan result): crack
   * the identity (anti-metagaming break), build a dossier of what the hack reveals
   * (role, attitude, credits, gear) and upsert it into the persisted PDA, then narrate.
   */
  /* istanbul ignore next — browser-only (reads runtime agents; PDA store is tested) */
  private recordPda(subjectId: string): void {
    const a = this.npcManager?.getAgent(subjectId);
    if (!a) return;
    a.markNameKnown(); // a successful scan cracks their identity
    this.pda = upsertPdaEntry(this.pda, { subjectId, subjectName: a.definition.name, lines: this.dossierLinesFor(a) });
    const line = t('skill.scanned', { name: a.definition.name, role: a.definition.role });
    this.dialog?.addNarrationLine(line);
    this.speakNarration(line);
  }

  /** Compose the dossier lines for a live NPC (role, disposition, credits, gear, market prices). */
  /* istanbul ignore next — browser-only (reads runtime agent state) */
  private dossierLinesFor(a: NPCAgent): string[] {
    const disp = a.getDisposition();
    const inv = a.getInventory();
    const items = a.getInventoryState().items
      .filter((s) => s.id !== 'credstick')
      .map((s) => t(itemDef(s.id)?.nameKey ?? s.id));
    const credits = creditBalance(inv);
    const lines = [
      t('pda.role', { role: a.definition.role }),
      t('pda.disposition', { value: disp }),
      t('pda.credits', { n: credits }),
      items.length ? t('pda.carrying', { items: items.join(', ') }) : t('pda.carryingNothing'),
    ];
    // Fase 21: indexar preços de venda quando o NPC pode negociar — o jogador
    // que descobriu o NPC via scan/ask vê as cotações ao vivo (recomputadas a
    // cada abertura, refletindo qualquer mudança de disposição).
    if (canTrade(disp)) {
      const sellable = sellableItems(inv);
      sellable.forEach((id) => {
        // Prefer the active pendingTrade price for this NPC/item (post-haggle)
        // over the recomputed base; the player just negotiated this number, so
        // the PDA should reflect what they were actually quoted.
        const livePrice = this.pendingTrade?.npcId === a.definition.id && this.pendingTrade.itemId === id
          ? this.pendingTrade.price
          : priceFor(id, disp);
        lines.push(t('pda.sellsFor', { item: t(itemDef(id)?.nameKey ?? id), price: livePrice }));
      });
    }
    return lines;
  }

  /**
   * Open the PDA with LIVE data (Fase 20: owner-decided). The scan UNLOCKS a
   * dossier entry; the contents (disposition/credits/items) are re-read fresh from
   * the live agent every time the PDA opens — your cyberdeck monitors. Entries
   * whose subject isn't loaded keep their last snapshot lines (best-effort).
   */
  /* istanbul ignore next — browser-only (live-refresh + show) */
  private openPda(): void {
    this.pda = this.pda.map((e) => {
      const a = this.npcManager?.getAgent(e.subjectId);
      if (!a) return e;
      return {
        ...e,
        subjectName: a.definition.name,
        lines: this.dossierLinesFor(a),
        deceased: a.isDefeated(), // stamps a red DECEASED mark in the overlay
      };
    });
    this.pdaOverlay?.show(this.pda);
  }

  /**
   * Commerce 'appraise': read the real value of everything the player carries into a
   * PDA "market read" dossier (Fase 20I). A successful Comércio check unlocks it.
   */
  /* istanbul ignore next — browser-only (reads runtime inventory; PDA store is tested) */
  private recordAppraisal(): void {
    const lines = this.playerInventory.toState().items
      .filter((s) => s.id !== 'credstick')
      .map((s) => `${t(itemDef(s.id)?.nameKey ?? s.id)}: ${itemValue(s.id)} cr × ${s.qty}`);
    this.pda = upsertPdaEntry(this.pda, {
      subjectId: '__market__',
      subjectName: t('skill.marketRead'),
      lines: lines.length ? lines : [t('pda.carryingNothing')],
    });
    const line = t('skill.appraised');
    this.dialog?.addNarrationLine(line);
    this.speakNarration(line);
  }

  /** The most valuable non-currency item id an NPC carries (for pickpocket/coerce). */
  /* istanbul ignore next — browser-only */
  private mostValuableLoot(a: NPCAgent): string | null {
    let best: string | null = null; let bestV = -1;
    for (const s of a.getInventoryState().items) {
      if (s.id === 'credstick') continue;
      const v = itemValue(s.id);
      if (v > bestV) { bestV = v; best = s.id; }
    }
    return best;
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
      const before = this.playerStats;
      this.playerStats = applySkillUse(this.playerStats, cls.skillId, SettingsService.get('skillGainMultiplier'));
      this.applyPerkPointGrants(before, this.playerStats);
    }
    agent.onHostilePlayerAction();
    const narration = await this.npcManager.narrateOutcome(message, result.success, languageName(getLocale()));
    {
      const blowLine = narration || (result.success ? 'Your blow lands hard.' : 'They reel back, snarling.');
      this.dialog.addNarrationLine(blowLine);
      this.speakNarration(blowLine);
    }

    if (agent.shouldInitiateCombat(true)) {
      this.dialog.close();
      this.startCombat(agent.definition.id);
      return true;
    }
    // Not yet hostile — the NPC reacts (its ultimatum) via a normal turn.
    await this.streamNpcReply(agent, this.buildWorldSnapshot(agent, agent.distanceTo(this.player.getPosition())), message);
    return true;
  }

  private buildWorldSnapshot(agent: NPCAgent, distanceMeters: number): WorldSnapshot {
    return {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters,
      playerAction: this.derivePlayerAction(),
      recentEvents: agent.getRecentEvents(), // e.g. "X was killed" — so the NPC knows
      nearbyNpcs: this.nearbyNpcsFor(agent),
      language: languageName(getLocale()),
      extraContext: this.commerceContextFor(agent),
    };
  }

  /**
   * Other live NPCs physically present with `agent` right now (within
   * SKILL_ACTION_RADIUS = 30 m — same "this quadrant" radius the deliberation
   * loop uses). Filters out the speaker, the dead, and anyone too far. Carries
   * the SPEAKER's own disposition toward each so the prompt can read tone.
   * Browser-only resolver of agent positions; the pure formatter is tested.
   */
  /* istanbul ignore next — browser-only co-presence assembly */
  private nearbyNpcsFor(agent: NPCAgent): NearbyNpcSnapshot[] {
    const mgr = this.npcManager;
    if (!mgr) return [];
    const selfId = agent.definition.id;
    const selfPos = agent.getPosition();
    const out: NearbyNpcSnapshot[] = [];
    for (const id of mgr.liveNpcIds()) {
      if (id === selfId) continue;
      const other = mgr.getAgent(id);
      if (!other || other.isDefeated()) continue;
      const op = this.npcHolderById.get(id)?.position ?? other.getPosition();
      const dx = op.x - selfPos.x;
      const dz = op.z - selfPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > SKILL_ACTION_RADIUS) continue;
      out.push({
        id,
        name: other.getDisplayName(),
        distanceMeters: dist,
        relationship: agent.getRelationship(id),
      });
    }
    return out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  /**
   * Phase 16: the commerce "levers" for a negotiable NPC (what it could sell at the
   * disposition price, which present rivals it could pay to have removed). Empty for
   * a hostile NPC or one with nothing to offer. Browser-only (the pure formatter is tested).
   */
  /* istanbul ignore next — browser-only commerce context assembly */
  private commerceContextFor(agent: NPCAgent): string | undefined {
    if (!this.npcManager) return undefined;
    const disp = agent.getDisposition();
    if (!canTrade(disp)) return undefined;
    const sellable = sellableItems(agent.getInventory()).map((id) => ({ name: this.itemName(id), price: priceFor(id, disp) }));
    const id = agent.definition.id;
    const rivals = this.npcManager.liveNpcIds()
      .filter((other) => other !== id && agent.isAntagonisticToward(other))
      .map((other) => this.npcManager!.getAgent(other)?.getDisplayName() ?? other);
    const inv = agent.getInventory();
    const payableItems = sellableItems(inv).map((i) => this.itemName(i));
    const ctx = PromptBuilder.buildCommerceContext({
      sellable,
      rivals: canOfferMission(disp) ? rivals : [],
      payableCredits: creditBalance(inv),
      payableItems,
    });
    return ctx || undefined;
  }

  /** Player position + facing for the addressing resolver. */
  private playerAim(): { x: number; z: number; facingYaw: number } {
    const p = this.player!.getPosition();
    return { x: p.x, z: p.z, facingYaw: this.player!.getFacing() };
  }

  /** All spawned NPCs as addressing candidates (name known only after introduction). */
  private buildAddressCandidates(): AddressCandidate[] {
    return (this.npcManager?.getAgents() ?? [])
      .filter((a) => !a.isDefeated()) // the dead are not addressable in chat (Fase 20)
      .map((a) => {
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

    // Procedural engine drone while piloting: a 180 Hz sine that glides to 220 Hz
    // when the player feeds movement input and back to 180 Hz when idle.
    const audio = (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'));
    if (driving) {
      audio?.startEngineTone();
      const moving = input.axis.x !== 0 || input.axis.z !== 0 || input.vertical !== 0;
      audio?.setEngineThrottle(moving);
    } else {
      audio?.stopEngineTone();
    }
    // Explosion the moment the nave is destroyed.
    const destroyed = this.vehicle.isDestroyed();
    if (destroyed && !this.naveWasDestroyed) this.sfx('explosion');
    this.naveWasDestroyed = destroyed;
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
      // teleport() also moves the physics capsule (a raw position.set is overridden
      // by the character controller → hero snapped back to its mount/spawn spot).
      this.player.teleport(new Vector3(p.x + 1.5, p.y, p.z));
      this.player.getRoot().setEnabled(true);
      this.player.startFalling(p.y); // kinematic fall path (no-physics/tests)
      this.cameraSystem.setTarget(this.player.getRoot());
      this.cameraSystem.exitVehicleMode();
    } else if (this.vehicle.canEnter(this.player.getPosition())) {
      this.vehicle.enter();
      // Apply the player's Piloting skill to vehicle max speed (Phase 19C).
      this.vehicle.setPilotagem(this.playerStats.skills['pilotagem'] ?? 10);
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

  /** ESC toggles pause, except while the dialog field is focused / a modal is open. */
  private handlePauseInput(): void {
    if (!this.inputSystem || !this.pauseMenu) return;
    if (!this.inputSystem.wasJustPressed('pause')) return;
    if (this.inventoryOverlay?.isOpen()) {
      // ESC closes the inventory rather than pausing.
      this.inventoryOverlay.close();
      return;
    }
    if (this.characterSheetOverlay?.isOpen()) {
      // ESC closes the character sheet rather than pausing.
      this.characterSheetOverlay.hide();
      return;
    }
    if (this.pdaOverlay?.isOpen()) {
      this.pdaOverlay.hide();
      return;
    }
    if (this.dialog?.isOpen()) {
      // ESC closes the dialog rather than pausing.
      if (!this.dialog.isInputFocused()) this.closeDialog();
      return;
    }
    this.pauseMenu.toggle();
    this.sfx('ui_open');
  }

  /** `I` opens the inventory (manage); while open, `I`/ESC closes it. */
  private handleInventoryInput(): void {
    if (!this.inputSystem || !this.inventoryOverlay) return;
    const overlay = this.inventoryOverlay;
    if (overlay.isOpen()) {
      if (this.inputSystem.wasJustPressed('inventory.open')) overlay.close();
      return;
    }
    // Don't open over another modal or while typing in the dialog.
    if (this.dialog?.isOpen() || this.pauseMenu?.isOpen() || this.gameOverMenu?.isOpen()) return;
    if (this.inputSystem.wasJustPressed('inventory.open')) {
      overlay.openManage(this.playerInventory);
      this.sfx('ui_open');
    }
  }

  /** `K` opens the character sheet; while open, `K`/ESC closes it. */
  private handleCharacterSheetInput(): void {
    if (!this.inputSystem || !this.characterSheetOverlay) return;
    const overlay = this.characterSheetOverlay;
    if (overlay.isOpen()) {
      if (this.inputSystem.wasJustPressed('character.sheet.open')) overlay.hide();
      return;
    }
    if (this.dialog?.isOpen() || this.pauseMenu?.isOpen() || this.gameOverMenu?.isOpen()
      || this.inventoryOverlay?.isOpen()) return;
    if (this.inputSystem.wasJustPressed('character.sheet.open')) {
      overlay.show(this.playerStats);
      this.sfx('ui_open');
    }
  }

  /** `P` opens the PDA (intel dossiers); while open, `P`/ESC closes it. */
  private handlePdaInput(): void {
    if (!this.inputSystem || !this.pdaOverlay) return;
    const overlay = this.pdaOverlay;
    if (overlay.isOpen()) {
      if (this.inputSystem.wasJustPressed('pda.open')) overlay.hide();
      return;
    }
    if (this.dialog?.isOpen() || this.pauseMenu?.isOpen() || this.gameOverMenu?.isOpen()
      || this.inventoryOverlay?.isOpen() || this.characterSheetOverlay?.isOpen()) return;
    if (this.inputSystem.wasJustPressed('pda.open')) {
      this.openPda();
      this.sfx('ui_open');
    }
  }

  /** Check if any perk points were earned after a skill-use; update stats. */
  private applyPerkPointGrants(before: CharacterStats, after: CharacterStats): void {
    const grants = detectPerkPointGrants(before, after);
    if (Object.keys(grants).length > 0) {
      this.playerStats = grantPerkPoints(after, grants);
    }
  }

  /** `O` toggles the Adjust tool for the currently equipped held prop. */
  /* istanbul ignore next — browser-only camera/overlay wiring */
  private handleAdjustInput(): void {
    if (!this.inputSystem || !this.adjustOverlay) return;
    const overlay = this.adjustOverlay;
    if (overlay.isOpen()) {
      if (this.inputSystem.wasJustPressed('adjust.toggle')) overlay.close();
      return;
    }
    if (this.dialog?.isOpen() || this.pauseMenu?.isOpen() || this.gameOverMenu?.isOpen()
      || this.inventoryOverlay?.isOpen()) return;
    if (!this.inputSystem.wasJustPressed('adjust.toggle')) return;
    // Tune the main-hand prop if present, else the back prop.
    const equip = this.playerInventory.toState().equipped ?? {};
    const slot: EquipSlot = equip.main_hand ? 'main_hand' : 'back';
    const itemId = equip[slot];
    if (itemId) this.openAdjustFor(itemId, slot);
  }

  /** Open the Adjust tool for an equipped prop (from the key or the inventory button). */
  /* istanbul ignore next — browser-only camera/overlay wiring */
  private openAdjustFor(itemId: string, slot: EquipSlot): void {
    if (!this.adjustOverlay) return;
    const base = resolveAttachWith(itemId, slot, this.heldAttach);
    base.bone = boneFor(itemId, slot, this.heldAttach);
    const bones = (this.player?.getSkeleton()?.bones ?? []).map((b) => b.name);
    // Camera stays as the default close follow view — no zoom/orbit override.
    this.adjustOverlay.open(itemId, slot, base, bones);
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

    this.hud.setHudTextVisible(true); // restored when not in combat
    this.hud.setVehicleStatus(this.deriveVehicleStatus());
    this.hud.setActionPrompt(this.deriveActionPrompt(dialogOpen));
  }

  /**
   * Keep the action ribbon visible only during free, on-foot play and reflect the
   * equipped firearm (gates Attack Ranged). Hidden while combat / a dialog / an
   * overlay / surprise-aiming / the vehicle owns the screen.
   */
  /* istanbul ignore next — browser-only HUD glue (reads overlay visibility) */
  private syncActionRibbon(): void {
    if (!this.actionRibbon) return;
    const busy = (this.combat?.isOpen() ?? false)
      || (this.dialog?.isOpen() ?? false)
      || (this.inventoryOverlay?.isOpen() ?? false)
      || (this.characterSheetOverlay?.isOpen() ?? false)
      || (this.pdaOverlay?.isOpen() ?? false)
      || (this.adjustOverlay?.isOpen() ?? false)
      || (this.pauseMenu?.isOpen() ?? false)
      || (this.gameOverMenu?.isOpen() ?? false)
      || this.gameOver
      || !!this.surpriseTargeting
      || (this.vehicle?.isOccupied() ?? false);
    this.actionRibbon.setVisible(!busy);
    const main = this.playerInventory.combatWeaponId;
    this.actionRibbon.setFirearmEquipped(!!main && isFirearm(main));
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
      if (agent && agent.isDefeated()) {
        return agent.isNameKnown() ? t('hud.searchTo', { name: agent.definition.name }) : t('hud.search');
      }
      if (agent) return agent.isNameKnown() ? t('hud.talkTo', { name: agent.definition.name }) : t('hud.talk');
    }
    // No NPC/bike in reach — offer to pick up a nearby dropped pile (Fase 18).
    if (this.player) {
      const pp = this.player.getPosition();
      const idx = nearestGroundItemIndex(this.groundItems, pp.x, pp.z, GameWorldScene.PICKUP_RADIUS);
      if (idx >= 0) {
        const def = itemDef(this.groundItems[idx].id);
        return t('hud.pickUp', { name: def ? t(def.nameKey) : this.groundItems[idx].id });
      }
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
  getInventoryOverlay(): InventoryOverlay | null { return this.inventoryOverlay; }
  getPlayerInventory(): Inventory { return this.playerInventory; }

  /** Localized weapon label for the combat log (the item name, or "fists" when unarmed). */
  weaponLabel(weaponId: string | null): string {
    const def = weaponId ? itemDef(weaponId) : undefined;
    return def ? t(def.nameKey) : t('item.fists');
  }
  getGameOverMenu(): GameOverMenu | null { return this.gameOverMenu; }
  getCombat(): CombatOverlay | null { return this.combat; }
  getHud(): WorldHud | null { return this.hud; }
}
