import { CharacterData } from '@entities/CharacterData';
import {
  NPCMemory, SaveGame, VehicleSaveState,
  DEFAULT_PLAYER_HEALTH, DEFAULT_PLAYER_HUNGER, DEFAULT_VEHICLE_STATE,
} from '@systems/SaveService';
import { HealthState } from '@entities/Health';
import { HungerState } from '@entities/Hunger';
import { InventoryState, defaultInventoryState } from '@entities/Inventory';

export interface WorldState {
  zone: string;
  position: [number, number, number];
  rotation: number;
}

/**
 * Cross-scene holder for the active game's identity and mutable state.
 *
 * Created by the Character Creator (new game) or the Load Game scene, registered
 * in the ServiceLocator under `'gameSession'`, and read by GameWorldScene on
 * enter. GameWorldScene writes world position + NPC memory back to it (and to
 * disk via SaveService) on exit. This is the "glue" that carries
 * `{ saveId, character, npcMemory, world }` between scenes whose factories only
 * receive an Engine.
 */
export class GameSession {
  constructor(
    public saveId: string,
    public character: CharacterData,
    public npcMemory: NPCMemory = {},
    public world: WorldState = { zone: 'mercado_sombras', position: [0, 0, 0], rotation: 0 },
    public gameTimeSeconds: number = 0,
    public playerHealth: HealthState = { ...DEFAULT_PLAYER_HEALTH },
    public vehicle: VehicleSaveState = {
      health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false,
    },
    public inventory: InventoryState = defaultInventoryState(),
    public playerHunger: HungerState = { ...DEFAULT_PLAYER_HUNGER },
  ) {}

  /** Builds a session from a persisted save. */
  static fromSave(save: SaveGame): GameSession {
    return new GameSession(
      save.saveId,
      save.character,
      save.npcMemory ?? {},
      { ...save.world },
      save.gameTimeSeconds,
      save.playerHealth ?? { ...DEFAULT_PLAYER_HEALTH },
      save.vehicle ?? { health: { ...DEFAULT_VEHICLE_STATE.health }, destroyed: false },
      save.inventory ?? defaultInventoryState(),
      save.playerHunger ?? { ...DEFAULT_PLAYER_HUNGER },
    );
  }
}
