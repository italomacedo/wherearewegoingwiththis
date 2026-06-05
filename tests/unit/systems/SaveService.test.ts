import { SaveService, SaveGame, EMPTY_CHARACTER } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

const testCharacter = {
  name: 'Kai',
  appearance: { ...DEFAULT_APPEARANCE },
};

describe('SaveService', () => {
  beforeEach(() => {
    SaveService.reset();
  });

  afterEach(() => {
    SaveService.reset();
  });

  // ─── createNewSave ────────────────────────────────────────────────────────

  it('createNewSave returns a valid SaveGame', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.saveId).toBeDefined();
    expect(save.character.name).toBe('Kai');
    expect(save.gameTimeSeconds).toBe(0);
    expect(save.world.zone).toBe('mercado_sombras');
  });

  it('createNewSave includes default player + vehicle health', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.playerHealth).toEqual({ current: 100, max: 100 });
    expect(save.vehicle.health).toEqual({ current: 100, max: 100 });
    expect(save.vehicle.destroyed).toBe(false);
  });

  it('load migrates a legacy save missing health/vehicle fields', () => {
    const save = SaveService.createNewSave(testCharacter);
    // Simulate a save written before the health fields existed.
    delete (save as Partial<SaveGame>).playerHealth;
    delete (save as Partial<SaveGame>).vehicle;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.playerHealth).toEqual({ current: 100, max: 100 });
    expect(loaded.vehicle.destroyed).toBe(false);
  });

  it('createNewSave includes full player hunger', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.playerHunger).toEqual({ current: 100, max: 100 });
  });

  it('createNewSave seeds the procedural world (numeric seed, tile [0,0])', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(typeof save.world.worldSeed).toBe('number');
    expect(save.world.currentTile).toEqual([0, 0]);
  });

  it('load migrates a legacy save missing the procedural-world fields', () => {
    const save = SaveService.createNewSave(testCharacter);
    delete (save.world as Partial<SaveGame['world']>).worldSeed;
    delete (save.world as Partial<SaveGame['world']>).currentTile;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(typeof loaded.world.worldSeed).toBe('number'); // derived from saveId
    expect(loaded.world.currentTile).toEqual([0, 0]);
    // Stable across reloads (same saveId → same seed).
    expect(SaveService.load(save.saveId)!.world.worldSeed).toBe(loaded.world.worldSeed);
  });

  it('load migrates a legacy save missing the hunger field', () => {
    const save = SaveService.createNewSave(testCharacter);
    delete (save as Partial<SaveGame>).playerHunger;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.playerHunger).toEqual({ current: 100, max: 100 });
  });

  it('updateHunger persists hunger and round-trips', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.updateHunger(save.saveId, { current: 42, max: 100 });
    expect(SaveService.load(save.saveId)!.playerHunger).toEqual({ current: 42, max: 100 });
  });

  it('updateHunger is a no-op for an unknown save id', () => {
    expect(() => SaveService.updateHunger('nope', { current: 1, max: 100 })).not.toThrow();
  });

  it('createNewSave starts with empty held-attach overrides', () => {
    expect(SaveService.createNewSave(testCharacter).heldAttach).toEqual({});
  });

  it('load migrates a legacy save missing heldAttach', () => {
    const save = SaveService.createNewSave(testCharacter);
    delete (save as Partial<SaveGame>).heldAttach;
    SaveService.save(save);
    expect(SaveService.load(save.saveId)!.heldAttach).toEqual({});
  });

  it('updateHeldAttach persists per-item attach overrides', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.updateHeldAttach(save.saveId, { knife: { pos: [0.1, 0, 0], rot: [0, 0, 0], scale: 0.4, bone: 'Wrist.R' } });
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.heldAttach.knife.scale).toBe(0.4);
    expect(loaded.heldAttach.knife.bone).toBe('Wrist.R');
    expect(() => SaveService.updateHeldAttach('nope', {})).not.toThrow();
  });

  it('createNewSave includes an empty inventory', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.inventory).toEqual({ items: [], equipped: {}, equippedWeaponId: null, capacityWeight: 30 });
  });

  it('load migrates a legacy save missing the inventory field', () => {
    const save = SaveService.createNewSave(testCharacter);
    delete (save as Partial<SaveGame>).inventory;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.inventory).toEqual({ items: [], equipped: {}, equippedWeaponId: null, capacityWeight: 30 });
  });

  it('updateInventory persists the inventory and round-trips', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.updateInventory(save.saveId, {
      items: [{ id: 'knife', qty: 1 }, { id: 'medkit', qty: 2 }],
      equippedWeaponId: 'knife',
      capacityWeight: 30,
    });
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.inventory.items).toEqual([{ id: 'knife', qty: 1 }, { id: 'medkit', qty: 2 }]);
    expect(loaded.inventory.equippedWeaponId).toBe('knife');
  });

  it('updateInventory is a no-op for an unknown save id', () => {
    expect(() => SaveService.updateInventory('does-not-exist', {
      items: [], equippedWeaponId: null, capacityWeight: 30,
    })).not.toThrow();
  });

  it('load backfills a default RPG stats sheet on a legacy save', () => {
    const save = SaveService.createNewSave(testCharacter);
    delete (save.character as { stats?: unknown }).stats;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.character.stats).toBeDefined();
    expect(loaded.character.stats!.attributes.forca).toBe(20);
    expect(loaded.character.stats!.skills.medicina).toBe(10);
  });

  it('round-trips an RPG stats sheet on the character', () => {
    const save = SaveService.createNewSave(testCharacter);
    save.character.stats = {
      attributes: { forca: 30, destreza: 20, inteligencia: 20, carisma: 20 },
      skills: { armas_de_fogo: 40 },
      perks: ['forca_t1_punho_calejado'],
      perkPoints: {},
    };
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.character.stats!.attributes.forca).toBe(30);
    expect(loaded.character.stats!.skills.armas_de_fogo).toBe(40);
    expect(loaded.character.stats!.perks).toContain('forca_t1_punho_calejado');
  });

  it('createNewSave with custom name uses it', () => {
    const save = SaveService.createNewSave(testCharacter, 'My Save');
    expect(save.saveName).toBe('My Save');
  });

  it('createNewSave with no name generates a default', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.saveName).toBeDefined();
    expect(save.saveName.length).toBeGreaterThan(0);
  });

  it('two createNewSave calls produce different IDs', () => {
    const a = SaveService.createNewSave(testCharacter);
    const b = SaveService.createNewSave(testCharacter);
    expect(a.saveId).not.toBe(b.saveId);
  });

  // ─── save / load ──────────────────────────────────────────────────────────

  it('save and load round-trip preserves all fields', () => {
    const original = SaveService.createNewSave(testCharacter);
    SaveService.save(original);
    const loaded = SaveService.load(original.saveId);
    expect(loaded).not.toBeNull();
    expect(loaded!.saveId).toBe(original.saveId);
    expect(loaded!.character.name).toBe('Kai');
    expect(loaded!.world.zone).toBe('mercado_sombras');
  });

  it('save updates updatedAt timestamp', () => {
    const save = SaveService.createNewSave(testCharacter);
    const before = save.updatedAt;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId);
    expect(loaded!.updatedAt).toBeDefined();
    // updatedAt may or may not change depending on sub-ms precision
    expect(loaded!.updatedAt >= before).toBe(true);
  });

  it('load returns null for unknown saveId', () => {
    expect(SaveService.load('nonexistent-id')).toBeNull();
  });

  it('load returns a copy, not a reference', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    const a = SaveService.load(save.saveId)!;
    a.character.name = 'mutated';
    const b = SaveService.load(save.saveId)!;
    expect(b.character.name).toBe('Kai');
  });

  // ─── listMeta ─────────────────────────────────────────────────────────────

  it('listMeta returns empty array when no saves', () => {
    expect(SaveService.listMeta()).toEqual([]);
  });

  it('listMeta returns metadata for all saves', () => {
    const s1 = SaveService.createNewSave({ ...testCharacter, name: 'Kai' });
    const s2 = SaveService.createNewSave({ ...testCharacter, name: 'Rei' });
    SaveService.save(s1);
    SaveService.save(s2);
    const meta = SaveService.listMeta();
    expect(meta.length).toBe(2);
    expect(meta.map((m) => m.saveId)).toContain(s1.saveId);
    expect(meta.map((m) => m.saveId)).toContain(s2.saveId);
  });

  it('listMeta returns saves in descending order by updatedAt', () => {
    const s1 = SaveService.createNewSave(testCharacter);
    const s2 = SaveService.createNewSave(testCharacter);
    SaveService.save(s1);
    SaveService.save(s2);
    const meta = SaveService.listMeta();
    // Verify they are sorted: each entry has updatedAt >= next entry
    for (let i = 0; i < meta.length - 1; i++) {
      expect(meta[i].updatedAt >= meta[i + 1].updatedAt).toBe(true);
    }
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  it('delete removes a saved game', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    expect(SaveService.delete(save.saveId)).toBe(true);
    expect(SaveService.load(save.saveId)).toBeNull();
  });

  it('delete returns false for nonexistent save', () => {
    expect(SaveService.delete('does-not-exist')).toBe(false);
  });

  it('listMeta excludes deleted saves', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.delete(save.saveId);
    expect(SaveService.listMeta().find((m) => m.saveId === save.saveId)).toBeUndefined();
  });

  // ─── updateWorldState ─────────────────────────────────────────────────────

  it('updateWorldState changes position and time', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.updateWorldState(
      save.saveId,
      { zone: 'neon_district', position: [10, 0, 5], rotation: 1.5, worldSeed: 1, currentTile: [0, 0] },
      3600
    );
    const updated = SaveService.load(save.saveId)!;
    expect(updated.world.zone).toBe('neon_district');
    expect(updated.world.position).toEqual([10, 0, 5]);
    expect(updated.gameTimeSeconds).toBe(3600);
  });

  it('updateWorldState does nothing for nonexistent save', () => {
    expect(() =>
      SaveService.updateWorldState('bad-id', { zone: 'x', position: [0, 0, 0], rotation: 0, worldSeed: 1, currentTile: [0, 0] }, 0)
    ).not.toThrow();
  });

  // ─── formatGameTime ───────────────────────────────────────────────────────

  it('formatGameTime formats 0 as 00:00:00', () => {
    expect(SaveService.formatGameTime(0)).toBe('00:00:00');
  });

  it('formatGameTime formats 3661 as 01:01:01', () => {
    expect(SaveService.formatGameTime(3661)).toBe('01:01:01');
  });

  it('formatGameTime formats large values correctly', () => {
    expect(SaveService.formatGameTime(36000)).toBe('10:00:00');
  });

  // ─── EMPTY_CHARACTER ──────────────────────────────────────────────────────

  it('EMPTY_CHARACTER has default appearance', () => {
    expect(EMPTY_CHARACTER.name).toBe('Operative');
    expect(EMPTY_CHARACTER.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  // ─── npcMemory ──────────────────────────────────────────────────────────────

  it('createNewSave starts with empty npcMemory', () => {
    const save = SaveService.createNewSave(testCharacter);
    expect(save.npcMemory).toEqual({});
  });

  it('updateNpcMemory persists NPC conversation state', () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    SaveService.updateNpcMemory(save.saveId, {
      npc_zara_vendor_01: {
        mode: 'stateless',
        sessionId: null,
        history: [{ player: 'hi', npc: 'what do you want' }],
      },
    });
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.npcMemory.npc_zara_vendor_01.history).toHaveLength(1);
  });

  it('updateNpcMemory does nothing for nonexistent save', () => {
    expect(() => SaveService.updateNpcMemory('bad-id', {})).not.toThrow();
  });

  it('load backfills npcMemory for saves created without it', () => {
    const save = SaveService.createNewSave(testCharacter);
    // Simulate a legacy save missing npcMemory
    delete (save as Partial<SaveGame>).npcMemory;
    SaveService.save(save);
    const loaded = SaveService.load(save.saveId)!;
    expect(loaded.npcMemory).toEqual({});
  });

  // ─── File-based persistence via the Electron IPC bridge (Fase 18.1) ─────────
  describe('Electron IPC backend', () => {
    const win = globalThis as unknown as { window?: { electronAPI?: unknown } };
    afterEach(() => { delete win.window; SaveService.reset(); });

    it('init() hydrates the in-memory store from disk and save() writes through', async () => {
      const onDisk = SaveService.createNewSave(testCharacter, 'Disk Save');
      const written: SaveGame[] = [];
      win.window = {
        electronAPI: {
          saveList: async () => [JSON.parse(JSON.stringify(onDisk))],
          saveWrite: async (s: SaveGame) => { written.push(s); return true; },
          saveDelete: async () => true,
        },
      };

      await SaveService.init();
      // Hydrated: the disk save is now listable + loadable synchronously.
      expect(SaveService.listMeta().some((m) => m.saveId === onDisk.saveId)).toBe(true);
      expect(SaveService.load(onDisk.saveId)?.saveName).toBe('Disk Save');

      // save() writes through to disk via the bridge (not localStorage).
      const fresh = SaveService.createNewSave(testCharacter, 'Fresh');
      SaveService.save(fresh);
      expect(written.some((s) => s.saveId === fresh.saveId)).toBe(true);
    });

    it('delete() removes the on-disk file via the bridge (so it stays deleted on relaunch)', async () => {
      const deleted: string[] = [];
      const a = SaveService.createNewSave(testCharacter, 'A');
      win.window = {
        electronAPI: {
          saveList: async () => [JSON.parse(JSON.stringify(a))],
          saveWrite: async () => true,
          saveDelete: async (id: string) => { deleted.push(id); return true; },
        },
      };
      await SaveService.init();
      expect(SaveService.delete(a.saveId)).toBe(true);
      expect(deleted).toEqual([a.saveId]);                 // disk file removed via IPC
      expect(SaveService.listMeta().some((m) => m.saveId === a.saveId)).toBe(false);
    });

    it('init() is a no-op (no throw) when no Electron bridge is present', async () => {
      await expect(SaveService.init()).resolves.toBeUndefined();
    });
  });
});
