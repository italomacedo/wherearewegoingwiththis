/**
 * ThemeRegistry — pure procedural tile generation for the 24×24 mosaic (Fase 17).
 *
 * Each tile rolls a THEME (seeded) which maps to an ARCHETYPE describing its
 * buildings/props/NPCs. Authored NPC pools per theme give each procedural NPC a
 * name + persona + outfit deterministically (the seed picks); the NPC still talks
 * live via Claude afterward. `generateTile` is pure and deterministic — the same
 * (worldSeed, tx, tz) always yields the same tile, so the save stores only the
 * mutable deltas, never the layout.
 *
 * Phase C ships the DOWNTOWN theme on the already-converted assets. Park/forest/
 * desert/market archetypes + pools land in Phase E with their CC0 packs.
 *
 * No Babylon, no DOM — 100% unit-testable.
 */

import type { NPCDefinition, NPCMood, NPCDisposition } from '@entities/NPCAgent';
import type { InventoryStack } from '@entities/Inventory';
import type { CharacterAppearance } from '@entities/CharacterData';
import { DEFAULT_COLORS } from '@entities/CharacterData';
import type { WorldProp } from '@assets/WorldAssetCatalog';
import { type TileCoord, tileLocalToWorld } from '@systems/world/WorldGrid';
import { type RollFn } from '@systems/SkillCheck';
import { tileRng, pick, range, intRange, weightedPick } from '@systems/world/SeededRng';

export type ThemeId = 'downtown' | 'park' | 'forest' | 'desert' | 'market';
export type NpcRole =
  | 'civilian' | 'runner' | 'corporate' | 'arm_dealer' | 'armor_dealer' | 'vehicle_dealer';

/** A WorldProp plus whether it should block the player (gets a box collider). */
export type TileProp = WorldProp & { solid?: boolean };

/** An authored NPC template — the seed fills in id + world position per tile. */
export interface NpcArchetypeEntry {
  name: string;
  role: string;
  personalityPrompt: string;
  backstory: string;
  routine: string;
  relationships?: string;
  defaultMood: NPCMood;
  initialDisposition: NPCDisposition;
  /** Avatar outfit key (Quaternius); gender derives from it. */
  outfit: string;
  loadout?: InventoryStack[];
}

export interface NpcSlot { role: NpcRole; weight: number }

export interface Archetype {
  themeId: ThemeId;
  /** GLB paths (relative to /assets/) for buildings lining the tile. */
  buildingPool: string[];
  /** GLB props scattered on the tile. */
  propPool: { model: string; solid: boolean }[];
  /** How many NPCs spawn on a tile. */
  npcCount: { min: number; max: number };
  /** Weighted role mix for this theme. */
  npcSlots: NpcSlot[];
  /** Authored NPC templates per role. */
  npcs: Partial<Record<NpcRole, NpcArchetypeEntry[]>>;
}

export interface GeneratedTile {
  coord: TileCoord;
  theme: ThemeId;
  props: TileProp[];
  npcDefs: NPCDefinition[];
}

const DT = 'world/downtown/';
const DOWNTOWN_BUILDINGS = [
  `${DT}building_medium_2_001.glb`, `${DT}building_large_2.glb`, `${DT}building_small_1.glb`,
];
const DOWNTOWN_PROPS: { model: string; solid: boolean }[] = [
  { model: `${DT}prop_bollard.glb`, solid: true },
  { model: `${DT}prop_planter_single.glb`, solid: true },
  { model: `${DT}prop_acunit.glb`, solid: true },
  { model: `${DT}prop_manholecover.glb`, solid: false },
];

const DOWNTOWN_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [
    {
      name: 'Dex', role: 'street-corner noodle vendor',
      personalityPrompt: 'You run a steaming noodle cart and have seen every kind of trouble walk past it. Warm, talkative, quick to gossip about the neighborhood, but you keep your head down when the corps come around.',
      backstory: 'A lifer on the strip; your cart has fed three generations of the block.',
      routine: 'Ladle noodles by day, trade rumors for tips by night.',
      defaultMood: 'friendly', initialDisposition: 'neutral', outfit: 'casual_2',
      loadout: [{ id: 'credstick', qty: 2 }],
    },
    {
      name: 'Mara', role: 'tired shift worker waiting for a tram',
      personalityPrompt: 'You just finished a double shift and want nothing but to get home. Curt but not unkind; you answer questions in as few words as possible.',
      backstory: 'You assemble drones in a corp fab two levels down and hate every minute of it.',
      routine: 'Clock in, clock out, repeat — the strip is just your commute.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'worker',
      loadout: [{ id: 'credstick', qty: 1 }],
    },
  ],
  runner: [
    {
      name: 'Kit', role: 'edgerunner courier for hire',
      personalityPrompt: 'You move packages nobody asks questions about. Fast-talking, cocky, always sizing up whether a stranger is a mark, a cop, or a client.',
      backstory: 'Burned a corp contract and went freelance; speed and silence keep you alive.',
      routine: 'Run jobs across the strip, dodging Vyse-Tek patrols and rival crews.',
      relationships: 'Owes money to a fixer and pretends not to.',
      defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'casual_hoodie',
      loadout: [{ id: 'knife', qty: 1 }, { id: 'credstick', qty: 3 }],
    },
  ],
  corporate: [
    {
      name: 'Vance', role: 'Vyse-Tek corporate fixer',
      personalityPrompt: 'You wear a clean suit on a dirty strip and you know it buys you nothing but contempt here. Smooth, condescending, always dangling money to get what you want.',
      backstory: 'A mid-tier corp operator who slums the strip to recruit deniable talent.',
      routine: 'Cut deals, buy silence, report upward.',
      relationships: 'Despised by the activists and runners who see you as the enemy.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'suit',
      loadout: [{ id: 'knife', qty: 1 }, { id: 'credstick', qty: 6 }],
    },
  ],
  arm_dealer: [
    {
      name: 'Sledge', role: 'back-alley weapons dealer',
      personalityPrompt: 'You sell hardware out of a coat with too many pockets. Gruff, transactional, suspicious of cops and chatty strangers, but money talks.',
      backstory: 'Ex-merc who decided selling guns beats getting shot with them.',
      routine: 'Work the alleys, move pistols and blades, never the same corner twice.',
      defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'worker',
      loadout: [{ id: 'pistol', qty: 1 }, { id: 'knife', qty: 1 }, { id: 'credstick', qty: 4 }],
    },
  ],
  armor_dealer: [
    {
      name: 'Plate', role: 'armor and gear fence',
      personalityPrompt: 'You deal in protection — vests, plates, anything that stops a round. Practical, blunt, you respect anyone smart enough to buy armor before they need it.',
      backstory: 'Scavenged a corp armory once and never looked back.',
      routine: 'Hawk armor from a folding stall, pack up fast when patrols sweep through.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'casual_2',
      loadout: [{ id: 'armor_tac_top', qty: 1 }, { id: 'medkit', qty: 1 }, { id: 'credstick', qty: 4 }],
    },
  ],
};

export const ARCHETYPES: Partial<Record<ThemeId, Archetype>> = {
  downtown: {
    themeId: 'downtown',
    buildingPool: DOWNTOWN_BUILDINGS,
    propPool: DOWNTOWN_PROPS,
    npcCount: { min: 1, max: 3 },
    npcSlots: [
      { role: 'civilian', weight: 4 },
      { role: 'runner', weight: 3 },
      { role: 'corporate', weight: 2 },
      { role: 'arm_dealer', weight: 1 },
      { role: 'armor_dealer', weight: 1 },
    ],
    npcs: DOWNTOWN_NPCS,
  },
};

/** Theme weighting for the random-per-tile roll (Phase C: downtown only). */
const THEME_WEIGHTS: { theme: ThemeId; weight: number }[] = [
  { theme: 'downtown', weight: 1 },
];

function appearanceFor(outfit: string): CharacterAppearance {
  return {
    bodyBase: outfit, slots: {}, morphs: {},
    colors: { ...DEFAULT_COLORS }, skinTexture: 'skin_01',
    accessories: [], implants: [], avatarPieces: {},
  };
}

/** Pick this tile's theme (deterministic). Tile (0,0) is always static downtown. */
export function themeOf(tx: number, tz: number, worldSeed: number): ThemeId {
  if (tx === 0 && tz === 0) return 'downtown';
  const rng = tileRng(worldSeed, tx, tz);
  // burn one draw so the theme roll is decorrelated from layout draws below
  rng();
  return weightedPick(rng, THEME_WEIGHTS).theme;
}

/** Lay this tile's buildings along the north + south edges (world-positioned). */
function layBuildings(rng: RollFn, arch: Archetype, c: TileCoord): TileProp[] {
  const out: TileProp[] = [];
  const xs = [-18, 0, 18];
  for (const z of [10, -10]) {
    for (let i = 0; i < xs.length; i++) {
      if (rng() < 0.25) continue; // some gaps so tiles vary
      const model = pick(rng, arch.buildingPool);
      const [x, , wz] = tileLocalToWorld(c.tx, c.tz, [xs[i] + range(rng, -2, 2), 0, z]);
      out.push({
        key: `t-bld-${c.tx}-${c.tz}-${z > 0 ? 'n' : 's'}-${i}`,
        model, position: [x, 0, wz], rotationY: z > 0 ? Math.PI : 0, solid: true,
      });
    }
  }
  return out;
}

/** Scatter a few props across the tile interior (world-positioned). */
function scatterProps(rng: RollFn, arch: Archetype, c: TileCoord): TileProp[] {
  const out: TileProp[] = [];
  const n = intRange(rng, 2, 4);
  for (let i = 0; i < n; i++) {
    const p = pick(rng, arch.propPool);
    const [x, , z] = tileLocalToWorld(c.tx, c.tz, [range(rng, -22, 22), 0, range(rng, -6, 6)]);
    out.push({ key: `t-prop-${c.tx}-${c.tz}-${i}`, model: p.model, position: [x, 0, z], solid: p.solid });
  }
  return out;
}

/** Build this tile's NPC definitions with UNIQUE per-tile ids + world positions. */
function genNpcs(rng: RollFn, arch: Archetype, c: TileCoord, theme: ThemeId): NPCDefinition[] {
  const count = intRange(rng, arch.npcCount.min, arch.npcCount.max);
  const defs: NPCDefinition[] = [];
  for (let i = 0; i < count; i++) {
    const role = weightedPick(rng, arch.npcSlots).role;
    const pool = arch.npcs[role];
    /* istanbul ignore next -- every downtown slot has a populated pool (asserted in tests); guards future themes */
    if (!pool || pool.length === 0) continue;
    const e = pick(rng, pool);
    const [x, , z] = tileLocalToWorld(c.tx, c.tz, [range(rng, -18, 18), 0, range(rng, -5, 5)]);
    defs.push({
      id: `${role}_t${c.tx}_${c.tz}_${i}`,
      name: e.name,
      role: e.role,
      location: `a ${theme} block in the sprawl`,
      personalityPrompt: e.personalityPrompt,
      defaultMood: e.defaultMood,
      interactionRadius: 8,
      conversationRadius: 3,
      position: [x, 0, z],
      appearance: appearanceFor(e.outfit),
      backstory: e.backstory,
      routine: e.routine,
      relationships: e.relationships,
      initialDisposition: e.initialDisposition,
      loadout: e.loadout,
    });
  }
  return defs;
}

/**
 * Generate one procedural tile (pure, deterministic). Tile (0,0) is the static
 * downtown zone and is generated elsewhere — callers should skip it (this still
 * returns a valid downtown tile for it if asked, but the streamer never builds it).
 */
export function generateTile(tx: number, tz: number, worldSeed: number): GeneratedTile {
  const theme = themeOf(tx, tz, worldSeed);
  /* istanbul ignore next -- Phase C ships only downtown; the fallback is exercised once other themes land (Phase E) */
  const arch = ARCHETYPES[theme] ?? ARCHETYPES.downtown!;
  const rng = tileRng(worldSeed, tx, tz);
  rng(); // keep in sync with themeOf's burned draw so layout is stable
  const coord = { tx, tz };
  const props = [...layBuildings(rng, arch, coord), ...scatterProps(rng, arch, coord)];
  const npcDefs = genNpcs(rng, arch, coord, theme);
  return { coord, theme, props, npcDefs };
}
