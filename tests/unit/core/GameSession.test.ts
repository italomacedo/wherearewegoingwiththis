import { GameSession } from '../../../src/core/GameSession';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

const character = { name: 'Kai', appearance: { ...DEFAULT_APPEARANCE } };

describe('GameSession', () => {
  it('applies defaults when only saveId + character are given', () => {
    const session = new GameSession('s1', character);
    expect(session.saveId).toBe('s1');
    expect(session.npcMemory).toEqual({});
    expect(session.world).toEqual({ zone: 'mercado_sombras', position: [0, 0, 0], rotation: 0 });
    expect(session.gameTimeSeconds).toBe(0);
  });

  it('keeps explicit values when provided', () => {
    const session = new GameSession(
      's2',
      character,
      { npc_x: { mode: 'stateless', sessionId: null, history: [] } },
      { zone: 'z', position: [1, 2, 3], rotation: 1 },
      42,
    );
    expect(session.world.position).toEqual([1, 2, 3]);
    expect(session.gameTimeSeconds).toBe(42);
    expect(session.npcMemory.npc_x).toBeDefined();
  });

  it('fromSave copies identity, memory, world and time', () => {
    const save = SaveService.createNewSave(character, 'My Save');
    save.gameTimeSeconds = 120;
    save.world = { zone: 'mercado_sombras', position: [5, 0, 7], rotation: 2 };
    save.npcMemory = { npc_zara_vendor_01: { mode: 'stateless', sessionId: null, history: [] } };

    const session = GameSession.fromSave(save);
    expect(session.saveId).toBe(save.saveId);
    expect(session.character.name).toBe('Kai');
    expect(session.world).toEqual({ zone: 'mercado_sombras', position: [5, 0, 7], rotation: 2 });
    expect(session.gameTimeSeconds).toBe(120);
    expect(session.npcMemory.npc_zara_vendor_01).toBeDefined();
    // world is copied, not aliased
    expect(session.world).not.toBe(save.world);
  });

  it('fromSave tolerates a save with no npcMemory', () => {
    const save = SaveService.createNewSave(character);
    // simulate a legacy save missing npcMemory
    (save as { npcMemory?: unknown }).npcMemory = undefined;
    const session = GameSession.fromSave(save);
    expect(session.npcMemory).toEqual({});
  });
});
