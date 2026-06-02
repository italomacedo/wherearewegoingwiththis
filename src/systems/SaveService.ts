import { CharacterData, DEFAULT_APPEARANCE, cloneAppearance, migrateAppearance } from '@entities/CharacterData';
import { ConversationState } from '@systems/npc/ConversationContext';
import { HealthState } from '@entities/Health';
import { createDefaultStats } from '@entities/CharacterStats';
import { NPCDisposition } from '@entities/NPCAgent';
import { InventoryState, defaultInventoryState } from '@entities/Inventory';

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
}>;

export interface VehicleSaveState {
  health: HealthState;
  destroyed: boolean;
}

export const DEFAULT_PLAYER_HEALTH: HealthState = { current: 100, max: 100 };
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
  };
  playerHealth: HealthState;
  vehicle: VehicleSaveState;
  inventory: InventoryState;
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
  /** In-memory store for Node.js/Jest environments */
  private static memoryStore = new Map<string, SaveGame>();
  private static memoryIndex: string[] = [];

  static createNewSave(character: CharacterData, saveName?: string): SaveGame {
    const now = new Date().toISOString();
    const saveId = SaveService.generateId();
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
      },
      playerHealth: { ...DEFAULT_PLAYER_HEALTH },
      vehicle: { health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false },
      inventory: defaultInventoryState(),
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

  static save(saveGame: SaveGame): void {
    const now = new Date().toISOString();
    const updated = { ...saveGame, updatedAt: now };
    SaveService.memoryStore.set(updated.saveId, updated);
    if (!SaveService.memoryIndex.includes(updated.saveId)) {
      SaveService.memoryIndex = [...SaveService.memoryIndex, updated.saveId];
    }
    /* istanbul ignore next */
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${updated.saveId}`, JSON.stringify(updated));
      localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(SaveService.memoryIndex));
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
    return save;
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
