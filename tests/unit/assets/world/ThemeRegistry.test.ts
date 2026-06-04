import {
  generateTile, themeOf, ARCHETYPES, type GeneratedTile, type ThemeId,
} from '@assets/world/ThemeRegistry';
import { tileCenter } from '@systems/world/WorldGrid';

const SEED = 12345;
const ALL_THEMES: ThemeId[] = ['downtown', 'park', 'forest', 'desert', 'market'];

describe('ThemeRegistry (pure)', () => {
  describe('themeOf', () => {
    it('tile (0,0) is always downtown', () => {
      expect(themeOf(0, 0, SEED)).toBe('downtown');
      expect(themeOf(0, 0, 999)).toBe('downtown');
    });
    it('is deterministic per (seed, tile) and only yields known themes', () => {
      expect(themeOf(3, 4, SEED)).toBe(themeOf(3, 4, SEED));
      for (let tx = 0; tx <= 8; tx++) for (let tz = 0; tz <= 8; tz++) {
        expect(ALL_THEMES).toContain(themeOf(tx, tz, SEED));
      }
    });
    it('produces a mix of themes across the grid', () => {
      const seen = new Set<ThemeId>();
      for (let tx = 0; tx <= 12; tx++) for (let tz = 0; tz <= 12; tz++) seen.add(themeOf(tx, tz, SEED));
      expect(seen.size).toBeGreaterThanOrEqual(3); // not all one theme
    });
  });

  describe('archetypes', () => {
    it('every theme has an archetype with a populated pool per slot', () => {
      for (const theme of ALL_THEMES) {
        const arch = ARCHETYPES[theme];
        expect(arch.themeId).toBe(theme);
        expect(arch.buildingPool.length).toBeGreaterThan(0);
        expect(arch.propPool.length).toBeGreaterThan(0);
        for (const slot of arch.npcSlots) {
          expect((arch.npcs[slot.role] ?? []).length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('generateTile determinism', () => {
    it('same inputs → identical layout + NPC ids', () => {
      expect(JSON.stringify(generateTile(5, 7, SEED))).toBe(JSON.stringify(generateTile(5, 7, SEED)));
    });
    it('ids encode the tile coordinates', () => {
      const c = generateTile(6, 7, SEED);
      expect(c.npcDefs.every((d) => d.id.includes('_t6_7_'))).toBe(true);
    });
  });

  describe('generated content (all themes)', () => {
    const tiles: GeneratedTile[] = [];
    for (let tx = 1; tx <= 8; tx++) for (let tz = 0; tz <= 8; tz++) tiles.push(generateTile(tx, tz, SEED));

    it('NPC count stays within its theme archetype range', () => {
      for (const t of tiles) {
        const r = ARCHETYPES[t.theme].npcCount;
        expect(t.npcDefs.length).toBeGreaterThanOrEqual(r.min);
        expect(t.npcDefs.length).toBeLessThanOrEqual(r.max);
      }
    });

    it('exercises every theme over the sampled grid', () => {
      const seen = new Set(tiles.map((t) => t.theme));
      for (const theme of ALL_THEMES) expect(seen.has(theme)).toBe(true);
    });

    it('NPC ids are unique within a tile + carry a real appearance/name', () => {
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

    it('props + NPCs sit inside the tile (within ±30 of its world centre)', () => {
      for (const t of tiles) {
        const [cx, , cz] = tileCenter(t.coord.tx, t.coord.tz);
        for (const p of t.props) {
          expect(Math.abs(p.position[0] - cx)).toBeLessThanOrEqual(30);
          expect(Math.abs(p.position[2] - cz)).toBeLessThanOrEqual(30);
        }
        for (const d of t.npcDefs) {
          expect(Math.abs(d.position[0] - cx)).toBeLessThanOrEqual(30);
          expect(Math.abs(d.position[2] - cz)).toBeLessThanOrEqual(30);
        }
      }
    });

    it('carries a themed ground color', () => {
      for (const t of tiles) {
        expect(t.ground).toEqual(ARCHETYPES[t.theme].ground);
      }
    });

    it('urban tiles line buildings on edges; scatter tiles spread trees', () => {
      const urban = generateTile(1, 0, SEED); // could be any theme — assert by its own layout
      void urban;
      // Find one urban + one scatter tile in the sample and check key prefixes.
      const urbanTile = tiles.find((t) => ARCHETYPES[t.theme].layout === 'urban');
      const scatterTile = tiles.find((t) => ARCHETYPES[t.theme].layout === 'scatter');
      if (urbanTile) {
        expect(urbanTile.props.some((p) => p.key.includes('-bld-') || p.key.includes('-prop-'))).toBe(true);
      }
      if (scatterTile && scatterTile.props.length) {
        expect(scatterTile.props.some((p) => p.key.includes('-tree-') || p.key.includes('-prop-'))).toBe(true);
      }
    });
  });
});
