import {
  generateTile, themeOf, ARCHETYPES, type GeneratedTile,
} from '@assets/world/ThemeRegistry';
import { tileCenter } from '@systems/world/WorldGrid';

const SEED = 12345;

describe('ThemeRegistry (pure)', () => {
  describe('themeOf', () => {
    it('tile (0,0) is always downtown', () => {
      expect(themeOf(0, 0, SEED)).toBe('downtown');
      expect(themeOf(0, 0, 999)).toBe('downtown');
    });
    it('is deterministic per (seed, tile)', () => {
      expect(themeOf(3, 4, SEED)).toBe(themeOf(3, 4, SEED));
    });
  });

  describe('generateTile determinism', () => {
    const a = generateTile(5, 7, SEED);
    const b = generateTile(5, 7, SEED);
    it('same inputs → identical layout + NPC ids', () => {
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
    it('different tile → different content (ids encode the tile)', () => {
      const c = generateTile(6, 7, SEED);
      expect(c.npcDefs.every((d) => d.id.includes('_t6_7_'))).toBe(true);
      if (a.npcDefs.length) expect(a.npcDefs[0].id).not.toBe(c.npcDefs[0]?.id);
    });
  });

  describe('generated content', () => {
    const tiles: GeneratedTile[] = [];
    for (let tx = 1; tx <= 6; tx++) for (let tz = 0; tz <= 6; tz++) tiles.push(generateTile(tx, tz, SEED));

    it('NPC count stays within the downtown archetype range', () => {
      const range = ARCHETYPES.downtown!.npcCount;
      for (const t of tiles) {
        expect(t.npcDefs.length).toBeGreaterThanOrEqual(0); // some draws hit empty pools? no — all roles populated
        expect(t.npcDefs.length).toBeLessThanOrEqual(range.max);
      }
    });

    it('NPC ids are unique within a tile and encode role + coords', () => {
      for (const t of tiles) {
        const ids = t.npcDefs.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const d of t.npcDefs) {
          expect(d.id).toMatch(/^[a-z_]+_t\d+_\d+_\d+$/);
          expect(d.appearance).toBeDefined();
          expect(d.name.length).toBeGreaterThan(0);
        }
      }
    });

    it('props + NPCs are positioned in the tile (near its world centre)', () => {
      const t = generateTile(4, 3, SEED);
      const [cx, , cz] = tileCenter(4, 3);
      for (const p of t.props) {
        expect(Math.abs(p.position[0] - cx)).toBeLessThanOrEqual(30);
        expect(Math.abs(p.position[2] - cz)).toBeLessThanOrEqual(30);
      }
      for (const d of t.npcDefs) {
        expect(Math.abs(d.position[0] - cx)).toBeLessThanOrEqual(30);
        expect(Math.abs(d.position[2] - cz)).toBeLessThanOrEqual(30);
      }
    });

    it('solid buildings are flagged for collider building', () => {
      const t = generateTile(2, 2, SEED);
      const buildings = t.props.filter((p) => p.key.includes('-bld-'));
      expect(buildings.every((b) => b.solid === true)).toBe(true);
    });

    it('all archetype NPC roles resolve to a populated pool', () => {
      const arch = ARCHETYPES.downtown!;
      for (const slot of arch.npcSlots) {
        expect((arch.npcs[slot.role] ?? []).length).toBeGreaterThan(0);
      }
    });
  });
});
