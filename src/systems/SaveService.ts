import { CharacterData, DEFAULT_APPEARANCE, cloneAppearance, migrateAppearance } from '@entities/CharacterData';
import { ConversationState } from '@systems/npc/ConversationContext';
import { HealthState } from '@entities/Health';
import { HungerState } from '@entities/Hunger';
import { StaminaState } from '@entities/Stamina';
import { createDefaultStats, maxHpFor, isHacker } from '@entities/CharacterStats';
import { NPCDisposition } from '@entities/NPCAgent';
import { InventoryState, defaultInventoryState } from '@entities/Inventory';
import type { AttachOverrides } from '@systems/HeldItems';
import type { Mission, PendingOffer } from '@systems/economy/Missions';
import type { SpiceContract } from '@systems/economy/SpiceTrade';
import type { GroundItem } from '@systems/world/GroundItems';
import type { PdaEntry } from '@systems/pda/Pda';

/**
 * Per-NPC persisted memory: conversation state, the dynamic disposition toward the
 * player, and the NPC→NPC relationship ledger (8B). The latter two are optional so
 * legacy saves load unchanged (they default to the definition's values).
 */
export type NPCMemory = Record<string, ConversationState & {
  disposition?: NPCDisposition;
  relationships?: Record<string, NPCDisposition>;
  events?: string[];
  inventory?: InventoryState;
  /** Death status (Fase 18): a defeated NPC reloads dead, not alive. */
  defeated?: boolean;
}>;

export interface VehicleSaveState {
  health: HealthState;
  destroyed: boolean;
  /** Does this save own the nave? NEW saves start WITHOUT one (owned: false —
   *  it becomes purchasable later); undefined = legacy save = owns it. */
  owned?: boolean;
  /** Where the nave was parked (Fase 22 fix). Undefined on legacy saves → the
   *  scene falls back to the default spawn offset near the zone spawn point. */
  position?: [number, number, number];
  /** Parked heading (radians) so the nave keeps its facing across a reload. */
  facing?: number;
}

export const DEFAULT_PLAYER_HEALTH: HealthState = { current: 100, max: 100 };
export const DEFAULT_PLAYER_HUNGER: HungerState = { current: 100, max: 100 };
export const DEFAULT_PLAYER_STAMINA: StaminaState = { current: 100, max: 100 };
export const DEFAULT_VEHICLE_STATE: VehicleSaveState = {
  health: { current: 100, max: 100 },
  destroyed: false,
};

export interface SaveGame {
  saveId: string;
  saveName: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;
  gameTimeSeconds: number;
  character: CharacterData;
  world: {
    zone: string;
    position: [number, number, number];
    rotation: number;
    /** Seed for deterministic procedural tile generation (Fase 17). */
    worldSeed: number;
    /** The mosaic tile [tx,tz] the player was last in (Fase 17). */
    currentTile: [number, number];
    /** Inside an authored interior (Scene Editor F6): doc id + the mosaic tile the
     *  player entered from (so the exit door lands them back on the right tile).
     *  `entry` is the legacy field (older saves) read on restore for migration. */
    interior?: {
      sceneId: string;
      originTile?: [number, number];
      entry?: import('@systems/world/SceneDocToTile').WorldDoorTrigger;
    };
  };
  playerHealth: HealthState;
  playerHunger: HungerState;
  playerStamina: StaminaState;
  vehicle: VehicleSaveState;
  inventory: InventoryState;
  /** Per-item held-prop transform overrides tuned in-game (Adjust tool). */
  heldAttach: AttachOverrides;
  /** Active/complete/cancelled kill-contracts the player has taken on (Phase 16 + Fase 21). */
  missions: Mission[];
  /** Trade/mission OFFERS made by NPCs that the player has not yet accepted or
   *  declined. Persist cross-session (Fase 21, decision #11). 1 per (npcId, kind);
   *  a fresh offer overwrites the previous. */
  pendings: PendingOffer[];
  /** Active/complete spice-trafficking contracts the player took from dealers (Fase 22). */
  spiceContracts: SpiceContract[];
  /** Items the player dropped into the world, by tile (Fase 18). */
  groundItems: GroundItem[];
  /** Scene-Editor seeded pickups already collected, by seededItemKey. */
  collectedSceneItems: string[];
  /** Intel dossiers gathered by scanning/hacking NPCs (Fase 20 PDA). */
  pda: PdaEntry[];
  flags: Record<string, boolean | number | string>;
  npcMemory: NPCMemory;
}

export interface SaveMeta {
  saveId: string;
  saveName: string;
  updatedAt: string;
  gameTimeSeconds: number;
  thumbnailDataUrl?: string;
}

const STORAGE_KEY_PREFIX = 'beirario-save-';
const SAVES_INDEX_KEY = 'beirario-saves-index';

export class SaveService {
  /** In-memory store: the single source of truth at runtime (synchronous reads).
   * Hydrated from disk by init() on boot, written through to disk on save(). */
  private static memoryStore = new Map<string, SaveGame>();
  private static memoryIndex: string[] = [];

  /** The Electron save IPC bridge, if running in the desktop app. */
  /* istanbul ignore next — browser/IPC accessor */
  private static api(): typeof window.electronAPI | undefined {
    return typeof window !== 'undefined' ? window.electronAPI : undefined;
  }

  /**
   * Hydrate the in-memory store from disk (Electron) once at boot, so the
   * synchronous load()/listMeta() the scenes call see persisted saves. Disk
   * files (userData/saves/*.json) have no localStorage 5 MB cap. Falls through
   * to the localStorage backend in the browser preview, and to pure memory in
   * tests (no window). Never rejects — failure leaves an empty store.
   */
  /* istanbul ignore next — browser/IPC boot path */
  static async init(): Promise<void> {
    const api = SaveService.api();
    if (!api?.saveList) return; // browser preview / tests → localStorage/memory
    try {
      const saves = (await api.saveList()) as SaveGame[];
      for (const s of saves) {
        SaveService.memoryStore.set(s.saveId, s);
        if (!SaveService.memoryIndex.includes(s.saveId)) SaveService.memoryIndex.push(s.saveId);
      }
      SaveService.importLegacyLocalStorage(api);
    } catch { /* leave store empty — never block boot */ }
  }

  /** One-time migration: copy any pre-existing localStorage saves to disk so a
   * player who saved under the old backend doesn't lose their game. Disk wins. */
  /* istanbul ignore next — browser/IPC migration */
  private static importLegacyLocalStorage(api: NonNullable<typeof window.electronAPI>): void {
    if (typeof localStorage === 'undefined') return;
    let ids: string[];
    try { ids = JSON.parse(localStorage.getItem(SAVES_INDEX_KEY) ?? '[]') as string[]; }
    catch { return; }
    for (const id of ids) {
      if (SaveService.memoryStore.has(id)) continue; // already on disk
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
      if (!raw) continue;
      try {
        const s = JSON.parse(raw) as SaveGame;
        SaveService.memoryStore.set(s.saveId, s);
        if (!SaveService.memoryIndex.includes(s.saveId)) SaveService.memoryIndex.push(s.saveId);
        void api.saveWrite(s);
      } catch { /* skip a corrupt legacy entry */ }
    }
  }

  static createNewSave(character: CharacterData, saveName?: string): SaveGame {
    const now = new Date().toISOString();
    const saveId = SaveService.generateId();
    // Pervasive HP scaled by Resistência (Fase 20): a fresh hero's max HP comes from stats.
    const maxHp = character.stats ? maxHpFor(character.stats) : DEFAULT_PLAYER_HEALTH.max;
    // Cyberdeck rule (Fase 20): IT ≥ 20 means an amateur hacker → starts with a deck.
    const inventory = defaultInventoryState();
    if (character.stats && isHacker(character.stats)) inventory.items.push({ id: 'cyberdeck', qty: 1 });
    // Fase 21: player starts with seed money so commerce + early-game trades are testable.
    inventory.items.push({ id: 'credstick', qty: 100 });
    return {
      saveId,
      saveName: saveName ?? `Save ${saveId.slice(0, 4)}`,
      createdAt: now,
      updatedAt: now,
      gameTimeSeconds: 0,
      character,
      world: {
        zone: 'mercado_sombras',
        position: [0, 0, 0],
        rotation: 0,
        worldSeed: SaveService.seedFrom(saveId),
        currentTile: [0, 0],
      },
      playerHealth: { current: maxHp, max: maxHp },
      playerHunger: { ...DEFAULT_PLAYER_HUNGER },
      playerStamina: { ...DEFAULT_PLAYER_STAMINA },
      vehicle: { health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false, owned: false },
      inventory,
      heldAttach: {},
      missions: [],
      pendings: [],
      spiceContracts: [],
      groundItems: [],
      collectedSceneItems: [],
      pda: [],
      flags: {},
      npcMemory: {},
    };
  }

  static updateNpcMemory(saveId: string, npcMemory: NPCMemory): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, npcMemory });
  }

  static updateInventory(saveId: string, inventory: InventoryState): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, inventory });
  }

  static updateHunger(saveId: string, playerHunger: HungerState): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, playerHunger });
  }

  static updateHeldAttach(saveId: string, heldAttach: AttachOverrides): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, heldAttach });
  }

  static updateMissions(saveId: string, missions: Mission[]): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, missions });
  }

  /** Persist pending trade/mission offers (Fase 21, decision #11 — cross-session). */
  static updatePendings(saveId: string, pendings: PendingOffer[]): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, pendings });
  }

  /** Persist spice-trafficking contracts (Fase 22). */
  static updateSpiceContracts(saveId: string, spiceContracts: SpiceContract[]): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, spiceContracts });
  }

  static save(saveGame: SaveGame): void {
    const now = new Date().toISOString();
    const updated = { ...saveGame, updatedAt: now };
    SaveService.memoryStore.set(updated.saveId, updated);
    if (!SaveService.memoryIndex.includes(updated.saveId)) {
      SaveService.memoryIndex = [...SaveService.memoryIndex, updated.saveId];
    }
    SaveService.persist(updated);
  }

  /** Write-through: persist to disk via IPC (Electron) or, failing that, to
   * localStorage (browser preview). The disk path has no quota; the localStorage
   * setItem is wrapped so a QuotaExceededError can never abort the in-memory save
   * (the bug that made saves silently vanish). Tests (no window) skip both. */
  /* istanbul ignore next — browser/IPC persistence */
  private static persist(save: SaveGame): void {
    const api = SaveService.api();
    if (api?.saveWrite) { void api.saveWrite(save).catch(() => { /* logged in main */ }); return; }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${save.saveId}`, JSON.stringify(save));
        localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(SaveService.memoryIndex));
      } catch { /* quota/full — disk path is preferred; best-effort here */ }
    }
  }

  static load(saveId: string): SaveGame | null {
    if (SaveService.memoryStore.has(saveId)) {
      const copy = JSON.parse(JSON.stringify(SaveService.memoryStore.get(saveId)!)) as SaveGame;
      return SaveService.migrate(copy);
    }
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${saveId}`);
      if (raw) {
        try {
          return SaveService.migrate(JSON.parse(raw) as SaveGame);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  static listMeta(): SaveMeta[] {
    const ids = SaveService.memoryIndex.length > 0
      ? SaveService.memoryIndex
      : SaveService.loadIndex();

    return ids
      .map((id) => SaveService.load(id))
      .filter((s): s is SaveGame => s !== null)
      .map((s) => ({
        saveId: s.saveId,
        saveName: s.saveName,
        updatedAt: s.updatedAt,
        gameTimeSeconds: s.gameTimeSeconds,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  static delete(saveId: string): boolean {
    const existed = SaveService.memoryStore.has(saveId) || SaveService.load(saveId) !== null;
    SaveService.memoryStore.delete(saveId);
    SaveService.memoryIndex = SaveService.memoryIndex.filter((id) => id !== saveId);
    // Delete the ON-DISK file (Electron) — the Fase-18 refactor wired the disk
    // backend into save() but missed this, so deleted saves came back on relaunch
    // (init() re-read the still-present file). Also purge any localStorage copy so a
    // legacy save can't be resurrected by init()'s one-time import next boot.
    const api = SaveService.api();
    /* istanbul ignore next — browser/IPC delete */
    if (api?.saveDelete) void api.saveDelete(saveId).catch(() => { /* logged in main */ });
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${saveId}`);
      localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(SaveService.memoryIndex));
    }
    return existed;
  }

  static updateWorldState(
    saveId: string,
    world: SaveGame['world'],
    gameTimeSeconds: number
  ): void {
    const save = SaveService.load(saveId);
    if (!save) return;
    SaveService.save({ ...save, world, gameTimeSeconds });
  }

  static formatGameTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  static reset(): void {
    SaveService.memoryStore.clear();
    SaveService.memoryIndex = [];
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith(STORAGE_KEY_PREFIX) || k === SAVES_INDEX_KEY
      );
      keys.forEach((k) => localStorage.removeItem(k));
    }
  }

  /** Backfills fields added after a save was first written. */
  private static migrate(save: SaveGame): SaveGame {
    if (!save.npcMemory) save.npcMemory = {};
    if (!save.playerHealth) save.playerHealth = { ...DEFAULT_PLAYER_HEALTH };
    if (!save.playerHunger) save.playerHunger = { ...DEFAULT_PLAYER_HUNGER };
    if (!save.playerStamina) save.playerStamina = { ...DEFAULT_PLAYER_STAMINA };
    if (!save.vehicle) {
      save.vehicle = { health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false };
    }
    if (save.character?.appearance) {
      save.character.appearance = migrateAppearance(save.character.appearance);
    }
    if (save.character && !save.character.stats) {
      save.character.stats = createDefaultStats();
    }
    if (!save.inventory) save.inventory = defaultInventoryState();
    if (!save.heldAttach) save.heldAttach = {};
    if (!save.missions) save.missions = [];
    // Fase 21: pendings cross-session (decision #11). Legacy saves get an empty list.
    if (!save.pendings) save.pendings = [];
    // Fase 22: spice-trafficking contracts. Legacy saves get an empty list.
    if (!save.spiceContracts) save.spiceContracts = [];
    if (!save.groundItems) save.groundItems = [];
    // Scene Editor: collected seeded-pickup keys. Legacy saves get an empty list.
    if (!save.collectedSceneItems) save.collectedSceneItems = [];
    if (!save.pda) save.pda = [];
    // Fase 17: backfill the procedural-world seed (derived stably from the saveId
    // so a legacy save always regenerates the same world) + the current tile.
    if (save.world) {
      if (typeof save.world.worldSeed !== 'number') save.world.worldSeed = SaveService.seedFrom(save.saveId);
      if (!save.world.currentTile) save.world.currentTile = [0, 0];
    }
    // Fase 19: backfill perkPoints for saves without it.
    if (save.character?.stats && !save.character.stats.perkPoints) {
      save.character.stats.perkPoints = {};
    }
    return save;
  }

  /** Deterministic 32-bit world seed from a save id (stable across reloads). */
  private static seedFrom(saveId: string): number {
    let h = 2166136261;
    for (let i = 0; i < saveId.length; i++) {
      h ^= saveId.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  private static generateId(): string {
    return Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10);
  }

  private static loadIndex(): string[] {
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(SAVES_INDEX_KEY);
        if (raw) return JSON.parse(raw) as string[];
      } catch {
        return [];
      }
    }
    return [];
  }
}

export const EMPTY_CHARACTER: CharacterData = {
  name: 'Operative',
  appearance: cloneAppearance(DEFAULT_APPEARANCE),
};
