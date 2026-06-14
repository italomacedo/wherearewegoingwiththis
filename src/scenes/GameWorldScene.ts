import {
  Engine, Color4, Color3, Vector3, Matrix, AbstractMesh, TransformNode, MeshBuilder,
  PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, AnimationGroup, Animation, LinesMesh,
  SpotLight, StandardMaterial,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SceneManager } from '@core/SceneManager';
import {
  SaveService, VehicleSaveState, DEFAULT_PLAYER_HEALTH, DEFAULT_PLAYER_STAMINA, DEFAULT_VEHICLE_STATE,
} from '@systems/SaveService';
import { HealthState, describeCondition } from '@entities/Health';
import { Hunger } from '@entities/Hunger';
import { StaminaState } from '@entities/Stamina';
import { ZoneManager } from '@systems/ZoneManager';
import { PauseMenu } from '@systems/PauseMenu';
import { GameOverMenu } from '@systems/GameOverMenu';
import { WorldHud } from '@systems/WorldHud';
import { CameraSystem, KEY_ORBIT_SPEED } from '@systems/CameraSystem';
import { InputSystem } from '@systems/InputSystem';
import { PhysicsService } from '@systems/PhysicsService';
import { PlayerController } from '@entities/PlayerController';
import { VehicleController, VehicleDriveInput, DRIVER_SEAT_OFFSET, DRIVER_SEAT_YAW, DRIVER_SEAT_PITCH } from '@entities/VehicleController';
import { VehicleCockpit, COCKPIT_TRANSFORM, WAVEFORM_BARS, DRIVER_HEAD_RAISE, DRIVER_HEAD_PITCH_DOWN } from '@entities/VehicleCockpit';
import { createRoxane } from '@entities/npcs/roxane';
import { downsampleBars } from '@systems/audio/Waveform';
import { MercadoSombrasZone } from '@entities/zones/MercadoSombrasZone';
import { WorldZone } from '@entities/WorldZone';
import { GameClock, DayPeriod } from '@systems/GameClock';
import { SkyRenderer, computeSkyState } from '@systems/SkySystem';
import { CharacterAppearance, DEFAULT_APPEARANCE, applyArmorOverlay } from '@entities/CharacterData';
import { Inventory, defaultInventoryState } from '@entities/Inventory';
import { weaponProfile, itemDef, isMeleeWeapon, isFirearm, armorOverlayParts, itemValue } from '@entities/items/ItemCatalog';
import {
  resolveSkillAction, SkillActionInput, SkillTargetInfo, SkillMutation, BlockReason,
  SKILL_ACTION_RADIUS,
} from '@systems/skills/SkillActions';
import { craftTargetFromText, scrapCostFor, sabotageDamage } from '@systems/skills/Crafting';
import { checkLine } from '@systems/skills/CheckLine';
import {
  canTrade, canOfferMission, priceFor, sellableItems, creditBalance, payCredits, grantCredits,
} from '@systems/economy/Economy';
import {
  Mission, RewardOffer, completeMission,
} from '@systems/economy/Missions';
import {
  SpiceContract, SpiceSide, SPICE_ID, SPICE_LOT, canOfferSpice, spiceBuyPrice,
  clampSpicePrice, makeSpiceContract, completeSpiceReport,
} from '@systems/economy/SpiceTrade';
import { InventoryOverlay } from '@systems/InventoryOverlay';
import { HeldItemRig, resolveAttachWith, boneFor, AttachOverrides, flashlightActive, idleOverrideClip } from '@systems/HeldItems';
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
import { hasEmote, isCheckTimeEmote, narrateTime, ActionClassification } from '@systems/npc/EmoteIntent';
// Fase 21 unified action pipeline (verbal path wired here; emote + autonomy migration in 21G).
import { PlayerActor, NpcActor } from '@systems/actions/Actor';
import { resolveAction, ResolveOptions } from '@systems/actions/Resolver';
import { applyMutations, ApplierContext } from '@systems/actions/Applier';
import type { Mutation } from '@systems/actions/Mutations';
import {
  CharacterStats, AttributeId, createDefaultStats, checkValue, applySkillUse,
  detectPerkPointGrants, grantPerkPoints, skillDef,
} from '@entities/CharacterStats';
import { CharacterSheetOverlay } from '@systems/CharacterSheetOverlay';
import { PdaOverlay } from '@systems/PdaOverlay';
import { PdaEntry, upsertPdaEntry } from '@systems/pda/Pda';
import { resolveCheck } from '@systems/SkillCheck';
import { t, getLocale, languageName } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';
import { CombatOverlay } from '@systems/combat/CombatOverlay';
import { CombatController, CombatLogEntry } from '@systems/combat/CombatController';
import { combatClipFor, attackClipFor, combatStanceClip, CombatClipState, genderOfOutfit } from '@assets/AvatarMeshCatalog';
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
import { tileOf, tileKey, tileLocalToWorld, worldFloorBox, worldBounds, neighbors, type TileCoord } from '@systems/world/WorldGrid';
import { GroundItem, addGroundItem, removeGroundItemAt, nearestGroundItemIndex } from '@systems/world/GroundItems';
import { themeOf, ARCHETYPES } from '@assets/world/ThemeRegistry';
import {
  generateTileAuthored, doorTriggersForTile, propDoorTriggersForTile, seedItemsForTile, sceneNpcToDefinition,
  sleepTriggersForTile, isBedModel,
  type WorldDoorTrigger, type WorldSleepTrigger,
} from '@systems/world/SceneDocToTile';
import {
  interiorWorldPos, doorTriggerHit, sleepTriggerHit, interiorItemKey, INTERIOR_HALF, INTERIOR_ORIGIN,
} from '@systems/world/InteriorRuntime';
import { SleepOverlay } from '@systems/SleepOverlay';
import {
  canSleep, computeSleepResult, wellRestedUntil, sleepGainMultiplier, SLEEP_DURATION_SECONDS,
} from '@systems/SleepSystem';
import { loadAllSceneDocs } from '@systems/world/SceneDocSource';
import { partnerDoor, arrivalPoint, contentCentroid, type SceneDoc } from '@systems/sceneeditor/SceneDoc';
import { buildMinimapView, type MinimapEntity } from '@systems/MinimapModel';
import { AssetCache, babylonContainerLoader } from '@systems/world/AssetCache';

/** Max seconds a single frame may advance the simulation. */
export const MAX_FRAME_DELTA = 0.1;

/** Game-time advance per real second (12 → 1 game-day = 2 real hours). */
export const TIME_SCALE = 12;

/** Seated-driver pose: the embedded 'Death' clip (renamed 'death') frozen at a
 *  frame that reads as sitting at the wheel — owner-picked via the scrub harness. */
export const DRIVING_POSE_CLIP = 'death';
export const DRIVING_POSE_FRAME = 20;

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
 * Trailing-camera follow rate (per second) used to ease the orbit behind a driven
 * vehicle. High enough that a sustained turn (≈1.8 rad/s steering) leaves only a
 * small, quickly-recovered lag instead of a persistent ~40° offset.
 */
export const CAMERA_TRAIL_RATE = 10;

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
  /** Below this Y the hero has fallen out of the world (the floor top is y=0). Used
   *  both to sanitize a corrupt saved spawn and as a runtime out-of-world catch. */
  private static readonly WORLD_FLOOR_Y = -5;
  /** Runtime: if the hero's Y drops below this, snap it back to ground (prevents the
   *  infinite free-fall that corrupts the save — e.g. a dt spike tunnels the floor). */
  private static readonly FALL_OUT_Y = -50;
  /** Prop instantiations per scenery-pump (time-slice → no burst hitch). */
  private static readonly TILE_LOAD_BUDGET = 2;
  /** How close (metres) the player must be to pick up a dropped pile (Fase 18). */
  private static readonly PICKUP_RADIUS = 2;
  /** Only NPCs within this radius of a fight can be recruited into it — keeps the
   * streamed world's neighbouring-tile NPCs out of a local brawl (Fase 18). */
  private static readonly COMBAT_RECRUIT_RADIUS = 30;
  /** World seed for deterministic tile generation (from the save; Phase D persists it). */
  private worldSeed = 1;
  private clock = new GameClock({ mode: 'fixed' }); // fixed: 1 game-day = 2 real hours
  private lastPeriod: DayPeriod | null = null;
  /** Dynamic sky (gradient dome + sun/moon/stars) following the GameClock. Browser-only. */
  private sky: SkyRenderer | null = null;
  private cameraSystem: CameraSystem | null = null;
  private inputSystem: InputSystem | null = null;
  private physics: PhysicsService | null = null;
  private player: PlayerController | null = null;
  private vehicle: VehicleController | null = null;
  private cockpit: VehicleCockpit | null = null;
  private npcManager: NPCManager | null = null;
  private injectedService: ClaudeNPCService | null = null;
  private dialog: DialogSystem | null = null;
  private chatMode: 'npc' | 'global' | 'roxane' = 'npc';
  /** Roxane — the car's onboard AI. A standalone agent (NOT in the NPCManager, so
   *  she never leaks into gossip/combat/save), reached only from the driver's seat. */
  private roxaneAgent: NPCAgent | null = null;
  /** The Claude service the manager uses; reused directly for Roxane's turns. */
  private claudeService: ClaudeNPCService | null = null;
  /** Scratch buffer for the TTS spectrum feeding the cockpit waveform. */
  private waveSamples: Uint8Array | null = null;
  private pauseMenu: PauseMenu | null = null;
  private inventoryOverlay: InventoryOverlay | null = null;
  private characterSheetOverlay: CharacterSheetOverlay | null = null;
  private pdaOverlay: PdaOverlay | null = null;
  /** The "sleeping" modal (fade + accelerated clock) shown when resting in a bed. */
  private sleepOverlay: SleepOverlay | null = null;
  /** Intel dossiers gathered by scanning/hacking NPCs (Fase 20 PDA), persisted. */
  private pda: PdaEntry[] = [];
  /** The weapon a pending `craft` action will produce (resolved from the emote text). */
  private skillCraftTarget = 'knife';
  /** Items dropped into the world (Fase 18), persisted in SaveGame.groundItems. */
  private groundItems: GroundItem[] = [];
  /** Live pickup markers, keyed by their GroundItem (browser-only). */
  private groundMarkers = new Map<GroundItem, AbstractMesh>();
  /** Authored quadrant docs (editor JSON), id-sorted — the streaming roll's input. */
  private quadrantDocs: SceneDoc[] = [];
  /** Every authored doc by id (quadrants + interiors — door-trigger targets). */
  protected sceneDocsById = new Map<string, SceneDoc>();
  /** seededItemKey entries the player already collected (persisted). */
  private collectedSceneItems: string[] = [];
  /** World-space door triggers of the loaded authored quadrant tiles. */
  private tileDoorTriggers = new Map<string, WorldDoorTrigger[]>();
  /** World-space bed sleep triggers of the loaded authored quadrant tiles. */
  private tileSleepTriggers = new Map<string, WorldSleepTrigger[]>();
  /** Neon door-volume meshes per tile key (disposed with the tile). */
  private doorVisuals = new Map<string, AbstractMesh[]>();
  // ── Active interior (one at a time, built at INTERIOR_ORIGIN — F6) ──
  private interiorId: string | null = null;
  /** The interior's OWN door triggers (its exit doors), built on enter. */
  private interiorDoorTriggers: WorldDoorTrigger[] = [];
  /** The interior's bed sleep triggers, built on enter. */
  private interiorSleepTriggers: WorldSleepTrigger[] = [];
  /** The mosaic tile the player entered the interior from — the exit door lands
   *  them back on this tile (a quadrant doc placed there). */
  private interiorOriginTile: [number, number] | null = null;
  private interiorRoot: TransformNode | null = null;
  private interiorAggregates: PhysicsAggregate[] = [];
  /** Door triggers fire only when armed: disarmed on teleport, re-armed once
   *  the player is clear of every trigger (prevents enter/exit ping-pong). */
  private doorArmed = true;
  /** The authored quadrant doc id per loaded tile key (for reciprocal door
   *  pairing: a door's partner is the target scene's door pointing back here). */
  private tileDocId = new Map<string, string>();
  /** A save made inside an interior: rebuild it after the world boots. */
  private pendingInteriorRestore: { sceneId: string; originTile?: [number, number]; entry?: WorldDoorTrigger } | null = null;
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
  /** The looping fighting-stance clip each combatant holds while standing in combat
   *  (by weapon). Drives the "return to idle" of every combat clip so fighters read
   *  as engaged, not relaxed. Cleared on combat end. */
  private combatStance = new Map<string, string>();
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
  private static readonly COMBAT_RUN_SPEED = 5.2;  // u/s — combatants RUN to their move target (urgency)
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
  /** Active/complete spice-trafficking contracts (Fase 22). */
  private spiceContracts: SpiceContract[] = [];
  /** A spice deal STAGED with one NPC (discovery/pricing/haggle); the commit executes it.
   *  Ephemeral, per-conversation — mirrors `pendingTrade`. `base` is the un-haggled
   *  quote (for the haggle clamp). */
  private pendingSpice: { npcId: string; side: SpiceSide; unitPrice: number; qty: number; base: number } | null = null;
  /** Side + doses moved by the last execute (so the reply directive narrates the truth). */
  private lastSpiceDeal: { side: SpiceSide; qty: number; total: number } | null = null;
  private pendingTrade: { npcId: string; itemId: string; price: number } | null = null;
  private pendingMission: Mission | null = null;
  /**
   * One-shot directive describing the outcome a verbal action just staged
   * (e.g. "you offered the player a contract to kill X for Y cr"). Consumed
   * once by the next buildWorldSnapshot so the NPC reply narrates the specific
   * decision (target name + reward) instead of improvising blind. (Fase 21.)
   */
  private verbalActionContext: string | undefined;
  private gameTimeSeconds = 0;
  /** Game-time of the last sleep (once-per-24h cooldown). undefined = never slept. */
  private lastSleepGameTime: number | undefined = undefined;
  /** Game-time the temporary "Well Rested" buff (2× gains) expires. */
  private wellRestedUntilGameTime: number | undefined = undefined;
  private saveId = '';
  private spawnOverride: Vector3 | null = null;
  private playerHealthState: HealthState = { ...DEFAULT_PLAYER_HEALTH };
  /** Live hunger (slow HP regen battery; persisted). */
  private playerHunger: Hunger = new Hunger();
  /** Edge-trigger for the diegetic "stomach growling" line. */
  private hungerWasLow = false;
  /** Saved sprint stamina, applied to the player on spawn (persisted). */
  private playerStaminaState: StaminaState = { ...DEFAULT_PLAYER_STAMINA };
  private vehicleState: VehicleSaveState = {
    health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
  };
  private gameOver = false;

  /** Loading overlay GUI and animated sub-controls (browser-only, shown during doLoad). */
  private loadingGui: AdvancedDynamicTexture | null = null;
  private loadingProgressFill: Rectangle | null = null;
  private loadingProgressLabel: TextBlock | null = null;
  private loadingSpinnerObs: (() => void) | null = null;
  /** Settled when doLoad() finishes (or errors). Stored so onExit() can await it
   *  before tearing down, preventing the fire-and-forget doLoad() from racing with
   *  the afterEach cleanup in tests. */
  private loadPromise: Promise<void> = Promise.resolve();

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
    this.lastSleepGameTime = session.lastSleepGameTime;
    this.wellRestedUntilGameTime = session.wellRestedUntilGameTime;
    this.playerHealthState = session.playerHealth ?? { ...DEFAULT_PLAYER_HEALTH };
    this.playerHunger = Hunger.fromState(session.playerHunger);
    this.playerStaminaState = session.playerStamina ?? { ...DEFAULT_PLAYER_STAMINA };
    this.missions = session.missions ?? [];
    this.spiceContracts = session.spiceContracts ?? [];
    this.groundItems = session.groundItems ?? [];
    this.collectedSceneItems = session.collectedSceneItems ?? [];
    this.pda = session.pda ?? [];
    this.vehicleState = session.vehicle ?? {
      health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
    };
    if (session.world?.zone) this.startZoneId = session.world.zone;
    if (typeof session.world?.worldSeed === 'number') this.worldSeed = session.world.worldSeed;
    this.pendingInteriorRestore = session.world?.interior ?? null;
    const [x, y, z] = session.world?.position ?? [0, 0, 0];
    // Treat an all-zero saved position as "use the zone's spawn point".
    if (x !== 0 || y !== 0 || z !== 0) {
      this.spawnOverride = new Vector3(x, y, z);
    }
  }

  /**
   * Pure: resolve a safe spawn from a (possibly corrupt) saved override and the
   * zone's ground spawn. Keeps the saved X/Z (the tile is valid) but replaces a
   * non-finite or below-floor Y with the zone's ground height — rescuing a save
   * whose hero fell out of the world (e.g. y=-82817). No override → zone spawn.
   */
  static sanitizeSpawn(override: Vector3 | null, zoneSpawn: Vector3): Vector3 {
    if (!override) return zoneSpawn;
    const x = Number.isFinite(override.x) ? override.x : zoneSpawn.x;
    const z = Number.isFinite(override.z) ? override.z : zoneSpawn.z;
    const y = Number.isFinite(override.y) && override.y > GameWorldScene.WORLD_FLOOR_Y
      ? override.y
      : zoneSpawn.y;
    return new Vector3(x, y, z);
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
      ...(this.interiorId
        ? { interior: { sceneId: this.interiorId, originTile: this.interiorOriginTile ?? [0, 0] as [number, number] } }
        : {}),
    };
    const playerHealth = this.player?.getHealth().toState() ?? this.playerHealthState;
    const vehicle: VehicleSaveState = this.vehicle
      ? (() => {
          const vp = this.vehicle!.getPosition();
          return {
            health: this.vehicle!.getHealth().toState(),
            destroyed: this.vehicle!.isDestroyed(),
            position: [vp.x, vp.y, vp.z] as [number, number, number],
            facing: this.vehicle!.getFacing(),
          };
        })()
      : this.vehicleState;

    const character = { ...save.character, stats: this.playerStats };
    const inventory = this.playerInventory.toState();
    const playerHunger = this.playerHunger.toState();
    const playerStamina = this.player?.getStaminaState() ?? { ...DEFAULT_PLAYER_STAMINA };
    // Scene-seeded pickups regenerate from their docs — persist only real drops.
    const groundItems = this.groundItems.filter((g) => !g.seedKey);
    SaveService.save({
      ...save, character, world, gameTimeSeconds: this.gameTimeSeconds, npcMemory: memory, playerHealth, vehicle, inventory,
      heldAttach: this.heldAttach, playerHunger, playerStamina, missions: this.missions, spiceContracts: this.spiceContracts,
      groundItems, pda: this.pda, collectedSceneItems: this.collectedSceneItems,
      lastSleepGameTime: this.lastSleepGameTime, wellRestedUntilGameTime: this.wellRestedUntilGameTime,
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
      session.playerStamina = playerStamina;
      session.missions = this.missions;
      session.spiceContracts = this.spiceContracts;
      session.groundItems = groundItems;
      session.collectedSceneItems = this.collectedSceneItems;
      session.pda = this.pda;
      session.lastSleepGameTime = this.lastSleepGameTime;
      session.wellRestedUntilGameTime = this.wellRestedUntilGameTime;
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

    // Give the AudioManager this scene so SFX cues can play.
    (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'))?.setScene(this.babylonScene);

    this.inputSystem = new InputSystem();
    this.detachInput = this.inputSystem.attach();
    ServiceLocator.register('inputSystem', this.inputSystem);

    /* istanbul ignore if — loading overlay + fire-and-forget is browser/Electron only */
    if (typeof document !== 'undefined') {
      // Show the loading overlay immediately, then fire the heavy work WITHOUT
      // awaiting. The SceneManager creates its fade scrim AFTER onEnter returns,
      // so the overlay (created here) sits below it and is revealed as the scene
      // fades in — the player sees progress + a tip instead of a black void.
      this.buildLoadingOverlay();
      // Surface a swallowed throw in doLoad — a mid-load failure was leaving the
      // world half-built with a black screen and no error (esp. far-from-origin
      // saves that exercise spawnOverride + procedural streaming). Lições 34/46.
      this.loadPromise = this.doLoad().catch((e) => {
        console.error('[WorldLoad] doLoad FAILED — world left half-built:', e);
      });
      void this.loadPromise;
    } else {
      // Test / headless: await directly so the scene is fully initialised when
      // onEnter() returns (no loading overlay rendered headless).
      this.loadPromise = this.doLoad();
      await this.loadPromise;
    }
  }

  /** All the heavy async init that used to block onEnter — now runs post-fade so
   *  the loading overlay can show progress while it streams in. */
  private async doLoad(): Promise<void> {
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
    }

    // Physics BEFORE the zone + player so the zone can build static colliders and
    // the hero gets a Havok character controller. Resilient: if the WASM fails the
    // world still loads (movement falls back to the kinematic path).
    this.updateLoadingProgress(10, 'loading.label.physics');
    this.physics = new PhysicsService();
    ServiceLocator.register('physics', this.physics);
    try {
      await this.physics.init(this.babylonScene);
    } catch {
      // ignore — movement falls back to non-physics path
    }

    this.updateLoadingProgress(20, 'loading.label.zone');
    // Authored scenes (Scene Editor JSON) load BEFORE the zone: tile (0,0) reads
    // its props/NPCs from downtown.json when present (F5), quadrants join the
    // procedural roll, interiors are door targets. Fail-open: no docs → legacy
    // catalog downtown + pure procedural world.
    const sceneDocs = await loadAllSceneDocs();
    this.quadrantDocs = sceneDocs.filter((d) => d.kind === 'quadrant' && d.id !== 'downtown');
    this.sceneDocsById = new Map(sceneDocs.map((d) => [d.id, d]));
    const downtownDoc = this.sceneDocsById.get('downtown');
    this.zoneManager = new ZoneManager();
    this.zoneManager.register('mercado_sombras', () => new MercadoSombrasZone(
      true,
      downtownDoc && downtownDoc.props.length > 0 ? downtownDoc.props : null,
    ));
    ServiceLocator.register('zoneManager', this.zoneManager);

    const zone = await this.zoneManager.loadZone(this.startZoneId, this.babylonScene);
    this.zone = zone;
    this.updateTimeOfDay(); // initial light/fog tint for the current time of day

    // Dynamic sky: a gradient dome + sun/moon/stars that follow the GameClock, so the
    // open horizon camera looks out on a real sky instead of the near-black void.
    /* istanbul ignore next — browser-only sky renderer (SkySystem math is unit-tested) */
    if (typeof document !== 'undefined' && this.cameraSystem) {
      this.sky = new SkyRenderer();
      await this.sky.init(this.babylonScene, this.cameraSystem.getCamera());
      this.updateSky();
    }

    this.updateLoadingProgress(40, 'loading.label.player');
    this.player = new PlayerController(this.babylonScene, this.inputSystem!);
    // Rescue a corrupt saved position: a hero who tunnelled through the world floor
    // (a dt spike on Alt+Tab, Lesson 45, or a rooftop-edge drop) gets its Y saved in
    // free-fall (e.g. y=-82817), and on reload the camera follows it into the void →
    // black screen. Keep the saved X/Z (the tile is valid) but snap a below-floor /
    // non-finite Y back to the zone's ground spawn height.
    const safeSpawn = GameWorldScene.sanitizeSpawn(this.spawnOverride, zone.getSpawnPoint());
    await this.player.spawn(safeSpawn, this.appearance);
    // Restore the saved stamina, then let Atletismo rescale the reserve
    // (setMaxForAtletismo preserves the saved fraction).
    this.player.setStaminaState(this.playerStaminaState);
    // Apply skill-driven movement speed (Phase 19C).
    this.player.setAtletismo(this.playerStats.skills['atletismo'] ?? 10);
    ServiceLocator.register('player', this.player);
    this.cameraSystem!.setTarget(this.player.getRoot());

    this.player.setHealthState(this.playerHealthState);

    // Show the hero's equipped props (weapon in hand, backpack on the back). The
    // rig no-ops headless (no skeleton); re-synced on every inventory change.
    this.playerHeldRig = new HeldItemRig(
      this.babylonScene, this.player.getSkeleton(), this.player.getRenderParts()[0] ?? null,
    );
    void this.syncPlayerHeldItems();
    // If the save has armor equipped, swap the avatar's regions to match (Phase 15).
    if (this.playerInventory.equippedArmorIds().length > 0) void this.rebuildPlayerArmor();

    // Park the nave near the spawn point — only when this save OWNS one. New
    // saves start without it (owned: false — the nave becomes purchasable);
    // legacy saves (owned undefined) keep theirs. Confined to the mosaic world
    // inside the border walls (small margin; the world isn't origin-centred).
    if (this.vehicleState.owned !== false) {
      this.vehicle = new VehicleController(this.babylonScene, { horizontalBounds: worldBounds(2) });
      // Restore the nave where it was last parked. Reuse the hero's spawn sanitizer so
      // a corrupt saved position (NaN → a Havok abort, Lesson 46; or a below-floor Y)
      // can't carry over to the nave; no saved position → the default spawn offset.
      const naveDefault = zone.getSpawnPoint().add(new Vector3(4, 0, 0));
      const savedNave = this.vehicleState.position;
      const naveSpawn = GameWorldScene.sanitizeSpawn(
        savedNave ? new Vector3(savedNave[0], savedNave[1], savedNave[2]) : null,
        naveDefault,
      );
      this.vehicle.spawn(naveSpawn, this.vehicleState.facing ?? 0);
      this.cockpit = new VehicleCockpit(this.babylonScene); // built lazily on first mount
      this.vehicle.setHealthState(this.vehicleState.health);
      this.vehicle.setDestroyed(this.vehicleState.destroyed);
      ServiceLocator.register('vehicle', this.vehicle);
    }

    this.updateLoadingProgress(60, 'loading.label.npcs');
    await this.setupNPCs();

    this.updateLoadingProgress(80, 'loading.label.ui');
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

    // Sleep modal (beds): fade to black + accelerated clock during an 8h rest.
    this.sleepOverlay = new SleepOverlay(this.babylonScene);

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
      onAdjustSeat: () => { this.sfx('ui_open'); this.openSeatAdjust(); },
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
    // Downtown doc content beyond props/NPCs: door triggers + seeded pickups for
    // the static tile (0,0), which the streamer never load/unloads.
    /* istanbul ignore next — browser-only seeding; the helpers are unit-tested */
    if (typeof document !== 'undefined') {
      const dt = this.sceneDocsById.get('downtown');
      if (dt) this.seedAuthoredTileContent(dt, 0, 0, tileKey(0, 0));
      // Saved inside an interior → rebuild it around the saved player position.
      if (this.pendingInteriorRestore) {
        const { sceneId, originTile, entry } = this.pendingInteriorRestore;
        this.pendingInteriorRestore = null;
        const doc = this.sceneDocsById.get(sceneId);
        if (doc) {
          // Rebuild the room + its exit doors and remember the origin tile. Migrate a
          // legacy `entry` (older saves) by deriving the tile from its position. We
          // respawn the player IN FRONT OF a door (teleport=true) rather than at the
          // raw saved position — this self-heals a save made at a bad spot (e.g. the
          // old origin-pad bug that dropped the player outside the room perimeter).
          const tile: [number, number] = originTile
            ?? (entry ? (() => { const t = tileOf(entry.position[0], entry.position[2]); return [t.tx, t.tz]; })() : [0, 0]);
          await this.enterInterior(doc, this.arrivalLocalFor(doc, ''), tile, true);
        }
      }
    }

    // A left-click commits an out-of-combat surprise attack (the ribbon entered
    // aiming). Listen on the CANVAS DOM directly — the most reliable signal (the
    // Babylon pointer observable can be swallowed by the camera input). Button 0
    // only, so right/middle-drag camera orbit never fires.
    /* istanbul ignore next — browser-only canvas listener */
    if (typeof document !== 'undefined') {
      const canvas = this.engine.getRenderingCanvas();
      if (canvas) {
        this.surpriseClickHandler = (e: PointerEvent) => {
          if (this.surpriseTargeting && e.button === 0) this.commitSurpriseTargeting();
        };
        canvas.addEventListener('pointerdown', this.surpriseClickHandler);
      }
    }

    // World is ready — fade the loading overlay out (no-op headless).
    this.updateLoadingProgress(100, 'loading.label.done');
    this.hideLoadingOverlay();
  }

  /** "Did you know?" loading tips: game mechanics + lore, bilingual, picked at random. */
  private static readonly LOADING_TIPS: Array<{ en: string; 'pt-BR': string }> = [
    { en: 'NPCs remember grudges. What you do today shapes tomorrow’s alliances.',
      'pt-BR': 'NPCs guardam rancor. O que você faz hoje molda as alianças de amanhã.' },
    { en: 'Press T to hail any NPC in range. Whisper, persuade, or intimidate — your call.',
      'pt-BR': 'Pressione T para abordar qualquer NPC ao alcance. Sussurre, persuada ou intimide — sua escolha.' },
    { en: 'Skills grow through use. Fight to get better at fighting. Talk to sharpen your tongue.',
      'pt-BR': 'Skills crescem com o uso. Lute para ficar melhor lutando. Fale para afiar a língua.' },
    { en: 'Equip a weapon before combat. Fists are free; a blade tips the odds.',
      'pt-BR': 'Equipe uma arma antes do combate. Punhos são de graça; uma lâmina muda as chances.' },
    { en: 'Armor absorbs punishment. Tactical is solid; space-grade borders on invulnerable.',
      'pt-BR': 'Armadura absorve pancada. A tática é sólida; a espacial beira a invulnerabilidade.' },
    { en: 'Intelligence 20+ unlocks hacking. Without a cyberdeck, the Net stays closed.',
      'pt-BR': 'Inteligência 20+ desbloqueia hacking. Sem um cyberdeck, a Net permanece fechada.' },
    { en: 'The PDA (P) tracks everyone you’ve met, scanned, or doublecrossed.',
      'pt-BR': 'O PDA (P) registra todos que você conheceu, escaneou ou traiu.' },
    { en: 'Hunger chips away at HP over time. Loot food; eat before you fight.',
      'pt-BR': 'A fome corrói o HP com o tempo. Saqueie comida; coma antes de lutar.' },
    { en: 'NPCs carry their own gear. Win the fight, search the corpse.',
      'pt-BR': 'NPCs carregam seus próprios itens. Vença a luta, reviste o cadáver.' },
    { en: 'The city breathes. Day and night shift who’s on the street — and why.',
      'pt-BR': 'A cidade respira. Dia e noite mudam quem está na rua — e por quê.' },
    { en: 'Mercado das Sombras: the gray market of Neo-Recife, where corpo credits spend like runner sweat.',
      'pt-BR': 'Mercado das Sombras: o mercado cinza de Neo-Recife, onde créditos corporativos valem tanto quanto o suor de um runner.' },
    { en: 'Zara is a hacktivist and street vendor. She doesn’t trust corps, but she’ll talk — if you give her reason.',
      'pt-BR': 'Zara é hacktivista e vendedora de rua. Ela não confia em corpos, mas vai conversar — se você der um motivo.' },
    { en: 'Credsticks are untraceable. That’s the point.',
      'pt-BR': 'Credsticks são inrrastreáveis. Esse é o ponto.' },
  ];

  /** Build the neon loading overlay shown while doLoad() streams the world in. */
  /* istanbul ignore next — browser-only Babylon GUI; pure logic lives in I18n + tips data */
  private buildLoadingOverlay(): void {
    if (typeof document === 'undefined') return;

    const tips = GameWorldScene.LOADING_TIPS;
    const locale = getLocale();
    const tip = tips[Math.floor(Math.random() * tips.length)]![locale === 'pt-BR' ? 'pt-BR' : 'en'];

    const gui = AdvancedDynamicTexture.CreateFullscreenUI('loading-ui', true, this.babylonScene);
    this.loadingGui = gui;

    // Full-screen dark scrim
    const scrim = new Rectangle('loading-scrim');
    scrim.width = '100%';
    scrim.height = '100%';
    scrim.background = 'rgba(2,5,11,0.96)';
    scrim.thickness = 0;
    gui.addControl(scrim);

    // Central neon frame
    const frame = new Rectangle('loading-frame');
    frame.width = '560px';
    frame.height = '380px';
    frame.background = 'rgba(7,14,24,0.98)';
    frame.color = '#0c4d57';
    frame.thickness = 2;
    frame.cornerRadius = 12;
    scrim.addControl(frame);

    // Title
    const title = new TextBlock('loading-title', 'WHERE ARE WE GOING WITH THIS');
    title.color = '#00FFCC';
    title.fontSize = 18;
    title.fontFamily = '"Courier New", monospace';
    title.height = '30px';
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.top = '28px';
    frame.addControl(title);

    // Accent line under the title
    const accent = new Rectangle('loading-accent');
    accent.width = '480px';
    accent.height = '2px';
    accent.background = '#00FFCC';
    accent.thickness = 0;
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    accent.top = '62px';
    frame.addControl(accent);

    // Animated spinner (cycles through quadrant glyphs every ~12 frames)
    const spinner = new TextBlock('loading-spinner', '◐');
    spinner.color = '#00FFCC';
    spinner.fontSize = 30;
    spinner.fontFamily = '"Courier New", monospace';
    spinner.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    spinner.top = '92px';
    frame.addControl(spinner);
    const frames = ['◐', '◓', '◑', '◒'];
    let tick = 0;
    let frameIdx = 0;
    const spinObs = this.babylonScene.onBeforeRenderObservable.add(() => {
      if (++tick % 12 === 0) { frameIdx = (frameIdx + 1) % frames.length; spinner.text = frames[frameIdx]!; }
    });
    this.loadingSpinnerObs = () => {
      if (spinObs) this.babylonScene.onBeforeRenderObservable.remove(spinObs);
    };

    // Progress bar track + fill
    const barTrack = new Rectangle('loading-bar-track');
    barTrack.width = '440px';
    barTrack.height = '8px';
    barTrack.background = 'rgba(0,28,40,0.9)';
    barTrack.color = '#1d3b46';
    barTrack.thickness = 1;
    barTrack.cornerRadius = 4;
    barTrack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    barTrack.top = '136px';
    frame.addControl(barTrack);

    const barFill = new Rectangle('loading-bar-fill');
    barFill.width = '0%';
    barFill.height = '100%';
    barFill.background = '#00FFCC';
    barFill.thickness = 0;
    barFill.cornerRadius = 4;
    barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barTrack.addControl(barFill);
    this.loadingProgressFill = barFill;

    // Progress label (e.g. "Loading the city…")
    const progressLabel = new TextBlock('loading-progress-label', '');
    progressLabel.color = '#7d93a6';
    progressLabel.fontSize = 11;
    progressLabel.fontFamily = '"Courier New", monospace';
    progressLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    progressLabel.top = '150px';
    frame.addControl(progressLabel);
    this.loadingProgressLabel = progressLabel;

    // Divider before the tip
    const divider = new Rectangle('loading-divider');
    divider.width = '440px';
    divider.height = '1px';
    divider.background = '#0c4d57';
    divider.thickness = 0;
    divider.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    divider.top = '188px';
    frame.addControl(divider);

    // "DID YOU KNOW?" header
    const tipHeader = new TextBlock('loading-tip-header', t('loading.didyouknow'));
    tipHeader.color = '#00FFCC';
    tipHeader.fontSize = 11;
    tipHeader.fontFamily = '"Courier New", monospace';
    tipHeader.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tipHeader.top = '204px';
    frame.addControl(tipHeader);

    // Tip body (wrapping)
    const tipText = new TextBlock('loading-tip-text', `"${tip}"`);
    tipText.color = '#aec4d6';
    tipText.fontSize = 12;
    tipText.fontFamily = '"Courier New", monospace';
    tipText.textWrapping = true;
    tipText.width = '480px';
    tipText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tipText.top = '228px';
    frame.addControl(tipText);
  }

  /** Update the progress bar fill and label. No-ops in headless environments. */
  private updateLoadingProgress(pct: number, labelKey: string): void {
    /* istanbul ignore next — browser-only GUI update */
    if (this.loadingProgressFill) {
      this.loadingProgressFill.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
    /* istanbul ignore next */
    if (this.loadingProgressLabel) {
      this.loadingProgressLabel.text = t(labelKey);
    }
  }

  /** Fade the loading overlay out and dispose it. No-ops if no overlay exists. */
  /* istanbul ignore next — browser-only animation + disposal */
  private hideLoadingOverlay(): void {
    if (!this.loadingGui) return;
    const gui = this.loadingGui;
    this.loadingSpinnerObs?.();
    this.loadingSpinnerObs = null;
    this.loadingProgressFill = null;
    this.loadingProgressLabel = null;

    // Animate alpha 1 → 0 over ~500 ms, then dispose
    const totalMs = 500;
    const stepMs = 16;
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += stepMs;
      const alpha = Math.max(0, 1 - elapsed / totalMs);
      const ctrl = gui.getControlByName('loading-scrim');
      if (ctrl) ctrl.alpha = alpha;
      if (elapsed >= totalMs) {
        clearInterval(iv);
        gui.dispose();
        if (this.loadingGui === gui) this.loadingGui = null;
      }
    }, stepMs);
  }

  /** Build a procedural neighbor tile's SCENERY (skip (0,0); props stream via the pump). */
  /* istanbul ignore next — browser-only scenery; the tile DATA is unit-tested */
  private loadTile(c: TileCoord): void {
    if (c.tx === 0 && c.tz === 0) return; // the static downtown zone owns this tile
    if (typeof document === 'undefined') return; // headless: bookkeeping only
    const key = tileKey(c.tx, c.tz);
    if (this.tileScenery.has(key)) return;
    const { tile: gen, doc } = generateTileAuthored(c.tx, c.tz, this.worldSeed, this.quadrantDocs);
    const scenery = new TileScenery(this.babylonScene, gen.coord, gen.props, this.worldSeed, gen.ground, gen.urban);
    scenery.build(); // cheap synchronous frame; props instantiate via pumpTileLoads
    this.tileScenery.set(key, scenery);
    if (doc) this.seedAuthoredTileContent(doc, c.tx, c.tz, key);
  }

  /** Register an authored quadrant tile's door triggers + uncollected item pickups. */
  /* istanbul ignore next — browser-only; the per-tile data helpers are unit-tested */
  private seedAuthoredTileContent(doc: SceneDoc, tx: number, tz: number, key: string): void {
    // Two kinds of door: invisible authored `doorTriggers` (need a neon marker so
    // the player can find them) and door PROPS (a placed door GLB carrying a
    // targetSceneId — the model is its own visual, no marker). Both are activated
    // by F (handleDoorInput).
    const invisible = doorTriggersForTile(doc, tx, tz);
    this.tileDoorTriggers.set(key, [...invisible, ...propDoorTriggersForTile(doc, tx, tz)]);
    // Bed props become "sleep" triggers (auto-detected by model name). No marker —
    // the bed GLB is its own visual; the [E] Sleep prompt cues the player.
    const sleeps = sleepTriggersForTile(doc, tx, tz);
    if (sleeps.length > 0) this.tileSleepTriggers.set(key, sleeps);
    this.tileDocId.set(key, doc.id); // for reciprocal door pairing
    // Visible neon volume per invisible door so the player can find the entrance.
    const visuals: AbstractMesh[] = [];
    for (const t of invisible) {
      const vol = MeshBuilder.CreateBox(`door-vol-${t.key}`, { width: t.size[0], height: t.size[1], depth: t.size[2] }, this.babylonScene);
      vol.position.set(t.position[0], t.position[1] + t.size[1] / 2, t.position[2]);
      const mat = new StandardMaterial(`door-vol-mat-${t.key}`, this.babylonScene);
      mat.emissiveColor = new Color3(0, 0.5, 0.4);
      mat.alpha = 0.3;
      vol.material = mat;
      vol.isPickable = false;
      visuals.push(vol);
    }
    if (visuals.length > 0) this.doorVisuals.set(key, visuals);
    for (const g of seedItemsForTile(doc, tx, tz, this.collectedSceneItems)) {
      this.groundItems = addGroundItem(this.groundItems, g);
      this.spawnGroundMarker(g);
    }
  }

  /** Tear down a procedural neighbor tile's scenery + any NPCs still on it. */
  /* istanbul ignore next — browser-only scenery/NPC disposal */
  private unloadTile(c: TileCoord): void {
    if (c.tx === 0 && c.tz === 0) return;
    const key = tileKey(c.tx, c.tz);
    this.tileScenery.get(key)?.dispose();
    this.tileScenery.delete(key);
    this.despawnTileNpcs(key); // belt-and-braces (NPCs normally leave via the r1 ring first)
    // Authored-tile content streams out with the tile (it re-seeds on reload).
    this.tileDoorTriggers.delete(key);
    this.tileSleepTriggers.delete(key);
    this.tileDocId.delete(key);
    this.doorVisuals.get(key)?.forEach((m) => m.dispose());
    this.doorVisuals.delete(key);
    const keep: GroundItem[] = [];
    for (const g of this.groundItems) {
      if (g.seedKey && g.tile[0] === c.tx && g.tile[1] === c.tz) {
        this.groundMarkers.get(g)?.dispose();
        this.groundMarkers.delete(g);
      } else {
        keep.push(g);
      }
    }
    this.groundItems = keep;
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
    // Inside an interior, only its own NPCs deliberate (same cost bound).
    const awake = this.interiorId
      ? new Set<string>(this.tileNpcIds.get(`interior:${this.interiorId}`) ?? [])
      : (() => {
          const cur = this.worldStreamer!.getCurrentTile();
          const curKey = tileKey(cur.tx, cur.tz);
          return new Set<string>(curKey === '0,0' ? this.zoneNpcIds : (this.tileNpcIds.get(curKey) ?? []));
        })();
    for (const a of this.npcManager.getAgents()) a.setAwake(awake.has(a.definition.id));
  }

  /** Spawn a tile's logical NPC agents now; queue their (heavy) avatars for the pump. */
  /* istanbul ignore next — browser-only */
  private enqueueTileNpcs(key: string): void {
    if (this.npcTiles.has(key) || !this.npcManager) return;
    const [tx, tz] = key.split(',').map(Number);
    const { tile: gen } = generateTileAuthored(tx, tz, this.worldSeed, this.quadrantDocs);
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

  /**
   * Runtime catch: if the hero fell out of the world (Y below FALL_OUT_Y — e.g. a
   * dt spike tunnelled the 1-unit floor box), snap it back to ground above its
   * current X/Z instead of free-falling forever (which is what corrupted the save).
   */
  /* istanbul ignore next — needs a live physics fall; the threshold logic is trivial */
  private catchFallOutOfWorld(): void {
    if (!this.player) return;
    const p = this.player.getPosition();
    if (Number.isFinite(p.y) && p.y > GameWorldScene.FALL_OUT_Y) return;
    const groundY = this.zone?.getSpawnPoint().y ?? 0;
    const x = Number.isFinite(p.x) ? p.x : 0;
    const z = Number.isFinite(p.z) ? p.z : 0;
    console.warn('[WorldLoad] hero fell out of world — recovering', { from: [p.x, p.y, p.z] });
    this.player.teleport(new Vector3(x, groundY, z));
  }

  /** Feed the player's world position to the streamer each frame (browser only). */
  /* istanbul ignore next — thin browser glue over the unit-tested WorldStreamer */
  private streamWorld(): void {
    // Inside an interior the mosaic is paused (the player is at INTERIOR_ORIGIN,
    // far off-grid) — keep pumping queued NPC avatar builds (the interior's own).
    if (this.interiorId) {
      void this.pumpNpcSpawns();
      return;
    }
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

  /**
   * Door triggers (F6): a door is entered/left by pressing F while standing in its
   * volume (handleDoorInput) — quadrant prop-doors and the interior return alike.
   * This tick only manages the anti-ping-pong latch: `doorArmed` is cleared on every
   * teleport and re-armed once the player steps clear of all volumes, so the spawn
   * lands the player inside the return volume without an instant re-trigger.
   */
  /* istanbul ignore next — per-frame browser glue; InteriorRuntime math is unit-tested */
  private tickDoors(): void {
    if (typeof document === 'undefined' || !this.player) return;
    if (this.vehicle?.isOccupied() || this.combatEnc) return;
    if (!this.doorArmed && !doorTriggerHit(this.player.getPosition(), this.currentDoorTriggers())) {
      this.doorArmed = true; // clear of every volume → re-arm
    }
  }

  /** The door triggers in reach right now: the return volume inside an interior,
   *  else the current tile's doors (invisible triggers + door props). */
  /* istanbul ignore next — browser-only (worldStreamer/interior exist at runtime) */
  private currentDoorTriggers(): WorldDoorTrigger[] {
    if (this.interiorId) return this.interiorDoorTriggers;
    const cur = this.worldStreamer?.getCurrentTile();
    return cur ? (this.tileDoorTriggers.get(tileKey(cur.tx, cur.tz)) ?? []) : [];
  }

  /** Bed sleep triggers in reach: the interior's beds inside one, else the current tile's. */
  /* istanbul ignore next — browser-only (worldStreamer/interior exist at runtime) */
  private currentSleepTriggers(): WorldSleepTrigger[] {
    if (this.interiorId) return this.interiorSleepTriggers;
    const cur = this.worldStreamer?.getCurrentTile();
    return cur ? (this.tileSleepTriggers.get(tileKey(cur.tx, cur.tz)) ?? []) : [];
  }

  /** The authored quadrant doc id of the scene the player is currently in (the
   *  interior doc inside one, else the current tile's quadrant doc). '' = none. */
  /* istanbul ignore next — browser-only (worldStreamer exists at runtime) */
  private currentSceneId(): string {
    if (this.interiorId) return this.interiorId;
    const cur = this.worldStreamer?.getCurrentTile();
    return cur ? (this.tileDocId.get(tileKey(cur.tx, cur.tz)) ?? '') : '';
  }

  /**
   * F near a door: enter its target interior (or leave the current one). Returns
   * true when it consumed the F press, so the vehicle handler doesn't also fire.
   */
  /* istanbul ignore next — browser-only input glue; the door helpers are unit-tested */
  private handleDoorInput(): boolean {
    if (typeof document === 'undefined' || !this.inputSystem || !this.player) return false;
    if (this.vehicle?.isOccupied() || this.combatEnc) return false;
    const hit = doorTriggerHit(this.player.getPosition(), this.currentDoorTriggers());
    if (!hit || !this.doorArmed) return false;
    if (!this.inputSystem.wasJustPressed('vehicle.enter')) return false; // near a door, F not pressed
    return this.traverseDoor(hit);
  }

  /**
   * Paired-door travel: go to the hit door's target SCENE and spawn at the PARTNER
   * door's pad there — the partner is the target scene's door that points back to
   * the scene we're leaving (reciprocal), else its first door. Entering a quadrant
   * door builds the interior; an interior door drops back onto the entry tile.
   */
  /* istanbul ignore next — browser-only travel glue; partnerDoor/pads are unit-tested */
  private traverseDoor(hit: WorldDoorTrigger): boolean {
    const targetDoc = this.sceneDocsById.get(hit.targetSceneId);
    if (!targetDoc) return false;
    const local = this.arrivalLocalFor(targetDoc, this.currentSceneId());
    if (targetDoc.kind === 'interior') {
      if (this.interiorId) return false; // no interior→interior chaining
      const cur = this.worldStreamer?.getCurrentTile() ?? { tx: 0, tz: 0 };
      void this.enterInterior(targetDoc, local, [cur.tx, cur.tz], true);
    } else if (this.interiorId) {
      // Back out to a quadrant: spawn in front of the partner door, in the tile we
      // came from.
      const [tx, tz] = this.interiorOriginTile ?? [0, 0];
      this.exitInteriorTo(new Vector3(...tileLocalToWorld(tx, tz, local)));
    } else {
      // Quadrant→quadrant on the same tile (edge): spawn in front of the partner door.
      const cur = this.worldStreamer?.getCurrentTile() ?? { tx: 0, tz: 0 };
      this.player?.teleport(new Vector3(...tileLocalToWorld(cur.tx, cur.tz, local)));
      this.doorArmed = false;
    }
    return true;
  }

  /** Scene-local arrival spot in `targetDoc` for someone arriving from `fromScene`:
   *  automatically in front of the partner door (reciprocal, else first), toward
   *  the room's content. Falls back to the content centre when there's no door. */
  private arrivalLocalFor(targetDoc: SceneDoc, fromScene: string): [number, number, number] {
    const partner = partnerDoor(targetDoc, fromScene);
    return partner ? arrivalPoint(targetDoc, partner.position) : contentCentroid(targetDoc);
  }

  /**
   * Build the target interior at INTERIOR_ORIGIN and move the player inside, at
   * `spawnPad` (interior-local — the partner door's pad). `originTile` is the
   * mosaic tile entered from, so an exit door can drop back onto it.
   */
  /* istanbul ignore next — browser-only meshes/physics/teleport */
  private async enterInterior(
    doc: SceneDoc, spawnPad: [number, number, number], originTile: [number, number], teleport: boolean,
  ): Promise<void> {
    if (this.interiorId) return;
    const scene = this.babylonScene;
    this.interiorId = doc.id;
    this.interiorOriginTile = originTile;
    this.doorArmed = false;
    const root = new TransformNode('interior-root', scene);
    this.interiorRoot = root;
    const [ox, , oz] = INTERIOR_ORIGIN;

    // Room: tinted ground + perimeter/floor colliders.
    const ground = MeshBuilder.CreateGround('interior-ground', { width: INTERIOR_HALF * 2, height: INTERIOR_HALF * 2 }, scene);
    ground.position.set(ox, 0, oz);
    const gmat = new StandardMaterial('interior-ground-mat', scene);
    const tint = doc.ground ?? [0.2, 0.2, 0.23];
    gmat.diffuseColor = new Color3(tint[0], tint[1], tint[2]);
    gmat.specularColor = Color3.Black();
    ground.material = gmat;
    ground.parent = root;
    if (scene.isPhysicsEnabled()) {
      const h = 6;
      const walls: Array<[string, number, number, number, number]> = [
        ['n', ox, oz + INTERIOR_HALF, INTERIOR_HALF * 2, 1],
        ['s', ox, oz - INTERIOR_HALF, INTERIOR_HALF * 2, 1],
        ['e', ox + INTERIOR_HALF, oz, 1, INTERIOR_HALF * 2],
        ['w', ox - INTERIOR_HALF, oz, 1, INTERIOR_HALF * 2],
      ];
      const mkCol = (name: string, cx: number, cy: number, cz: number, w: number, hh: number, d: number): void => {
        const box = MeshBuilder.CreateBox(name, { width: w, height: hh, depth: d }, scene);
        box.position.set(cx, cy, cz);
        box.isVisible = false;
        box.parent = root;
        this.interiorAggregates.push(new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene));
      };
      mkCol('int-col-floor', ox, -0.5, oz, INTERIOR_HALF * 2, 1, INTERIOR_HALF * 2);
      for (const [tag, cx, cz, w, d] of walls) mkCol(`int-col-${tag}`, cx, h / 2, cz, w, h, d);
    }

    // Bed props become sleep triggers built from their ACTUAL world bbox (pivot-
    // proof; the bed GLB origin may not be centred — Lesson 21), padded so the
    // player can rest from beside the bed.
    const sleepTriggers: WorldSleepTrigger[] = [];
    // Props (verbatim from the doc, offset to the interior origin).
    for (const prop of doc.props) {
      const holder = new TransformNode(`int-${prop.key}`, scene);
      holder.parent = root;
      const [px, py, pz] = interiorWorldPos(prop.position);
      holder.position.set(px, py, pz);
      holder.rotation.y = prop.rotationY ?? 0;
      const s = prop.scale ?? 1;
      if (typeof s === 'number') holder.scaling.setAll(s);
      else holder.scaling.set(s[0], s[1], s[2]);
      const inst = this.assetCache ? await this.assetCache.instantiate(prop.model, scene) : null;
      if (!inst) continue;
      inst.animationGroups.forEach((g) => g.stop());
      inst.rootNodes.forEach((n) => { (n as TransformNode).parent = holder; });
      if (isBedModel(prop.model)) {
        const { min, max } = holder.getHierarchyBoundingVectors(true);
        if (Number.isFinite(min.x) && Number.isFinite(max.x)) {
          sleepTriggers.push({
            key: `int-${doc.id}-bed-${prop.key}`,
            position: [(min.x + max.x) / 2, min.y, (min.z + max.z) / 2],
            size: [(max.x - min.x) + 3, (max.y - min.y) + 1, (max.z - min.z) + 3],
          });
        }
      }
      if (prop.solid && scene.isPhysicsEnabled()) {
        const { min, max } = holder.getHierarchyBoundingVectors(true);
        const size = max.subtract(min);
        if (Number.isFinite(size.x) && size.x > 0.05 && size.y > 0.05 && size.z > 0.05) {
          const box = MeshBuilder.CreateBox(`int-col-${prop.key}`, { width: size.x, height: size.y, depth: size.z }, scene);
          box.position.copyFrom(min.add(max).scale(0.5));
          box.isVisible = false;
          box.parent = root;
          this.interiorAggregates.push(new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene));
        }
      }
    }
    this.interiorSleepTriggers = sleepTriggers;

    // The interior's OWN exit doors (paired-door model — no auto-return). Invisible
    // doorTriggers get a neon marker; door PROPS are their own GLB visual (built in
    // the prop loop above). Both transition on F via traverseDoor.
    const triggers: WorldDoorTrigger[] = [];
    for (const d of doc.doorTriggers) {
      triggers.push({
        key: `int-${doc.id}-${d.key}`,
        position: interiorWorldPos(d.position),
        size: [...d.size] as [number, number, number],
        targetSceneId: d.targetSceneId,
        spawnPoint: [...d.spawnPoint] as [number, number, number],
      });
      const vol = MeshBuilder.CreateBox(`int-door-${d.key}`, { width: d.size[0], height: d.size[1], depth: d.size[2] }, scene);
      const [vx, vy, vz] = interiorWorldPos(d.position);
      vol.position.set(vx, vy + d.size[1] / 2, vz);
      const vmat = new StandardMaterial(`int-door-mat-${d.key}`, scene);
      vmat.emissiveColor = new Color3(0, 0.5, 0.4);
      vmat.alpha = 0.3;
      vol.material = vmat;
      vol.isPickable = false;
      vol.parent = root;
    }
    for (const p of doc.props) {
      if (typeof p.targetSceneId !== 'string' || p.targetSceneId.length === 0) continue;
      triggers.push({
        key: `int-${doc.id}-prop-${p.key}`,
        position: interiorWorldPos(p.position),
        size: [2.5, 3, 2.5],
        targetSceneId: p.targetSceneId,
        spawnPoint: [...(p.spawnPoint ?? [0, 0, 0])] as [number, number, number],
      });
    }
    this.interiorDoorTriggers = triggers;

    // NPCs: logical agents now (memory-restored by unique id), avatars via the pump.
    const intKey = `interior:${doc.id}`;
    if (this.npcManager && doc.npcs.length > 0) {
      const defs = doc.npcs.map((n) => sceneNpcToDefinition(
        n, `int_${doc.id}_${n.id}`, interiorWorldPos(n.position), doc.name,
      ));
      this.npcManager.spawnTile(intKey, defs, this.npcMemory);
      this.tileNpcIds.set(intKey, defs.map((d) => d.id));
      for (const def of defs) this.npcSpawnQueue.push({ key: intKey, def });
      this.npcTiles.add(intKey);
    }

    // Seeded pickups (uncollected).
    doc.items.forEach((item, i) => {
      const seedKey = interiorItemKey(doc.id, i);
      if (this.collectedSceneItems.includes(seedKey)) return;
      const [ix, iy, iz] = interiorWorldPos(item.position);
      const g: GroundItem = { tile: [-1, -1], pos: [ix, iy + 0.3, iz], id: item.itemId, qty: item.qty, seedKey };
      this.groundItems = addGroundItem(this.groundItems, g);
      this.spawnGroundMarker(g);
    });

    this.updateAwakeNpcs();
    if (teleport) this.player?.teleport(new Vector3(...interiorWorldPos(spawnPad)));
  }

  /** Tear the interior down, merge its NPC memory back, teleport to `back` (world). */
  /* istanbul ignore next — browser-only teardown/teleport */
  private exitInteriorTo(back: Vector3): void {
    const id = this.interiorId;
    if (!id) return;
    this.despawnTileNpcs(`interior:${id}`);
    this.interiorAggregates.forEach((a) => a.dispose());
    this.interiorAggregates = [];
    this.interiorRoot?.dispose();
    this.interiorRoot = null;
    // Interior seeded pickups stream out with the room.
    const keep: GroundItem[] = [];
    for (const g of this.groundItems) {
      if (g.seedKey?.startsWith('int:')) {
        this.groundMarkers.get(g)?.dispose();
        this.groundMarkers.delete(g);
      } else keep.push(g);
    }
    this.groundItems = keep;
    this.interiorId = null;
    this.interiorDoorTriggers = [];
    this.interiorSleepTriggers = [];
    this.interiorOriginTile = null;
    this.doorArmed = false;
    this.player?.teleport(back);
    this.updateAwakeNpcs();
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

  /** Every animation group of a combatant (player avatar or NPC). */
  /* istanbul ignore next — browser-only animation lookup */
  private groupsOf(id: string): AnimationGroup[] {
    return id === 'player'
      ? (this.player?.getAnimationGroups() ?? [])
      : (this.npcGroupsById.get(id) ?? []);
  }

  /** A combatant's named clip (exact match — 'idle' must not substring-hit 'sit_idle'). */
  /* istanbul ignore next — browser-only animation lookup */
  private clipOf(id: string, name: string): AnimationGroup | null {
    return this.groupsOf(id).find((g) => g.name.toLowerCase() === name) ?? null;
  }

  /**
   * Return a combatant to its resting loop: the fighting STANCE while it's a standing
   * combatant (engaged look), else the relaxed `idle`. Shared by every place a one-shot
   * combat/locomotion clip ends, so fighters never relax mid-fight.
   */
  /* istanbul ignore next — browser-only animation playback */
  private playIdleOrStance(id: string): void {
    const stance = this.combatStance.get(id);
    const clip = (stance && this.clipOf(id, stance)) || this.clipOf(id, 'idle');
    clip?.start(true);
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
    // Combat moves RUN to convey urgency; gossip approaches walk calmly.
    this.groupsOf(id).forEach((g) => g.stop());
    const moveClip = opts.combat
      ? (this.clipOf(id, 'run') ?? this.clipOf(id, 'walk'))
      : this.clipOf(id, 'walk');
    if (moveClip) {
      // Match the clip cadence to the actual travel speed so the feet don't slide.
      const ref = opts.combat ? 4.2 : 1.4;
      moveClip.speedRatio = Math.min(3, Math.max(0.5, speed / ref));
      moveClip.start(true);
    }
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
    this.clipOf(id, 'walk')?.stop();
    this.clipOf(id, 'run')?.stop();
    this.playIdleOrStance(id); // resting loop = stance in combat, else idle
    if (w?.combat) {
      this.combatWalking.delete(id);
      const node = this.combatNode(id);
      if (node) this.combatFacing.set(id, node.rotation.y); // pin the final heading
    }
    w?.onArrive?.();
  }

  async onExit(): Promise<void> {
    // The browser path fires doLoad() without awaiting; wait for it before tearing
    // down so the heavy init can't race the disposal (e.g. quitting mid-load).
    await this.loadPromise.catch(() => {});
    // Tear down the loading overlay if it's still up (e.g. exit before it faded).
    this.loadingSpinnerObs?.();
    this.loadingSpinnerObs = null;
    this.loadingProgressFill = null;
    this.loadingProgressLabel = null;
    /* istanbul ignore next — browser-only GUI disposal */
    if (this.loadingGui) { this.loadingGui.dispose(); this.loadingGui = null; }

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
    this.cockpit?.dispose(); // LCD DynamicTexture isn't a pivot child — dispose explicitly
    this.vehicle?.dispose();
    this.zoneManager?.dispose();
    // Sky dome is parented to the camera — dispose it before the camera.
    this.sky?.dispose();
    this.sky = null;
    this.cameraSystem?.dispose();
    this.npcManager?.dispose();
    this.dialog?.dispose();
    this.pauseMenu?.dispose();
    this.inventoryOverlay?.dispose();
    this.characterSheetOverlay?.hide();
    this.characterSheetOverlay = null;
    this.pdaOverlay?.dispose();
    this.pdaOverlay = null;
    this.sleepOverlay?.dispose();
    this.sleepOverlay = null;
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
    this.cockpit = null;
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

    // Drive the spatial-audio listener from the camera so NPC voices are heard
    // relative to the view. Done before the early returns (overlays/combat/pause)
    // so it tracks the camera in every state. No-op until a voice has played.
    this.updateAudioListener();

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

    // Sleeping: the modal owns the screen (fade + accelerated clock). Freeze the
    // world — no movement, no time accrual — until doSleep() closes the overlay.
    if (this.sleepOverlay?.isOpen()) {
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
      // F is shared: a door in reach takes priority (enter/leave), otherwise it
      // mounts/dismounts the vehicle.
      if (!this.handleDoorInput()) this.handleVehicleInput();
      this.handleViewSwitch();
      const driving = this.vehicle?.isOccupied() ?? false;
      if (!driving) {
        // On foot: camera-relative movement + gravity (fall damage on landing).
        if (this.cameraSystem && this.player) {
          this.player.setCameraYaw(this.cameraSystem.getYaw());
        }
        this.player?.update(dt);
        this.catchFallOutOfWorld();
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
    // Authored door triggers: walk into a door volume → enter/leave an interior.
    this.tickDoors();
    this.cameraSystem?.update();
    this.updateNPCs(dt);
    this.updateTimeOfDay();
    this.updateSky();
    // On foot, E interacts with NPCs/pickups; while piloting it's suppressed.
    if (!(this.vehicle?.isOccupied() ?? false)) {
      this.handleInteractInput();
    }
    // T opens chat in every mode: on foot → global/NPC, piloting → Roxane (the car AI).
    this.handleChatInput();
    this.tickHunger(dt);
    this.updateHud(dialogOpen);
    this.inputSystem?.endFrame();
    this.gameTimeSeconds += dt * TIME_SCALE;
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
    // Spatialize from the NPC's live world position (the holder follows the mesh;
    // fall back to the logical agent position). The listener is the camera.
    const p = this.npcHolderById.get(agent.definition.id)?.position ?? agent.getPosition();
    (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null)
      ?.speakSubject({ id: agent.definition.id, gender }, text, { x: p.x, y: p.y, z: p.z });
  }

  /** Voice a cinematic narration line in the narrator voice (fail-open). */
  /* istanbul ignore next — thin browser glue over the unit-tested TTSService */
  private speakNarration(text: string): void {
    (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null)?.speakNarrator(text);
  }

  /** Feed the camera (position + orientation) to the TTS spatial-audio listener. */
  /* istanbul ignore next — thin browser glue over the unit-tested TTSService */
  private updateAudioListener(): void {
    const tts = (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null);
    const cam = this.cameraSystem?.getCamera();
    if (!tts || !cam) return;
    const fwd = cam.getForwardRay().direction;
    const up = cam.upVector;
    tts.updateListener(
      { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      { x: fwd.x, y: fwd.y, z: fwd.z },
      { x: up.x, y: up.y, z: up.z },
    );
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
    this.claudeService = service;
    ServiceLocator.register('npcManager', this.npcManager);

    // Roxane, the car's AI: a standalone agent kept OUT of the manager (no holder,
    // no autonomy, never serialized) — she lives in the dashboard and is reached
    // only from the driver's seat. Her conversation is ephemeral per session.
    this.roxaneAgent = new NPCAgent(createRoxane());

    // Tile (0,0) cast: from downtown.json when present (F5 — keeps the LEGACY ids
    // so existing saves' npcMemory still matches), else the authored catalog.
    const downtownDoc = this.sceneDocsById.get('downtown');
    const definitions = downtownDoc && downtownDoc.npcs.length > 0
      ? downtownDoc.npcs.map((n) => sceneNpcToDefinition(n, n.id, n.position, 'Mercado das Sombras'))
      : [createZara(), createMback()];
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
    (groups.find((g) => g.name.toLowerCase() === 'idle')
      ?? groups.find((g) => g.name.toLowerCase().includes('idle')))?.start(true);
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
    const adjId = this.adjustOverlay?.getAdjuster()?.itemId;
    if (adjId === 'driver_seat') {
      // Live-preview the seat position + facing while the player is in the vehicle.
      if (this.vehicle?.isOccupied() && this.player) {
        const r = this.player.getRoot();
        r.position.set(attach.pos[0], attach.pos[1], attach.pos[2]);
        r.rotation.set(attach.rot[0], attach.rot[1], attach.rot[2]);
      }
      return;
    }
    if (adjId === 'cockpit') {
      this.cockpit?.applyCockpitOverride(attach); // live-preview the whole cockpit unit
      return;
    }
    const bone = attach.bone ?? boneFor(this.playerInventory.equippedIn(slot) ?? '', slot, this.heldAttach);
    void this.playerHeldRig?.applyLiveTransform(slot, attach, bone);
  }

  /* istanbul ignore next — browser-only Adjust persist */
  private adjustSave(itemId: string, attach: ItemAttach): void {
    this.heldAttach = { ...this.heldAttach, [itemId]: attach };
    this.persistSession();
    // Cockpit/seat ids aren't held props — don't re-sync the hand rig for them.
    if (itemId !== 'driver_seat' && itemId !== 'cockpit') void this.syncPlayerHeldItems();
  }

  /**
   * Apply non-mesh effects of the held main-hand item: the flashlight auto-lights a
   * forward spotlight and puts the hero in the aim pose; anything else clears them.
   */
  /* istanbul ignore next — browser-only light + pose */
  private updateHeldEffects(): void {
    if (typeof document === 'undefined' || !this.player) return;
    const equipped = this.playerInventory.toState().equipped;
    // Flashlight → aim pose; firearm → relaxed gun-in-hand idle; light only for the flashlight.
    this.player.setIdleOverride(idleOverrideClip(equipped));
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
    // and the per-frame pin keeps it (Bug A). Also drop each one into its weapon's
    // fighting stance so the whole scene reads as combat the instant it starts.
    this.combatFacing.clear();
    this.combatWalking.clear();
    this.combatStance.clear();
    for (const c of enc.getState().combatants) {
      this.combatStance.set(c.id, this.combatStanceFor(c.id));
      this.playIdleOrStance(c.id);
      if (c.id === 'player') this.player?.setIdleOverride(this.combatStance.get('player') ?? null);
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
    // Learn-by-doing: every player attack (hit OR miss) trains the weapon skill
    // — and via applySkillUse, its governing attribute (owner's rule). Spectator
    // fights use a '__none__' playerId, so isPlayerActor never fires there.
    if (entry.isPlayerActor && entry.attackKind && entry.attackOutcome) {
      this.gainSkill(entry.attackKind === 'melee' ? 'combate_corpo_a_corpo' : 'armas_de_fogo');
    }
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
      this.startNpcWalk(entry.actorId, points, GameWorldScene.COMBAT_RUN_SPEED, { combat: true });
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

  /** The fighting-stance idle clip a combatant holds, from its equipped weapon. */
  /* istanbul ignore next — browser-only; combatStanceClip is pure/tested */
  private combatStanceFor(actorId: string): string {
    const wid = this.combatWeaponId.get(actorId) ?? null;
    return combatStanceClip(isFirearm(wid ?? '') ? 'ranged' : 'melee', isMeleeWeapon(wid ?? ''));
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
    groups.forEach((g) => g.stop());
    clip.start(false);
    if (!hold) {
      // Return to the fighting stance during combat (else the relaxed idle).
      clip.onAnimationEndObservable.addOnce(() => { this.playIdleOrStance(actorId); onEnd?.(); });
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
          this.combatStance.delete(c.id);
          this.clipOf(c.id, 'idle')?.start(true); // drop the fighting stance back to a relaxed idle
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
    this.combatStance.clear();
    // Drop the player out of the fighting stance back to the held-item idle (gun/none).
    this.updateHeldEffects();
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
    // Sprint intent gated by stamina (exhausted = can't actually be running).
    const sprinting = this.inputSystem.isSprinting() && (this.player?.getStamina().canSprint() ?? true);
    return sprinting ? 'running' : 'walking';
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
      // A fully-taken scene-seeded pickup never respawns (persisted by key).
      if (item.seedKey && !this.collectedSceneItems.includes(item.seedKey)) {
        this.collectedSceneItems.push(item.seedKey);
      }
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
    // A bed in reach → sleep (once per 24h). Checked before NPCs/pickups since a
    // bed is a distinct interactable that rarely overlaps them.
    /* istanbul ignore next — browser-only sleep triggers; SleepSystem is unit-tested */
    if (sleepTriggerHit(this.player.getPosition(), this.currentSleepTriggers())) {
      if (canSleep(this.lastSleepGameTime, this.gameTimeSeconds)) void this.doSleep();
      else { this.hud?.pushToast(t('sleep.cooldown')); this.sfx('ui_error'); }
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
      const name = agent.definition.name;
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

  /**
   * Sleep in a bed: fade to black + an accelerated 8h clock, then apply the
   * physiological effects (hunger metabolised → HP healed from it), advance the
   * clock 8h, grant the 2h "Well Rested" buff (2× gains), persist, and fade back.
   * The world freezes while the overlay is open (update() returns early). The
   * caller has already verified the once-per-24h cooldown.
   */
  /* istanbul ignore next — browser-only overlay/animation; SleepSystem is unit-tested */
  private async doSleep(): Promise<void> {
    if (!this.sleepOverlay || this.sleepOverlay.isOpen()) return;
    this.sfx('ui_open');
    await this.sleepOverlay.play(this.clock.hour(this.gameTimeSeconds));

    // Advance the clock and apply the 8-hour physiological effects.
    this.gameTimeSeconds += SLEEP_DURATION_SECONDS;
    const health = this.player?.getHealth();
    if (health) {
      const r = computeSleepResult({ hunger: this.playerHunger.toState(), health: health.toState() });
      this.playerHunger = Hunger.fromState(r.hunger);
      if (r.hpHealed > 0) health.heal(r.hpHealed);
    }
    this.lastSleepGameTime = this.gameTimeSeconds;
    this.wellRestedUntilGameTime = wellRestedUntil(this.gameTimeSeconds);

    // Reflect the new time of day (light/fog/sky) and save the rested state.
    this.updateTimeOfDay();
    this.updateSky();
    this.hud?.pushToast(t('sleep.wellRestedGained'));
    this.persistSession();
    this.sleepOverlay.close();
  }

  private wireDialog(): void {
    if (!this.dialog) return;
    this.dialog.onSubmit((message) => {
      if (this.chatMode === 'roxane') void this.sendToRoxane(message);
      else if (this.chatMode === 'global') void this.sendGlobalMessage(message);
      else void this.sendToActiveNPC(message);
    });
  }

  /** T opens the chat anywhere — react to the world or hail an NPC in the scene. */
  private handleChatInput(): void {
    if (!this.inputSystem || !this.dialog || !this.player) return;
    if (!this.inputSystem.wasJustPressed('chat.open')) return;
    if (this.dialog.isOpen()) return;
    // While piloting, T hails Roxane — the car's AI — in the cockpit. The camera
    // stays first-person so her waveform is visible on the dashboard (no reframe).
    if (this.vehicle?.isOccupied() && this.roxaneAgent) {
      this.chatMode = 'roxane';
      const rxSeed: DialogLine[] = this.roxaneAgent.conversation.getFullHistory().flatMap((ex) => [
        { role: 'player' as const, text: ex.player },
        { role: 'npc' as const, text: ex.npc },
      ]);
      this.dialog.open(this.roxaneAgent.definition.name, rxSeed);
      this.sfx('ui_open');
      return;
    }
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
   * Roxane (car AI) turn: moderate → show the line → query Claude directly (she is
   * NOT in the NPCManager) with the live vehicle telemetry as soft context → voice
   * the reply (her fixed voice drives the dashboard waveform). No emote/verbal
   * action pipeline — she doesn't trade, fight, or take cRPG actions.
   */
  async sendToRoxane(message: string): Promise<void> {
    if (!this.roxaneAgent || !this.dialog || !this.claudeService) return;
    const spoken = stripShout(message);
    this.dialog.setThinking(true);
    const allowed = await this.claudeService.moderate(this.roxaneAgent.definition.id, spoken);
    if (!allowed) {
      this.dialog.addSystemLine(t('dialog.cantSay'));
      this.sfx('ui_error');
      return;
    }
    this.dialog.addPlayerLine(spoken);
    const world: WorldSnapshot = {
      cityName: 'NeoBeiraRio',
      gameTime: this.formatGameTime(),
      playerName: this.playerName,
      distanceMeters: 0,
      playerAction: 'idle',
      recentEvents: [],
      language: languageName(getLocale()),
      extraContext: this.buildRoxaneVehicleContext(),
    };
    this.dialog.setThinking(true);
    try {
      const reply = await this.claudeService.query(this.roxaneAgent, world, spoken, (chunk) =>
        this.dialog?.appendChunk(chunk),
      );
      if (!reply) this.dialog.setNpcText(t('dialog.noReply'));
      else {
        this.dialog.setNpcText(reply);
        this.speakNpc(this.roxaneAgent, reply); // her fixed voice → cockpit waveform
      }
    } catch {
      /* istanbul ignore next — fail-soft on a CLI hiccup */
      this.dialog.setNpcText(t('dialog.noReply'));
    }
  }

  /**
   * Live vehicle telemetry fed to Roxane as soft context so she can comment on her
   * own condition (she IS the car). Pure read of the vehicle state.
   */
  private buildRoxaneVehicleContext(): string {
    // Only reachable from the driver's seat, but stay null-safe: a save without
    // a nave (owned: false) never creates the controller.
    const v = this.vehicle;
    if (!v) return '';
    const hp = Math.round(v.getHealth().fraction() * 100);
    const spd = Math.round(Math.abs(v.getSpeed()));
    const alt = Math.round(v.getPosition().y);
    const cond = v.isDestroyed() ? 'WRECKED' : hp <= 33 ? 'damaged, smoking' : 'nominal';
    return `VEHICLE TELEMETRY (you ARE this car; mention it only if it fits): `
      + `hull ${hp}% (${cond}), speed ${spd} m/s, altitude ${alt} m.`;
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
    // route accept/decline/claim/cancel against the right offer on file). A
    // `pending` mission is an unaccepted OFFER (accept/decline); an `active`
    // mission is an accepted contract in progress (claim/cancel) — without the
    // latter the classifier can't tell that a "I did the job, pay me" line is a
    // claim, and routes it to narrative (generic reply).
    const pendings: { kind: 'trade' | 'mission'; status?: 'pending' | 'active'; itemId?: string; targetId?: string }[] = [];
    if (this.pendingTrade?.npcId === npcId) pendings.push({ kind: 'trade', itemId: this.pendingTrade.itemId });
    if (this.pendingMission?.giverId === npcId) pendings.push({ kind: 'mission', status: 'pending', targetId: this.pendingMission.targetId });
    for (const m of this.missions) {
      if (m.status === 'active' && m.giverId === npcId) pendings.push({ kind: 'mission', status: 'active', targetId: m.targetId });
    }

    const cls = await this.npcManager.classifyVerbal(npcId, npcName, message, sellable, rivals, pendings,
      { addict: !!agent.definition.addict, playerHasSpice: this.playerInventory.count(SPICE_ID) > 0 });
    if (cls.verb === 'narrative') return false; // pure chitchat → legacy reply path

    // Normalize itemId: classifier sometimes emits the DISPLAY NAME the player
    // typed ("lead_pipe", "Lead Pipe") instead of the canonical id ("pipe").
    // Fall back to a fuzzy reverse-match against sellable items by display name.
    if (cls.itemId && !sellable.includes(cls.itemId)) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(cls.itemId);
      const match = sellable.find((id) => {
        const def = itemDef(id);
        const name = def ? t(def.nameKey) : id;
        return norm(id) === target || norm(name) === target;
      });
      if (match) cls.itemId = match;
    }

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
      // ── Spice-trafficking job (Fase 22) ──
      targetIsDealer: !!agent.definition.dealer,
      targetIsAddict: !!agent.definition.addict,
      targetDisposition: disp,
      activeSpiceContracts: this.spiceContracts
        .filter((c) => c.status === 'active')
        .map((c) => ({ dealerId: c.dealerId })),
      spiceQtyAvailable: agent.getInventory().count(SPICE_ID),
      playerSpiceCount: this.playerInventory.count(SPICE_ID),
      buyerCreditBalance: creditBalance(agent.getInventory()),
      pendingSpice: this.pendingSpice?.npcId === npcId
        ? { side: this.pendingSpice.side, unitPrice: this.pendingSpice.unitPrice, qty: this.pendingSpice.qty }
        : null,
    };
    const result = resolveAction(playerActor, cls.verb, npcActor, opts, undefined, 'verbal');
    if (!result.allowed) {
      this.logSkill(`verbal verb=${cls.verb} BLOCKED: ${result.blockedReason}`);
      // Surface commerce blocks to the player — otherwise they think the buy
      // went through (Claude's reply may improvise the sale) but mechanically
      // nothing happened (no item, no debit).
      if (result.blockedReason === 'unknown_item' && cls.verb.startsWith('commerce_')) {
        this.dialog?.addSystemLine(t('economy.itemNotForSale'));
      }
      // Surface spice-job blocks so the player understands why nothing moved.
      // `no_spice` means "nothing to sell" on a sell deal, "out of stock" on a buy.
      const sellSide = !!agent.definition.addict
        && (this.playerInventory.count(SPICE_ID) > 0 || !agent.definition.dealer);
      const spiceBlock: Record<string, string> = {
        not_dealer: 'spice.notDealer', not_addict: 'spice.notAddict',
        no_spice: sellSide ? 'spice.noSpiceToSell' : 'spice.outOfStock',
        cannot_afford: 'spice.cantAfford', no_spice_contract: 'spice.noContract',
      };
      if (cls.verb.startsWith('spice_') && result.blockedReason && spiceBlock[result.blockedReason]) {
        this.dialog?.addSystemLine(t(spiceBlock[result.blockedReason]!));
      }
      return false; // fall through to legacy reply path
    }
    // Diagnostic line per turn: classifier output + check outcome (when rolled).
    if (result.rolled) {
      const pct = Math.round(result.probability * 100);
      const roll = Math.round(result.roll);
      const outcome = result.success ? (result.critical ? 'CRIT' : 'HIT') : 'MISS';
      this.logSkill(`verbal verb=${cls.verb} · roll=${roll} vs P=${pct}% → ${outcome} · ${result.mutations.length} mutation(s)`);
      // The deterministic result, visible in chat. The check's skill lives on
      // the apply_skill_use mutation the Resolver emitted for this roll.
      this.showCheckLine(this.skillIdFromMutations(result.mutations), 'carisma',
        result.roll, result.probability, result.success, result.critical);
    } else {
      this.logSkill(`verbal verb=${cls.verb} (no check) · ${result.mutations.length} mutation(s)`);
    }
    applyMutations(this.buildApplierContext(), result.mutations);
    // Hand the NPC reply the SPECIFIC outcome this verbal action just decided
    // (mission target + reward, accept/decline/claim) so it narrates it in
    // character — names the target, states the price, acknowledges the deal —
    // instead of improvising blind. Consumed once by the next buildWorldSnapshot.
    this.verbalActionContext = this.verbalDirectiveFor(cls.verb, result.mutations, opts);
    // Visible failure feedback for haggle — the Resolver emits no discount
    // mutation on a miss, so the chat would be silent without this hint.
    if (cls.verb === 'commerce_haggle' && result.rolled && !result.success) {
      this.dialog?.addSystemLine(t('economy.haggleFailed'));
    }
    // Spice haggle failure: the resolver emits no haggle_spice mutation, so hint it.
    if (cls.verb === 'spice_haggle' && result.rolled && !result.success) {
      this.dialog?.addSystemLine(t('spice.haggleFailed'));
    }
    // Critical-success narrator beat — gives social/commerce crits the same
    // "show-stopping moment" energy combat crits get. Skipped when the verb
    // rolls no check (job_*, commerce_buy, narrative).
    if (result.rolled && result.critical) {
      const line = await this.npcManager.narrateOutcome(message, true, languageName(getLocale()), true);
      if (line) {
        this.dialog?.addNarrationLine(line);
        this.speakNarration(line);
      }
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
   * Turn a just-applied verbal action into a one-shot instruction for the NPC
   * reply prompt, so the in-character reply narrates the SPECIFIC decision
   * (which rival to kill, the reward, the handshake) rather than improvising.
   * The giver names its own rival by their real name (it's the giver's enemy);
   * this is how the player learns the target's name. Returns undefined for
   * verbs that need no extra colour (the commerce levers already cover those).
   */
  /* istanbul ignore next — browser-only directive assembly; pure deps tested elsewhere */
  private verbalDirectiveFor(
    verb: string,
    mutations: readonly Mutation[],
    opts: ResolveOptions,
  ): string | undefined {
    const realName = (id: string) => this.npcManager?.getAgent(id)?.definition.name ?? id;
    const rewardText = (r: RewardOffer | undefined): string =>
      !r ? 'a reward'
        : r.kind === 'item' ? this.itemName(r.itemId ?? '')
        : `${r.credits ?? 0} credits`;
    const player = this.playerName;

    switch (verb) {
      case 'job_request': {
        const m = mutations.find((x) => x.kind === 'stage_pending_mission');
        if (!m || m.kind !== 'stage_pending_mission') return undefined;
        return `Make the contract offer out loud and concrete: tell ${player} you want ${realName(m.targetId)} dealt with (kill), and that you will pay ${rewardText(m.reward)} for it. Name ${realName(m.targetId)} explicitly, state the ${rewardText(m.reward)} reward, then ask if they will take the job.`;
      }
      case 'job_accept': {
        const pm = opts.pendingMission;
        const who = pm ? realName(pm.targetId) : 'the target';
        return `${player} just ACCEPTED your contract. Confirm the deal is on: acknowledge their commitment, restate that the target is ${who} and the payoff is ${rewardText(pm?.reward)}, and tell them to get it done.`;
      }
      case 'job_decline': {
        const pm = opts.pendingMission;
        const who = pm ? realName(pm.targetId) : 'the target';
        return `${player} just TURNED DOWN your contract to kill ${who}. Acknowledge the refusal and let the offer drop.`;
      }
      case 'job_cancel': {
        const active = (opts.activeMissions ?? [])[0];
        const who = active ? realName(active.targetId) : 'the target';
        return `${player} is BACKING OUT of the active contract to kill ${who}. React — you are not pleased they are walking away from a deal.`;
      }
      case 'job_claim': {
        const stillAlive = mutations.find((x) => x.kind === 'narrate_target_still_alive');
        if (stillAlive && stillAlive.kind === 'narrate_target_still_alive') {
          return `${player} claims the job is done, but ${realName(stillAlive.targetId)} is STILL ALIVE. Call them out — no payment until the target is actually dead.`;
        }
        const done = mutations.find((x) => x.kind === 'claim_mission_completion');
        if (done && done.kind === 'claim_mission_completion') {
          const m = this.missions.find((x) => x.giverId === done.giver && x.targetId === done.targetId);
          const reward = m ? rewardText(this.missionRewardOf(m)) : 'the agreed reward';
          return `${player} DELIVERED — ${realName(done.targetId)} is dead and you are paying out ${reward} now. Acknowledge the contract is closed, hand over the ${reward}, and show some respect for the work.`;
        }
        return undefined;
      }
      case 'commerce_discovery': {
        // Engine = source of truth for the wares list (Lesson 59). Without an
        // authoritative directive the NPC's freeform reply invents stock it does
        // not own — and when it carries nothing, the soft commerce lever is
        // omitted entirely, so Claude conjures a whole shop. Force the reply to
        // list EXACTLY the inventory (with disposition-discounted prices) or to
        // admit it has nothing.
        const ids = opts.npcSellableIds ?? [];
        if (ids.length === 0) {
          return `${player} is asking what you have for sale, but you are carrying NO merchandise. Tell them plainly you have nothing to sell right now — do not invent, imply, or mention any stock.`;
        }
        const list = ids
          .map((id) => `${this.itemName(id)} (${opts.priceFor ? opts.priceFor(id) : itemValue(id)} cr)`)
          .join(', ');
        return `${player} is asking what you sell. List ONLY these wares, with these EXACT prices, and nothing else: ${list}. Do not invent, imply, or mention any other merchandise; if they ask for something not on this list, say you don't carry it.`;
      }
      case 'spice_discovery':
      case 'spice_pricing': {
        // A deal was STAGED (no transfer yet) — the NPC quotes the price.
        const p = this.pendingSpice;
        if (!p) return undefined;
        return p.side === 'buy'
          ? `${player} is feeling out a SPICE run. Quote them ${p.qty} doses at ${p.unitPrice} cr each to buy and resell on the street. Pitch it plainly — nothing changes hands until they agree. Do not invent territories, quotas, or deadlines.`
          : `${player} is offering to sell you SPICE. Name your price — about ${p.unitPrice} cr a dose — and show your interest, but nothing changes hands until they close. Stay in character as a user.`;
      }
      case 'spice_haggle': {
        const p = this.pendingSpice;
        const m = mutations.find((x) => x.kind === 'apply_spice_haggle');
        if (!p || !m || m.kind !== 'apply_spice_haggle') {
          return `${player} pushed on the spice price, but you hold firm. React briefly in character — nothing moved.`;
        }
        return p.side === 'buy'
          ? `${player} haggled your spice price DOWN to ${p.unitPrice} cr a dose. Grumble but accept the thinner margin — nothing closes until they say deal. Stay in character.`
          : `${player} pushed your spice price UP to ${p.unitPrice} cr a dose. You're hooked enough to pay it — but nothing changes hands until they close. Stay in character.`;
      }
      case 'spice_buy':
      case 'spice_sell': {
        // The commit executed whatever was staged — read the real outcome.
        const d = this.lastSpiceDeal;
        if (!d || d.qty <= 0) {
          return `${player} tried to close a spice deal, but it fell through (broke or out of stock). React briefly in character.`;
        }
        return d.side === 'buy'
          ? `${player} just BOUGHT ${d.qty} doses of SPICE off you for ${d.total} cr to run. Take the credits, hand over the product, and tell them to come back when they've moved it. Do not invent territories or quotas.`
          : `${player} just SOLD you ${d.qty} doses of SPICE for ${d.total} cr. React as a user getting their fix — take it, pay up, stay in character.`;
      }
      case 'spice_report': {
        const m = mutations.find((x) => x.kind === 'report_spice');
        if (!m || m.kind !== 'report_spice') return undefined;
        return `${player} reports they MOVED ALL the spice you fronted them. You're pleased — the product is gone and the credits flowed. Acknowledge the good work and warm up to them a notch.`;
      }
      default:
        return undefined; // persuade/etc. — covered by existing context
    }
  }

  /**
   * Build a SceneApplierContext that lets the Applier mutate this scene's
   * live world (inventory, HP, disposition, missions, PDA, narration, …).
   * This is the seam between the pure action layer and Babylon/save/GUI.
   */
  /* istanbul ignore next — browser-only scene-bound applier (each branch wires an existing scene method) */
  private buildApplierContext(): ApplierContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
      addPdaEntry(subject, _source, _from, _lines, silent) { self.recordPda(subject, silent); },
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
      // ── Spice-trafficking job (Fase 22) — staged negotiation ─────────
      stagePendingSpice(npc, side, unitPrice, qty) {
        // Put a deal on the table (no transfer). `base` lets the haggle clamp.
        self.pendingSpice = { npcId: npc, side, unitPrice, qty, base: unitPrice };
        self.dialog?.addSystemLine(t(side === 'buy' ? 'spice.quotedBuy' : 'spice.quotedSell', { qty, price: unitPrice }));
      },
      applySpiceHaggle(npc, factor) {
        const p = self.pendingSpice;
        if (!p || p.npcId !== npc) return;
        p.unitPrice = clampSpicePrice(p.side, Math.round(p.unitPrice * factor), p.base);
        self.dialog?.addSystemLine(t(p.side === 'buy' ? 'spice.haggledDown' : 'spice.haggledUp', { price: p.unitPrice }));
      },
      executePendingSpice(npc) {
        self.lastSpiceDeal = null;
        const p = self.pendingSpice;
        if (!p || p.npcId !== npc) return;
        const a = agentById(npc);
        if (!a) return;
        const npcInv = a.getInventory();
        if (p.side === 'buy') {
          const moveQty = Math.min(p.qty, npcInv.count(SPICE_ID), Math.floor(creditBalance(self.playerInventory) / Math.max(1, p.unitPrice)));
          if (moveQty <= 0) {
            self.dialog?.addSystemLine(creditBalance(self.playerInventory) < p.unitPrice ? t('spice.cantAfford') : t('spice.outOfStock'));
            self.pendingSpice = null;
            return;
          }
          const total = moveQty * p.unitPrice;
          payCredits(self.playerInventory, total);
          grantCredits(npcInv, total);
          npcInv.transferTo(self.playerInventory, SPICE_ID, moveQty);
          const existing = self.spiceContracts.find((c) => c.dealerId === npc && c.status === 'active');
          if (existing) existing.qty += moveQty; else self.spiceContracts.push(makeSpiceContract(npc, moveQty));
          self.lastSpiceDeal = { side: 'buy', qty: moveQty, total };
          self.dialog?.addSystemLine(t('spice.bought', { qty: moveQty, price: total }));
        } else {
          const sellQty = Math.min(p.qty, self.playerInventory.count(SPICE_ID), Math.floor(creditBalance(npcInv) / Math.max(1, p.unitPrice)));
          if (sellQty <= 0) { self.dialog?.addSystemLine(t('spice.buyerBroke')); self.pendingSpice = null; return; }
          const total = sellQty * p.unitPrice;
          payCredits(npcInv, total);
          grantCredits(self.playerInventory, total);
          self.playerInventory.transferTo(npcInv, SPICE_ID, sellQty);
          self.lastSpiceDeal = { side: 'sell', qty: sellQty, total };
          self.dialog?.addSystemLine(t('spice.sold', { qty: sellQty, price: total }));
        }
        self.pendingSpice = null; // consumed by the close
        self.persistSession();
      },
      clearPendingSpice(npc) {
        if (self.pendingSpice?.npcId === npc) self.pendingSpice = null;
      },
      reportSpice(dealer) {
        const contract = self.spiceContracts.find((c) => c.dealerId === dealer && c.status === 'active');
        if (!contract) { self.dialog?.addSystemLine(t('spice.noContract')); return; }
        contract.status = completeSpiceReport(contract).status;
        const a = agentById(dealer);
        if (a) {
          const before = a.getDisposition();
          a.improveDisposition();
          a.rememberEvent('The player moved all the spice you fronted them.');
          const name = a.getDisplayName();
          self.dialog?.addNarrationLine(t('spice.reported', { giver: name }));
          if (a.getDisposition() !== before) self.dialog?.addSystemLine(t('economy.standingImproved', { giver: name }));
        }
        self.persistSession();
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
        self.gainSkill(skillId);
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
    const critical = result.success && result.roll < 5;

    // Diagnostic for the deterministic-but-no-effect path (mirrors applySkillEffect).
    this.logSkill(`classified effect=${cls.effect} skill=${cls.skillId ?? '—'} attr=${attribute} diff=${cls.difficulty} value=${value}`);
    this.logSkill(`unresisted · roll=${result.roll.toFixed(0)} vs P=${(result.probability * 100).toFixed(0)}% → ${result.success ? 'HIT' : 'MISS'}${critical ? ' (CRIT)' : ''}`);
    this.showCheckLine(cls.skillId, attribute, result.roll, result.probability, result.success, critical);

    // Learning by doing — every rolled check trains, success or failure (owner's rule).
    if (cls.skillId) this.gainSkill(cls.skillId);

    const narration = await this.npcManager.narrateOutcome(message, result.success, languageName(getLocale()), critical);
    {
      const outcomeLine = narration || (result.success ? (critical ? 'You pull it off — flawlessly.' : 'You pull it off.') : "It doesn't go your way.");
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
    if (res.rolled) {
      this.showCheckLine(cls.skillId, cls.attribute ?? GameWorldScene.DEFAULT_CHECK_ATTRIBUTE, res.roll, res.probability, res.success, res.critical);
    }

    // Learn-by-doing — every rolled check trains, success or failure (owner's rule).
    if (res.rolled && cls.skillId) this.gainSkill(cls.skillId);

    // medicine_check: a self-read of your own condition (diegetic, no numbers).
    // Unlike other effects the result is INFORMATION, not a world mutation, and it
    // is shown on both outcomes — a coarse band always, precise only on success.
    if (cls.effect === 'medicine_check' && this.player) {
      const condLine = describeCondition(this.player.getHealth().fraction(), res.success);
      this.logSkill(`narration: "${condLine}"`);
      this.dialog.addNarrationLine(condLine);
      this.speakNarration(condLine);
      this.persistSession();
      return true;
    }

    // Crafting picks its output weapon from the emote text (Fase 20H).
    if (cls.effect === 'craft') this.skillCraftTarget = craftTargetFromText(message);

    if (res.mutations.length === 0) this.logSkill('mechanical: (none)');
    for (const m of res.mutations) this.applySkillMutation(m);

    const narration = await this.npcManager.narrateOutcome(message, res.success, languageName(getLocale()), res.critical);
    const outcomeLine = narration || (res.success ? (res.critical ? 'You pull it off — flawlessly.' : 'You pull it off.') : "It doesn't go your way.");
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
      if (a.definition.name.toLowerCase() === n) return a;
    }
    return null;
  }

  /**
   * Show a player-rolled check's deterministic outcome in the chat transcript
   * ("Furtividade: 23 vs 65% — FALHA") as an out-of-world system line. States
   * only the roll result, never the world mutation (owner's rule). The pure
   * formatting lives in `checkLine` (fully tested); this is chat glue.
   */
  /* istanbul ignore next — browser-only chat glue over the tested checkLine */
  private showCheckLine(
    skillId: string | null | undefined, attribute: AttributeId,
    roll: number, probability: number, success: boolean, critical: boolean
  ): void {
    // Localized names (the static SkillDef/AttributeDef labels are pt-only).
    const label = skillId ? t(`skill.${skillId}`) : t(`attr.${attribute}`);
    this.dialog?.addSystemLine(checkLine(label, roll, probability, success, critical));
  }

  /** The skillId of the apply_skill_use mutation the Resolver emitted for this roll. */
  /* istanbul ignore next — browser-only chat glue */
  private skillIdFromMutations(mutations: readonly Mutation[]): string | null {
    const used = mutations.find((m) => m.kind === 'apply_skill_use' && m.actor === 'player');
    return used && 'skillId' in used ? used.skillId : null;
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
   * Record intel on an NPC into the player's PDA (Fase 20 'info'/scan result): build
   * a dossier of what the hack reveals (role, attitude, credits, gear) and upsert it
   * into the persisted PDA, then narrate.
   */
  /* istanbul ignore next — browser-only (reads runtime agents; PDA store is tested) */
  private recordPda(subjectId: string, silent?: boolean): void {
    const a = this.npcManager?.getAgent(subjectId);
    if (!a) return;
    this.pda = upsertPdaEntry(this.pda, { subjectId, subjectName: a.definition.name, lines: this.dossierLinesFor(a) });
    if (silent) return; // commerce paths skip the "you identified X" narration
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
    this.showCheckLine(cls.skillId ?? 'combate_corpo_a_corpo', cls.attribute ?? 'forca',
      result.roll, result.probability, result.success, result.success && result.roll < 5);
    // Learn-by-doing — every rolled check trains, success or failure (owner's rule).
    this.gainSkill(cls.skillId ?? 'combate_corpo_a_corpo');
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
      extraContext: this.extraContextFor(agent), // soft latent levers (commerce + spice)
      replyDirective: this.consumeReplyDirective(),  // hard one-shot stage direction
    };
  }

  /**
   * Read-and-clear the one-shot directive a verbal action just staged
   * (mission/trade outcome). Consumed once so it only colours the immediately-
   * following NPC reply; routed to WorldSnapshot.replyDirective (rendered LAST,
   * obeyed) — NOT extraContext (the soft commerce levers).
   */
  /* istanbul ignore next — browser-only transient read */
  private consumeReplyDirective(): string | undefined {
    const action = this.verbalActionContext;
    this.verbalActionContext = undefined;
    return action;
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
    // Harden the legacy reply path (when the message is NOT classified as a
    // verbal commerce verb): if this trader carries no merchandise, say so
    // explicitly so Claude does not invent a shop out of thin air.
    if (sellable.length === 0) {
      const note = 'You are NOT carrying any merchandise to sell. If asked what you sell, say you have nothing for sale — never invent stock.';
      return ctx ? `${ctx}\n${note}` : note;
    }
    return ctx || undefined;
  }

  /**
   * Spice-trafficking levers (Fase 22) for a dealer/addict NPC: a willing dealer
   * floats a shipment, an addict hints they'd buy, an open contract nudges a report.
   * Browser-only (the pure formatter `buildSpiceContext` is tested).
   */
  /* istanbul ignore next — browser-only spice context assembly */
  private spiceContextFor(agent: NPCAgent): string | undefined {
    const def = agent.definition;
    if (!def.dealer && !def.addict) return undefined;
    const disp = agent.getDisposition();
    const offer = !!def.dealer && canOfferSpice(disp) && agent.getInventory().count(SPICE_ID) > 0;
    const awaitingReport = !!def.dealer
      && this.spiceContracts.some((c) => c.dealerId === def.id && c.status === 'active');
    // An addict only pipes up about buying when the player actually has spice to
    // sell — keeps the latent lever (and the prompt) out of every idle exchange.
    const crave = !!def.addict && this.playerInventory.count(SPICE_ID) > 0;
    return PromptBuilder.buildSpiceContext({
      offer, crave, awaitingReport, buyPrice: spiceBuyPrice(disp), lot: SPICE_LOT,
    }) || undefined;
  }

  /** Combine the soft latent levers (commerce + spice) for the NPC turn. */
  /* istanbul ignore next — browser-only context join (pure parts tested) */
  private extraContextFor(agent: NPCAgent): string | undefined {
    const parts = [this.commerceContextFor(agent), this.spiceContextFor(agent)].filter(Boolean);
    return parts.length ? parts.join('\n') : undefined;
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
        return { id: a.definition.id, name: a.definition.name, position: { x: pos.x, z: pos.z } };
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

  /**
   * Drive the dynamic sky each frame (sun/moon arc, gradient + clearColor). Hidden
   * inside interiors (the player is far off-grid at INTERIOR_ORIGIN, in an enclosed
   * room — no sky should show). Browser-only; no-op until the renderer is built.
   */
  /* istanbul ignore next — browser-only sky update (SkySystem math is unit-tested) */
  private updateSky(): void {
    if (!this.sky) return;
    if (this.interiorId) { this.sky.setEnabled(false); return; }
    this.sky.setEnabled(true);
    this.sky.update(computeSkyState(this.clock.hour(this.gameTimeSeconds)), this.babylonScene);
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
    // While the Roxane chat is open, freeze drive input so typing doesn't fly the
    // car (the engine stays on, so it just hovers in place).
    const chatting = this.dialog?.isOpen() ?? false;
    // Car driving: W=accelerate, S=brake/reverse, A/D=steer the wheel.
    const input: VehicleDriveInput = driving && !chatting && this.inputSystem
      ? {
          accelerate: this.inputSystem.isActionActive('move.forward'),
          brake: this.inputSystem.isActionActive('move.backward'),
          steer: (this.inputSystem.isActionActive('move.right') ? 1 : 0)
               - (this.inputSystem.isActionActive('move.left') ? 1 : 0),
          vertical: this.inputSystem.getVerticalAxis(),
        }
      : { accelerate: false, brake: false, steer: 0, vertical: 0 };
    this.vehicle.update(dt, input);
    if (driving) this.updateCockpit();

    // Trailing camera: ease the orbit to stay behind the car as it steers, unless
    // the player is actively looking around with Z/C (manual orbit wins; the view
    // re-settles behind the car when they let go). The rate must be high enough to
    // keep up with a sustained turn (a low gain leaves the camera ~40° off to the
    // side during curves — exactly the "I have to fix it with Z/C" symptom).
    if (driving) {
      const lookingAround = this.inputSystem?.isActionActive('camera.rotateLeft')
        || this.inputSystem?.isActionActive('camera.rotateRight');
      if (!lookingAround) {
        this.cameraSystem.alignBehind(this.vehicle.getFacing(), Math.min(1, CAMERA_TRAIL_RATE * dt));
      }
    }

    // Procedural engine drone while piloting: a 180 Hz sine that glides to 220 Hz
    // when the player feeds movement input and back to 180 Hz when idle.
    const audio = (this.audio ??= ServiceLocator.tryGet<AudioManager>('audio'));
    if (driving) {
      audio?.startEngineTone();
      const moving = input.accelerate || input.brake || input.steer !== 0 || input.vertical !== 0;
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
      // Dismount beside the vehicle at its current altitude, then fall (gravity +
      // fall damage). The abandoned vehicle loses lift and falls too.
      this.vehicle.exit();
      const p = this.vehicle.getPosition();
      this.player.playPose(null); // release the sit pose → back to locomotion
      // Detach player visual from the vehicle before teleporting, and undo the
      // seat pose's pitch/roll so the hero stands upright on foot (locomotion only
      // drives the Y facing — a leftover X tilt makes the avatar walk leaning).
      this.player.getRoot().setParent(null);
      this.player.getRoot().rotation.set(0, 0, 0);
      // teleport() also moves the physics capsule (a raw position.set is overridden
      // by the character controller → hero snapped back to its mount/spawn spot).
      this.player.teleport(new Vector3(p.x + 1.5, p.y, p.z));
      this.player.startFalling(p.y); // kinematic fall path (no-physics/tests)
      this.cameraSystem.disableFirstPerson(); // never leave the drive stuck in FP
      this.cameraSystem.setTarget(this.player.getRoot());
      this.cameraSystem.exitVehicleMode();
    } else if (this.vehicle.canEnter(this.player.getPosition())) {
      this.vehicle.enter();
      // Apply the player's Piloting skill to vehicle max speed (Phase 19C).
      this.vehicle.setPilotagem(this.playerStats.skills['pilotagem'] ?? 10);
      // Seat the player on the vehicle's VISUAL pivot (it yaws with the car under
      // Havok; the body/root stays level) so the rider turns WITH the car instead of
      // just translating. Use the saved seat override if calibrated, else the default.
      const playerRoot = this.player.getRoot();
      playerRoot.setParent(this.vehicle.getVisualRoot());
      const savedSeat = this.heldAttach['driver_seat'];
      const seatPos = savedSeat
        ? new Vector3(savedSeat.pos[0], savedSeat.pos[1], savedSeat.pos[2])
        : DRIVER_SEAT_OFFSET.clone();
      playerRoot.position = seatPos;
      playerRoot.rotation.set(
        savedSeat ? savedSeat.rot[0] : DRIVER_SEAT_PITCH,
        savedSeat ? savedSeat.rot[1] : DRIVER_SEAT_YAW,
        savedSeat ? savedSeat.rot[2] : 0,
      );
      // Driving pose: a frozen frame of the embedded 'Death' clip reads as a seated
      // driver (knees bent, torso forward, arms out like holding the wheel) — owner-
      // picked in the scrub harness. No retarget needed; the fold sits at the hip.
      this.player.playPose(DRIVING_POSE_CLIP, DRIVING_POSE_FRAME);
      this.cameraSystem.setTarget(this.vehicle.getRoot());
      this.cameraSystem.enterVehicleMode();
      this.mountCockpit();
    }
  }

  /**
   * Build the cockpit (dashboard/wheel/throttle/LCD) on the vehicle visual pivot and
   * arm the first-person camera at the driver's head. Starts in 3rd person.
   */
  /* istanbul ignore next — browser-only cockpit + FP camera wiring */
  private mountCockpit(): void {
    if (!this.vehicle || !this.cameraSystem) return;
    this.cockpit?.build(this.vehicle.getVisualRoot());
    const saved = this.heldAttach['cockpit'];
    if (saved) this.cockpit?.applyCockpitOverride(saved);
    const headSaved = this.heldAttach['cockpit_head'];
    const head = headSaved
      ? new Vector3(headSaved.pos[0], headSaved.pos[1], headSaved.pos[2])
      : (this.cockpit?.getHeadOffset() ?? new Vector3(-0.4, 1.15, -0.65));
    head.y += DRIVER_HEAD_RAISE; // raise the eye-point so the driver sees over the dash
    this.cameraSystem.enableFirstPerson(this.vehicle.getVisualRoot(), head, DRIVER_HEAD_PITCH_DOWN);
  }

  /** Cockpit reacts to driving: refresh the LCD readout. */
  /* istanbul ignore next — browser-only cockpit LCD updates */
  private updateCockpit(): void {
    if (!this.vehicle || !this.cockpit?.isBuilt()) return;
    // Heading-up minimap: tiles tinted by theme + NPC dots around the centred car.
    const pos = this.vehicle.getPosition();
    const entities: MinimapEntity[] = [];
    for (const a of this.npcManager?.getAgents() ?? []) {
      const p = this.npcHolderById.get(a.definition.id)?.position ?? a.getPosition();
      entities.push({ x: p.x, z: p.z, dead: a.isDefeated() });
    }
    this.cockpit.setMinimap(buildMinimapView({
      px: pos.x, pz: pos.z, heading: this.vehicle.getFacing(), entities,
      themeColorAt: (tx, tz) => ARCHETYPES[themeOf(tx, tz, this.worldSeed)].ground,
    }));
    // Roxane's voice waveform: shown ONLY during a chat with her. While she speaks,
    // sample the live TTS spectrum and map it to the dashboard bars.
    const tts = (this.tts ??= ServiceLocator.tryGet<TTSService>('tts') ?? null);
    const speaking = tts?.isSpeaking() ?? false;
    const inChat = (this.dialog?.isOpen() ?? false) && this.chatMode === 'roxane';
    this.cockpit.setWaveformVisible(inChat || speaking);
    if (speaking) {
      const freq = (this.waveSamples ??= new Uint8Array(128));
      tts!.sampleFrequencies(freq);
      this.cockpit.setWaveform(downsampleBars(freq, WAVEFORM_BARS));
      this.cockpit.setLcdText(t('roxane.speaking'));
    } else {
      this.cockpit.setWaveformIdle();
      this.cockpit.setLcdText(inChat ? t('roxane.listening') : t('roxane.online'));
    }
  }

  /** V toggles the first-person (driver) camera while piloting. */
  /* istanbul ignore next — browser-only input/camera wiring */
  private handleViewSwitch(): void {
    if (!this.inputSystem || !this.cameraSystem) return;
    if (!this.inputSystem.wasJustPressed('view.switch')) return;
    if (!(this.vehicle?.isOccupied() ?? false)) return;
    this.cameraSystem.setFirstPerson(!this.cameraSystem.isFirstPerson());
  }

  /** Hold Z / C to orbit the camera left / right — the arc follow camera, or the
   *  in-car first-person camera (driver look) when it's active. */
  private handleCameraKeys(dt: number): void {
    if (!this.inputSystem || !this.cameraSystem) return;
    const fp = this.cameraSystem.isFirstPerson();
    const spin = (delta: number): void => {
      if (fp) this.cameraSystem!.orbitFirstPerson(delta);
      else this.cameraSystem!.orbit(delta);
    };
    if (this.inputSystem.isActionActive('camera.rotateLeft')) {
      spin(KEY_ORBIT_SPEED * dt);
    }
    if (this.inputSystem.isActionActive('camera.rotateRight')) {
      spin(-KEY_ORBIT_SPEED * dt);
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

  /**
   * Learn-by-doing: apply the skill gain (× the Options multiplier), toast the
   * gain on the HUD, and grant any perk points earned. Single seam shared by
   * every successful skill check (verbal/emote/hostile/interpreter paths).
   */
  private gainSkill(skillId: string): void {
    const before = this.playerStats;
    // Well Rested (2h after sleeping) doubles all learn-by-doing gains.
    const mult = SettingsService.get('skillGainMultiplier')
      * sleepGainMultiplier(this.gameTimeSeconds, this.wellRestedUntilGameTime);
    this.playerStats = applySkillUse(before, skillId, mult);
    const def = skillDef(skillId);
    const gained = (this.playerStats.skills[skillId] ?? 0) - (before.skills[skillId] ?? 0);
    if (def && gained > 0) {
      // i18n name, not the static SkillDef label (which is pt-only).
      this.hud?.pushToast(t('toast.skillGain', { skill: t(`skill.${skillId}`), amount: gained.toFixed(1) }));
    }
    this.applyPerkPointGrants(before, this.playerStats);
  }

  /** Check if any perk points were earned after a skill-use; update stats. */
  private applyPerkPointGrants(before: CharacterStats, after: CharacterStats): void {
    const grants = detectPerkPointGrants(before, after);
    if (Object.keys(grants).length > 0) {
      this.playerStats = grantPerkPoints(after, grants);
      for (const attrId of Object.keys(grants) as AttributeId[]) {
        this.hud?.pushToast(t('toast.perkPoint', { attr: t(`attr.${attrId}`) }));
      }
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
    // While piloting, O calibrates the whole cockpit unit (dev tool to bake constants).
    if (this.vehicle?.isOccupied()) { this.openCockpitAdjust(); return; }
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

  /** Open the Adjust tool to calibrate the driver seat offset while piloting. */
  /* istanbul ignore next — browser-only camera/overlay wiring */
  private openSeatAdjust(): void {
    if (!this.adjustOverlay || !(this.vehicle?.isOccupied())) return;
    const saved = this.heldAttach['driver_seat'];
    const base: ItemAttach = saved ?? {
      pos: [DRIVER_SEAT_OFFSET.x, DRIVER_SEAT_OFFSET.y, DRIVER_SEAT_OFFSET.z],
      rot: [DRIVER_SEAT_PITCH, DRIVER_SEAT_YAW, 0],
      scale: 1,
    };
    // No bones needed — the player is parented to the vehicle, not bone-attached.
    this.adjustOverlay.open('driver_seat', 'main_hand', base, []);
  }

  /**
   * Open the Adjust tool to calibrate the whole cockpit unit (dashboard + yoke +
   * LCD) while piloting. Used during dev to find the transform; the found values are
   * then baked into COCKPIT_TRANSFORM.
   */
  /* istanbul ignore next — browser-only camera/overlay wiring */
  private openCockpitAdjust(): void {
    if (!this.adjustOverlay || !(this.vehicle?.isOccupied())) return;
    const saved = this.heldAttach['cockpit'];
    const base: ItemAttach = saved ?? {
      pos: [COCKPIT_TRANSFORM.pos[0], COCKPIT_TRANSFORM.pos[1], COCKPIT_TRANSFORM.pos[2]],
      rot: [COCKPIT_TRANSFORM.rot[0], COCKPIT_TRANSFORM.rot[1], COCKPIT_TRANSFORM.rot[2]],
      scale: COCKPIT_TRANSFORM.scale,
    };
    this.adjustOverlay.open('cockpit', 'main_hand', base, []);
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

  /** Refresh the HUD each frame: status bars (HP/Stamina/Hunger), gain toasts,
   * bike status and the contextual action prompt. */
  private updateHud(dialogOpen: boolean): void {
    if (!this.hud) return;

    this.hud.setHudTextVisible(true); // restored when not in combat
    const health = this.player?.getHealth();
    this.hud.setPlayerHealth(health ? health.fraction() : 1);
    this.hud.setPlayerStamina(this.player?.getStamina().fraction() ?? 1);
    this.hud.setPlayerHunger(this.playerHunger.fraction());
    this.hud.updateToasts();
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
      || !!this.surpriseTargeting;
    this.actionRibbon.setVisible(!busy);
    const piloting = this.vehicle?.isOccupied() ?? false;
    this.actionRibbon.setIsPiloting(piloting);
    const main = this.playerInventory.combatWeaponId;
    this.actionRibbon.setFirearmEquipped(!!main && isFirearm(main));
  }

  /** Car status line: destroyed / live HP% while relevant, else hidden. */
  private deriveVehicleStatus(): string | null {
    if (!this.vehicle) return null;
    if (this.vehicle.isDestroyed()) return t('hud.carDestroyed');
    if (this.vehicle.isOccupied() || this.vehicle.isSmoking()) {
      return t('hud.carStatus', { pct: Math.round(this.vehicle.getHealth().fraction() * 100) });
    }
    return null;
  }

  private deriveActionPrompt(dialogOpen: boolean): string | null {
    if (dialogOpen) return null;
    if (this.vehicle?.isOccupied()) return t('hud.exitCar');
    // A door in reach takes the F prompt (quadrant prop-door / interior return).
    if (this.player && this.doorArmed
      && doorTriggerHit(this.player.getPosition(), this.currentDoorTriggers())) {
      return t(this.interiorId ? 'hud.exitDoor' : 'hud.enterDoor');
    }
    if (this.player && this.vehicle?.canEnter(this.player.getPosition())) return t('hud.enterCar');
    // A bed in reach offers [E] Sleep (or a "rested" note while on cooldown).
    /* istanbul ignore next — browser-only sleep triggers; SleepSystem is unit-tested */
    if (this.player && sleepTriggerHit(this.player.getPosition(), this.currentSleepTriggers())) {
      return canSleep(this.lastSleepGameTime, this.gameTimeSeconds) ? t('hud.sleep') : t('hud.sleepRested');
    }
    if (this.npcManager && this.player) {
      const agent = this.npcManager.getConversableAgent(this.player.getPosition());
      // Don't leak the name in the prompt before the NPC introduces itself.
      if (agent && agent.isDefeated()) {
        return t('hud.searchTo', { name: agent.definition.name });
      }
      if (agent) return t('hud.talkTo', { name: agent.definition.name });
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
