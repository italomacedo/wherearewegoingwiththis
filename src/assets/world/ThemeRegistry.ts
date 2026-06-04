/**
 * ThemeRegistry — pure procedural tile generation for the 24×24 mosaic (Fase 17).
 *
 * Each tile rolls a THEME (seeded) → an ARCHETYPE describing its buildings/foliage/
 * props/NPCs/ground. Authored NPC pools per theme give each procedural NPC a name +
 * persona + outfit deterministically (the seed picks); the NPC still talks live via
 * Claude. `generateTile` is pure + deterministic — same (worldSeed, tx, tz) ⇒ same
 * tile, so the save stores only mutable deltas, never the layout.
 *
 * Layout is theme-aware: 'urban' themes (downtown/market) line buildings along the
 * tile edges; 'scatter' themes (park/forest/desert) scatter trees/rocks/foliage
 * across the interior. Assets: downtown MegaKit (`world/downtown/`) + Quaternius
 * Ultimate Nature Pack (`world/nature/`), all CC0.
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
export type TileLayout = 'urban' | 'scatter';

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
  layout: TileLayout;
  /** Themed ground tint [r,g,b] (0..1). */
  ground: [number, number, number];
  /** GLB paths for the big solids — buildings (urban) or trees (scatter). */
  buildingPool: string[];
  /** Smaller scattered props (rocks/foliage/decals). */
  propPool: { model: string; solid: boolean }[];
  /** How many big solids per tile (urban uses fixed edge slots; scatter uses this). */
  solidCount: { min: number; max: number };
  /** How many small props per tile. */
  propCount: { min: number; max: number };
  npcCount: { min: number; max: number };
  npcSlots: NpcSlot[];
  npcs: Partial<Record<NpcRole, NpcArchetypeEntry[]>>;
}

export interface GeneratedTile {
  coord: TileCoord;
  theme: ThemeId;
  ground: [number, number, number];
  props: TileProp[];
  npcDefs: NPCDefinition[];
}

const DT = 'world/downtown/';
const NAT = 'world/nature/';

// ─── Asset pools ──────────────────────────────────────────────────────────
const DOWNTOWN_BUILDINGS = [
  `${DT}building_medium_2_001.glb`, `${DT}building_large_2.glb`, `${DT}building_small_1.glb`,
];
const DOWNTOWN_PROPS: { model: string; solid: boolean }[] = [
  { model: `${DT}prop_bollard.glb`, solid: true },
  { model: `${DT}prop_planter_single.glb`, solid: true },
  { model: `${DT}prop_acunit.glb`, solid: true },
  { model: `${DT}prop_manholecover.glb`, solid: false },
];
const FOREST_TREES = [
  `${NAT}commontree_1.glb`, `${NAT}commontree_3.glb`, `${NAT}commontree_5.glb`,
  `${NAT}pinetree_1.glb`, `${NAT}pinetree_3.glb`, `${NAT}pinetree_5.glb`,
  `${NAT}birchtree_1.glb`, `${NAT}birchtree_3.glb`, `${NAT}willow_1.glb`, `${NAT}willow_3.glb`,
];
const FOREST_PROPS: { model: string; solid: boolean }[] = [
  { model: `${NAT}rock_moss_1.glb`, solid: true }, { model: `${NAT}rock_moss_5.glb`, solid: true },
  { model: `${NAT}woodlog_moss.glb`, solid: true }, { model: `${NAT}treestump_moss.glb`, solid: true },
  { model: `${NAT}bush_1.glb`, solid: false }, { model: `${NAT}bushberries_1.glb`, solid: false },
  { model: `${NAT}plant_1.glb`, solid: false }, { model: `${NAT}plant_3.glb`, solid: false },
  { model: `${NAT}grass.glb`, solid: false },
];
const PARK_TREES = [
  `${NAT}commontree_1.glb`, `${NAT}commontree_3.glb`,
  `${NAT}birchtree_autumn_2.glb`, `${NAT}birchtree_autumn_4.glb`,
];
const PARK_PROPS: { model: string; solid: boolean }[] = [
  { model: `${NAT}bush_1.glb`, solid: false }, { model: `${NAT}flowers.glb`, solid: false },
  { model: `${NAT}grass.glb`, solid: false }, { model: `${NAT}plant_5.glb`, solid: false },
  { model: `${NAT}rock_1.glb`, solid: true }, { model: `${NAT}woodlog.glb`, solid: true },
  { model: `${NAT}lilypad.glb`, solid: false },
];
const DESERT_TREES = [
  `${NAT}cactus_1.glb`, `${NAT}cactus_3.glb`, `${NAT}cactus_5.glb`,
  `${NAT}palmtree_1.glb`, `${NAT}palmtree_3.glb`,
];
const DESERT_PROPS: { model: string; solid: boolean }[] = [
  { model: `${NAT}rock_1.glb`, solid: true }, { model: `${NAT}rock_3.glb`, solid: true },
  { model: `${NAT}rock_7.glb`, solid: true }, { model: `${NAT}grass_short.glb`, solid: false },
  { model: `${NAT}cactusflower_1.glb`, solid: false }, { model: `${NAT}cactusflowers_2.glb`, solid: false },
];
const MARKET_PROPS: { model: string; solid: boolean }[] = [
  { model: 'world/props/props_shelf_tall.glb', solid: true },
  { model: `${DT}prop_planter_single.glb`, solid: true },
  { model: `${DT}prop_bollard.glb`, solid: true },
  { model: 'world/food/apple.glb', solid: false },
  { model: 'world/food/bread.glb', solid: false },
];

// ─── NPC pools ──────────────────────────────────────────────────────────────
const credit = (n: number): InventoryStack[] => [{ id: 'credstick', qty: n }];

const DOWNTOWN_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [
    {
      name: 'Dex', role: 'street-corner noodle vendor',
      personalityPrompt: 'You run a steaming noodle cart and have seen every kind of trouble walk past it. Warm, talkative, quick to gossip about the neighborhood, but you keep your head down when the corps come around.',
      backstory: 'A lifer on the strip; your cart has fed three generations of the block.',
      routine: 'Ladle noodles by day, trade rumors for tips by night.',
      defaultMood: 'friendly', initialDisposition: 'neutral', outfit: 'casual_2', loadout: credit(2),
    },
    {
      name: 'Mara', role: 'tired shift worker waiting for a tram',
      personalityPrompt: 'You just finished a double shift and want nothing but to get home. Curt but not unkind; you answer in as few words as possible.',
      backstory: 'You assemble drones in a corp fab two levels down and hate every minute of it.',
      routine: 'Clock in, clock out, repeat — the strip is just your commute.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'worker', loadout: credit(1),
    },
  ],
  runner: [{
    name: 'Kit', role: 'edgerunner courier for hire',
    personalityPrompt: 'You move packages nobody asks questions about. Fast-talking, cocky, always sizing up whether a stranger is a mark, a cop, or a client.',
    backstory: 'Burned a corp contract and went freelance; speed and silence keep you alive.',
    routine: 'Run jobs across the strip, dodging Vyse-Tek patrols and rival crews.',
    relationships: 'Owes money to a fixer and pretends not to.',
    defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'casual_hoodie',
    loadout: [{ id: 'knife', qty: 1 }, ...credit(3)],
  }],
  corporate: [{
    name: 'Vance', role: 'Vyse-Tek corporate fixer',
    personalityPrompt: 'You wear a clean suit on a dirty strip and you know it buys you nothing but contempt here. Smooth, condescending, always dangling money to get what you want.',
    backstory: 'A mid-tier corp operator who slums the strip to recruit deniable talent.',
    routine: 'Cut deals, buy silence, report upward.',
    relationships: 'Despised by the activists and runners who see you as the enemy.',
    defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'suit',
    loadout: [{ id: 'knife', qty: 1 }, ...credit(6)],
  }],
  arm_dealer: [{
    name: 'Sledge', role: 'back-alley weapons dealer',
    personalityPrompt: 'You sell hardware out of a coat with too many pockets. Gruff, transactional, suspicious of cops and chatty strangers, but money talks.',
    backstory: 'Ex-merc who decided selling guns beats getting shot with them.',
    routine: 'Work the alleys, move pistols and blades, never the same corner twice.',
    defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'worker',
    loadout: [{ id: 'pistol', qty: 1 }, { id: 'knife', qty: 1 }, ...credit(4)],
  }],
  armor_dealer: [{
    name: 'Plate', role: 'armor and gear fence',
    personalityPrompt: 'You deal in protection — vests, plates, anything that stops a round. Practical, blunt, you respect anyone smart enough to buy armor before they need it.',
    backstory: 'Scavenged a corp armory once and never looked back.',
    routine: 'Hawk armor from a folding stall, pack up fast when patrols sweep through.',
    defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'casual_2',
    loadout: [{ id: 'armor_tac_top', qty: 1 }, { id: 'medkit', qty: 1 }, ...credit(4)],
  }],
};

const PARK_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [
    {
      name: 'Lina', role: 'jogger catching her breath',
      personalityPrompt: 'You come to the park to escape the smog and the screens. Cheerful, open, happy to chat — a rare bit of warmth in a cold city.',
      backstory: 'A clinic nurse who guards these green hours like treasure.',
      routine: 'Run the loop at dawn, feed the koi, head to a long shift.',
      defaultMood: 'friendly', initialDisposition: 'friendly', outfit: 'casual', loadout: credit(2),
    },
    {
      name: 'Old Bram', role: 'park-bench philosopher',
      personalityPrompt: 'You feed pigeons and dispense unsolicited wisdom. Rambling, kind, you remember the city before the corps fenced the sky.',
      backstory: 'A retired transit driver who outlived his whole route.',
      routine: 'Sit, watch, mutter at the world going by.',
      defaultMood: 'friendly', initialDisposition: 'neutral', outfit: 'casual_2', loadout: credit(1),
    },
  ],
  arm_dealer: [{
    name: 'Reed', role: 'quiet fixer who works the park benches',
    personalityPrompt: 'You do business where the cameras are fewest. Low-voiced, careful, you sell what people need and forget their faces.',
    backstory: 'Found the park is the safest market in the city.',
    routine: 'Drift the paths, meet clients by the fountain, vanish by dusk.',
    defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'casual_hoodie',
    loadout: [{ id: 'pistol', qty: 1 }, ...credit(3)],
  }],
};

const FOREST_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [
    {
      name: 'Juno', role: 'off-grid forager',
      personalityPrompt: 'You live off what the woods give and trust the trees more than people. Quiet, watchful, slow to warm but honest once you do.',
      backstory: 'Walked away from the city after it took everything; the forest took you in.',
      routine: 'Gather, snare, trade herbs at the treeline market.',
      defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'farmer',
      loadout: [{ id: 'knife', qty: 1 }, { id: 'medkit', qty: 1 }, ...credit(2)],
    },
    {
      name: 'Hollis', role: 'wandering hermit',
      personalityPrompt: 'You speak in riddles and half-prophecies about the rot at the city heart. Eccentric, harmless, oddly perceptive.',
      backstory: 'A washed-out netrunner whose mind never fully came back from the deep.',
      routine: 'Wander the trails, talk to crows, avoid the road.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'adventurer', loadout: credit(1),
    },
  ],
  arm_dealer: [{
    name: 'Bracken', role: 'poacher and gun-runner',
    personalityPrompt: 'You hunt what is protected and sell what is banned. Hard, unsentimental, you size up everyone as either buyer or witness.',
    backstory: 'The deep woods hide your stash and your sins.',
    routine: 'Run traplines, move contraband through the trees.',
    defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'worker',
    loadout: [{ id: 'pistol', qty: 1 }, { id: 'knife', qty: 1 }, ...credit(3)],
  }],
};

const DESERT_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [
    {
      name: 'Sora', role: 'wasteland nomad',
      personalityPrompt: 'You read the dunes like a map and ration words like water. Stoic, weathered, generous to travelers but unforgiving of fools.',
      backstory: 'Your clan crossed these sands long before the city poisoned them.',
      routine: 'Follow the wind to the next well, trade salt and stories.',
      defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'beach',
      loadout: [{ id: 'knife', qty: 1 }, ...credit(2)],
    },
  ],
  arm_dealer: [{
    name: 'Cinder', role: 'desert smuggler',
    personalityPrompt: 'You run guns and contraband across the open waste where no law reaches. Sun-baked, sardonic, always armed, always counting.',
    backstory: 'The sand swallows evidence; that is why you work here.',
    routine: 'Cache, run, sell at the oasis markets.',
    defaultMood: 'suspicious', initialDisposition: 'wary', outfit: 'adventurer',
    loadout: [{ id: 'pistol', qty: 1 }, { id: 'shotgun', qty: 1 }, ...credit(4)],
  }],
};

const MARKET_NPCS: Partial<Record<NpcRole, NpcArchetypeEntry[]>> = {
  civilian: [{
    name: 'Pia', role: 'stall merchant hawking street food',
    personalityPrompt: 'You shout your wares over the crowd and never miss a sale. Loud, shrewd, friendly in the way that wants your money.',
    backstory: 'Born in the bazaar, you can price anything at a glance.',
    routine: 'Open the stall at dawn, haggle till the lamps die.',
    defaultMood: 'friendly', initialDisposition: 'neutral', outfit: 'casual', loadout: credit(3),
  }],
  arm_dealer: [{
    name: 'Tariq', role: 'black-market arms seller',
    personalityPrompt: 'You keep the real merchandise under the counter. Charming, slippery, you trust a credstick more than a handshake.',
    backstory: 'Turned a spice stall into a weapons pipeline one favor at a time.',
    routine: 'Front legit goods, sell hardware to the right faces.',
    defaultMood: 'neutral', initialDisposition: 'neutral', outfit: 'suit',
    loadout: [{ id: 'pistol', qty: 1 }, { id: 'knife', qty: 1 }, ...credit(5)],
  }],
  armor_dealer: [{
    name: 'Greta', role: 'armor stall keeper',
    personalityPrompt: 'You sell secondhand plate and swear by every piece. Maternal but iron-willed, you upsell protection like a worried parent.',
    backstory: 'Widowed by a corp war; now you make sure others come home.',
    routine: 'Mind the stall, mend dents, push the good vests.',
    defaultMood: 'friendly', initialDisposition: 'neutral', outfit: 'worker',
    loadout: [{ id: 'armor_tac_top', qty: 1 }, { id: 'medkit', qty: 1 }, ...credit(4)],
  }],
};

export const ARCHETYPES: Record<ThemeId, Archetype> = {
  downtown: {
    themeId: 'downtown', layout: 'urban', ground: [0.18, 0.18, 0.21],
    buildingPool: DOWNTOWN_BUILDINGS, propPool: DOWNTOWN_PROPS,
    solidCount: { min: 0, max: 0 }, propCount: { min: 2, max: 4 },
    npcCount: { min: 1, max: 3 },
    npcSlots: [
      { role: 'civilian', weight: 4 }, { role: 'runner', weight: 3 },
      { role: 'corporate', weight: 2 }, { role: 'arm_dealer', weight: 1 }, { role: 'armor_dealer', weight: 1 },
    ],
    npcs: DOWNTOWN_NPCS,
  },
  market: {
    themeId: 'market', layout: 'urban', ground: [0.20, 0.18, 0.15],
    buildingPool: DOWNTOWN_BUILDINGS, propPool: MARKET_PROPS,
    solidCount: { min: 0, max: 0 }, propCount: { min: 4, max: 7 },
    npcCount: { min: 2, max: 4 },
    npcSlots: [
      { role: 'civilian', weight: 4 }, { role: 'arm_dealer', weight: 2 }, { role: 'armor_dealer', weight: 2 },
    ],
    npcs: MARKET_NPCS,
  },
  park: {
    themeId: 'park', layout: 'scatter', ground: [0.18, 0.34, 0.16],
    buildingPool: PARK_TREES, propPool: PARK_PROPS,
    solidCount: { min: 4, max: 8 }, propCount: { min: 6, max: 12 },
    npcCount: { min: 1, max: 3 },
    npcSlots: [{ role: 'civilian', weight: 5 }, { role: 'arm_dealer', weight: 1 }],
    npcs: PARK_NPCS,
  },
  forest: {
    themeId: 'forest', layout: 'scatter', ground: [0.12, 0.24, 0.12],
    buildingPool: FOREST_TREES, propPool: FOREST_PROPS,
    solidCount: { min: 10, max: 18 }, propCount: { min: 8, max: 16 },
    npcCount: { min: 0, max: 2 },
    npcSlots: [{ role: 'civilian', weight: 5 }, { role: 'arm_dealer', weight: 1 }],
    npcs: FOREST_NPCS,
  },
  desert: {
    themeId: 'desert', layout: 'scatter', ground: [0.55, 0.45, 0.28],
    buildingPool: DESERT_TREES, propPool: DESERT_PROPS,
    solidCount: { min: 2, max: 6 }, propCount: { min: 3, max: 8 },
    npcCount: { min: 0, max: 2 },
    npcSlots: [{ role: 'civilian', weight: 5 }, { role: 'arm_dealer', weight: 1 }],
    npcs: DESERT_NPCS,
  },
};

/** Theme weighting for the random-per-tile roll. */
const THEME_WEIGHTS: { theme: ThemeId; weight: number }[] = [
  { theme: 'downtown', weight: 3 },
  { theme: 'market', weight: 2 },
  { theme: 'park', weight: 2 },
  { theme: 'forest', weight: 2 },
  { theme: 'desert', weight: 1 },
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
  rng(); // burn one draw so the theme roll is decorrelated from layout draws
  return weightedPick(rng, THEME_WEIGHTS).theme;
}

/** Lay urban buildings along the north + south edges (world-positioned). */
function layBuildings(rng: RollFn, arch: Archetype, c: TileCoord): TileProp[] {
  const out: TileProp[] = [];
  const xs = [-18, 0, 18];
  for (const z of [10, -10]) {
    for (let i = 0; i < xs.length; i++) {
      if (rng() < 0.25) continue; // gaps so tiles vary
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

/** Scatter big solids (trees/cacti) across the tile interior (world-positioned). */
function scatterSolids(rng: RollFn, arch: Archetype, c: TileCoord): TileProp[] {
  const out: TileProp[] = [];
  const n = intRange(rng, arch.solidCount.min, arch.solidCount.max);
  for (let i = 0; i < n; i++) {
    const model = pick(rng, arch.buildingPool);
    const [x, , z] = tileLocalToWorld(c.tx, c.tz, [range(rng, -26, 26), 0, range(rng, -26, 26)]);
    out.push({ key: `t-tree-${c.tx}-${c.tz}-${i}`, model, position: [x, 0, z], rotationY: range(rng, 0, Math.PI * 2), solid: true });
  }
  return out;
}

/** Scatter small props (rocks/foliage/decals) across the tile interior. */
function scatterProps(rng: RollFn, arch: Archetype, c: TileCoord): TileProp[] {
  const out: TileProp[] = [];
  const n = intRange(rng, arch.propCount.min, arch.propCount.max);
  // Urban props hug the road centre band; scatter themes spread everywhere.
  const zSpread = arch.layout === 'urban' ? 6 : 26;
  for (let i = 0; i < n; i++) {
    const p = pick(rng, arch.propPool);
    const [x, , z] = tileLocalToWorld(c.tx, c.tz, [range(rng, -24, 24), 0, range(rng, -zSpread, zSpread)]);
    out.push({ key: `t-prop-${c.tx}-${c.tz}-${i}`, model: p.model, position: [x, 0, z], rotationY: range(rng, 0, Math.PI * 2), solid: p.solid });
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
    /* istanbul ignore next -- every archetype slot has a populated pool (asserted in tests) */
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
 * downtown zone and is built elsewhere — the streamer never calls this for it.
 */
export function generateTile(tx: number, tz: number, worldSeed: number): GeneratedTile {
  const theme = themeOf(tx, tz, worldSeed);
  const arch = ARCHETYPES[theme];
  const rng = tileRng(worldSeed, tx, tz);
  rng(); // keep in sync with themeOf's burned draw so layout is stable
  const coord = { tx, tz };
  const solids = arch.layout === 'urban' ? layBuildings(rng, arch, coord) : scatterSolids(rng, arch, coord);
  const props = [...solids, ...scatterProps(rng, arch, coord)];
  const npcDefs = genNpcs(rng, arch, coord, theme);
  return { coord, theme, ground: arch.ground, props, npcDefs };
}
