import { GameSession } from '../../../src/core/GameSession';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

const character = { name: 'Kai', appearance: { ...DEFAULT_APPEARANCE } };

describe('GameSession', () => {
  it('applies defaults when only saveId + character are given', () => {
    const session = new GameSession('s1', character);
    expect(session.saveId).toBe('s1');
    expect(session.npcMemory).toEqual({});
    expect(session.world).toEqual({ zone: 'mercado_sombras', position: [0, 0, 0], rotation: 0, worldSeed: 1, currentTile: [0, 0] });
    expect(session.gameTimeSeconds).toBe(0);
  });

  it('keeps explicit values when provided', () => {
    const session = new GameSession(
      's2',
      character,
      { npc_x: { mode: 'stateless', sessionId: null, history: [] } },
      { zone: 'z', position: [1, 2, 3], rotation: 1, worldSeed: 7, currentTile: [0, 0] },
      42,
    );
    expect(session.world.position).toEqual([1, 2, 3]);
    expect(session.gameTimeSeconds).toBe(42);
    expect(session.npcMemory.npc_x).toBeDefined();
  });

  it('fromSave copies identity, memory, world and time', () => {
    const save = SaveService.createNewSave(character, 'My Save');
    save.gameTimeSeconds = 120;
    save.world = { zone: 'mercado_sombras', position: [5, 0, 7], rotation: 2, worldSeed: 123, currentTile: [1, 2] };
    save.npcMemory = { npc_zara_vendor_01: { mode: 'stateless', sessionId: null, history: [] } };

    const session = GameSession.fromSave(save);
    expect(session.saveId).toBe(save.saveId);
    expect(session.character.name).toBe('Kai');
    expect(session.world).toEqual({ zone: 'mercado_sombras', position: [5, 0, 7], rotation: 2, worldSeed: 123, currentTile: [1, 2] });
    expect(session.gameTimeSeconds).toBe(120);
    expect(session.npcMemory.npc_zara_vendor_01).toBeDefined();
    // world is copied, not aliased
    expect(session.world).not.toBe(save.world);
  });

  it('fromSave falls back to a default world seed + tile when the save omits them', () => {
    const save = SaveService.createNewSave(character);
    // Simulate a half-migrated save object missing the procedural-world fields.
    delete (save.world as Partial<typeof save.world>).worldSeed;
    delete (save.world as Partial<typeof save.world>).currentTile;
    const session = GameSession.fromSave(save);
    expect(session.world.worldSeed).toBe(1);
    expect(session.world.currentTile).toEqual([0, 0]);
  });

  it('defaults player + vehicle health when constructed minimally', () => {
    const session = new GameSession('s', character);
    expect(session.playerHealth).toEqual({ current: 100, max: 100 });
    expect(session.vehicle.destroyed).toBe(false);
    expect(session.vehicle.health.current).toBe(100);
  });

  it('fromSave carries player + vehicle health', () => {
    const save = SaveService.createNewSave(character);
    save.playerHealth = { current: 50, max: 120 };
    save.vehicle = { health: { current: 30, max: 100 }, destroyed: true };
    const session = GameSession.fromSave(save);
    expect(session.playerHealth).toEqual({ current: 50, max: 120 });
    expect(session.vehicle.destroyed).toBe(true);
    expect(session.vehicle.health.current).toBe(30);
  });

  it('defaults to an empty inventory + full hunger when constructed minimally', () => {
    const session = new GameSession('s', character);
    expect(session.inventory).toEqual({ items: [], equipped: {}, equippedWeaponId: null, capacityWeight: 30 });
    expect(session.playerHunger).toEqual({ current: 100, max: 100 });
  });

  it('fromSave carries player hunger (defaulting to full on a legacy save)', () => {
    const save = SaveService.createNewSave(character);
    save.playerHunger = { current: 33, max: 100 };
    expect(GameSession.fromSave(save).playerHunger).toEqual({ current: 33, max: 100 });
    (save as { playerHunger?: unknown }).playerHunger = undefined;
    expect(GameSession.fromSave(save).playerHunger).toEqual({ current: 100, max: 100 });
  });

  it('carries player stamina (full by default; fromSave defaults on a legacy save)', () => {
    expect(new GameSession('s', character).playerStamina).toEqual({ current: 100, max: 100 });
    const save = SaveService.createNewSave(character);
    save.playerStamina = { current: 12, max: 135 };
    expect(GameSession.fromSave(save).playerStamina).toEqual({ current: 12, max: 135 });
    (save as { playerStamina?: unknown }).playerStamina = undefined;
    expect(GameSession.fromSave(save).playerStamina).toEqual({ current: 100, max: 100 });
  });

  it('carries sleep cooldown + well-rested buff (undefined on a legacy save)', () => {
    expect(new GameSession('s', character).lastSleepGameTime).toBeUndefined();
    expect(new GameSession('s', character).wellRestedUntilGameTime).toBeUndefined();
    const save = SaveService.createNewSave(character);
    save.lastSleepGameTime = 1000;
    save.wellRestedUntilGameTime = 8200;
    const session = GameSession.fromSave(save);
    expect(session.lastSleepGameTime).toBe(1000);
    expect(session.wellRestedUntilGameTime).toBe(8200);
  });

  it('fromSave carries the inventory, defaulting to empty on a legacy save', () => {
    const save = SaveService.createNewSave(character);
    save.inventory = { items: [{ id: 'knife', qty: 1 }], equippedWeaponId: 'knife', capacityWeight: 30 };
    expect(GameSession.fromSave(save).inventory.equippedWeaponId).toBe('knife');
    (save as { inventory?: unknown }).inventory = undefined;
    expect(GameSession.fromSave(save).inventory).toEqual({ items: [], equipped: {}, equippedWeaponId: null, capacityWeight: 30 });
  });

  it('fromSave tolerates a save with no npcMemory', () => {
    const save = SaveService.createNewSave(character);
    // simulate a legacy save missing npcMemory
    (save as { npcMemory?: unknown }).npcMemory = undefined;
    const session = GameSession.fromSave(save);
    expect(session.npcMemory).toEqual({});
  });
});
