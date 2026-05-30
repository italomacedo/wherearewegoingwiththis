import { CharacterData } from '@entities/CharacterData';
import { NPCMemory, SaveGame } from '@systems/SaveService';

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
  ) {}

  /** Builds a session from a persisted save. */
  static fromSave(save: SaveGame): GameSession {
    return new GameSession(
      save.saveId,
      save.character,
      save.npcMemory ?? {},
      { ...save.world },
      save.gameTimeSeconds,
    );
  }
}
