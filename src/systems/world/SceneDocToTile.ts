/**
 * SceneDocToTile — turns an authored quadrant SceneDoc into the same
 * `GeneratedTile` shape the procedural generator emits, so TileScenery /
 * NPC streaming consume it unchanged (street frame, colliders, spawning).
 *
 * Also exposes the doc content `GeneratedTile` can't carry: door triggers
 * (world-space AABBs) and scene-seeded ground items. Pure, 100% tested.
 */
import type { GeneratedTile } from '@assets/world/ThemeRegistry';
import { appearanceFor, generateTile } from '@assets/world/ThemeRegistry';
import { tileLocalToWorld } from '@systems/world/WorldGrid';
import { hash32, mulberry32 } from '@systems/world/SeededRng';
import type { NPCDefinition } from '@entities/NPCAgent';
import type { SceneDoc, DoorTriggerDoc } from '@systems/sceneeditor/SceneDoc';
import type { GroundItem } from '@systems/world/GroundItems';

/** Chance a non-(0,0) tile uses an authored quadrant instead of procedural gen. */
export const AUTHORED_TILE_CHANCE = 0.35;

/** Salt for the authored-quadrant roll's own hash stream (rollSpiceTraits trick):
 *  drawing from a SEPARATE stream keeps every non-authored tile bit-identical to
 *  the pure-procedural world, no matter how many quadrant docs exist. */
const AUTHORED_ROLL_SALT = 99;

/**
 * Deterministically pick the authored quadrant for tile (tx,tz), or null when
 * the tile stays procedural. `docs` must be the stable, id-sorted quadrant list
 * (SceneDocSource sorts) — same docs ⇒ a tile keeps its quadrant forever.
 * Tile (0,0) is the static downtown and never rolls.
 */
export function pickQuadrantDoc(
  docs: readonly SceneDoc[], tx: number, tz: number, worldSeed: number,
): SceneDoc | null {
  if (docs.length === 0 || (tx === 0 && tz === 0)) return null;
  const rng = mulberry32(hash32(worldSeed, tx, tz, AUTHORED_ROLL_SALT));
  if (rng() >= AUTHORED_TILE_CHANCE) return null;
  return docs[Math.min(docs.length - 1, Math.floor(rng() * docs.length))];
}

/**
 * The streaming entry point: an authored quadrant tile when the roll hits, else
 * the unchanged procedural `generateTile`. Returns the doc used (null when
 * procedural) so the caller can also place its door triggers / seeded items.
 */
export function generateTileAuthored(
  tx: number, tz: number, worldSeed: number, quadrants: readonly SceneDoc[],
): { tile: GeneratedTile; doc: SceneDoc | null } {
  const doc = pickQuadrantDoc(quadrants, tx, tz, worldSeed);
  if (doc) return { tile: tileFromSceneDoc(doc, tx, tz), doc };
  return { tile: generateTile(tx, tz, worldSeed), doc: null };
}

/** A door trigger lifted to world space, carried beside the GeneratedTile. */
export interface WorldDoorTrigger {
  key: string;
  /** World-space AABB centre. */
  position: [number, number, number];
  /** Full extents [w,h,d]. */
  size: [number, number, number];
  targetSceneId: string;
  /** SCENE-LOCAL spawn point inside the target scene. */
  spawnPoint: [number, number, number];
}

/** Runtime NPC id for a doc NPC placed on a tile — unique per tile instance. */
export function quadrantNpcId(docId: string, tx: number, tz: number, npcId: string): string {
  return `q_${docId}_t${tx}_${tz}_${npcId}`;
}

/**
 * Map a doc NPC to a full NPCDefinition at an explicit runtime id + world
 * position. Full-fidelity passthroughs (appearance/home/relationships/spice
 * traits) win over the plain editor fields — used by both the quadrant
 * streaming path and the migrated downtown cast.
 */
export function sceneNpcToDefinition(
  npc: SceneDoc['npcs'][number],
  id: string,
  position: [number, number, number],
  fallbackLocation: string,
): NPCDefinition {
  return {
    id,
    name: npc.name,
    role: npc.role,
    location: npc.location ?? fallbackLocation,
    personalityPrompt: npc.personalityPrompt,
    defaultMood: npc.defaultMood,
    interactionRadius: 8,
    conversationRadius: 3,
    position,
    appearance: npc.appearance ?? appearanceFor(npc.outfit),
    home: npc.home,
    backstory: npc.backstory,
    routine: npc.routine,
    relationships: npc.relationships,
    initialDisposition: npc.initialDisposition,
    npcRelationships: npc.npcRelationships,
    loadout: npc.loadout?.map((s) => ({ ...s })),
    dealer: npc.dealer,
    addict: npc.addict,
  };
}

/** Map a doc NPC to a full NPCDefinition at a tile placement. */
function npcDefFor(doc: SceneDoc, tx: number, tz: number, npc: SceneDoc['npcs'][number]): NPCDefinition {
  return sceneNpcToDefinition(
    npc,
    quadrantNpcId(doc.id, tx, tz, npc.id),
    tileLocalToWorld(tx, tz, npc.position),
    `${doc.name} block in the sprawl`,
  );
}

/**
 * The GeneratedTile for an authored quadrant placed at (tx,tz): local positions
 * mapped to world space, prop keys prefixed `q-<docId>-` (collision-safe across
 * docs/tiles), `urban: true` so TileScenery frames it with street + sidewalk.
 */
export function tileFromSceneDoc(doc: SceneDoc, tx: number, tz: number): GeneratedTile {
  return {
    coord: { tx, tz },
    theme: 'downtown',
    urban: true,
    ground: doc.ground ?? [0.18, 0.18, 0.21],
    props: doc.props.map((p) => ({
      key: `q-${doc.id}-${tx}-${tz}-${p.key}`,
      model: p.model,
      position: tileLocalToWorld(tx, tz, p.position),
      rotationY: p.rotationY,
      scale: p.scale,
      solid: p.solid,
      fit: p.fit,
    })),
    npcDefs: doc.npcs.map((n) => npcDefFor(doc, tx, tz, n)),
  };
}

/** The doc's door triggers lifted to world space for a tile placement. */
export function doorTriggersForTile(doc: SceneDoc, tx: number, tz: number): WorldDoorTrigger[] {
  return doc.doorTriggers.map((d: DoorTriggerDoc) => ({
    key: `q-${doc.id}-${tx}-${tz}-${d.key}`,
    position: tileLocalToWorld(tx, tz, d.position),
    size: [...d.size] as [number, number, number],
    targetSceneId: d.targetSceneId,
    spawnPoint: [...d.spawnPoint] as [number, number, number],
  }));
}

/** Default door volume around a door PROP (the prop's GLB is the visual). */
const PROP_DOOR_SIZE: [number, number, number] = [2.5, 3, 2.5];

/**
 * Door PROPS (props carrying a `targetSceneId`) lifted to world-space triggers.
 * Unlike the invisible `doorTriggers`, the prop's model is the visual, so the
 * trigger is just a default AABB centred on the prop. Keyed `qp-` to stay unique
 * against the `q-` invisible-trigger keys.
 */
export function propDoorTriggersForTile(doc: SceneDoc, tx: number, tz: number): WorldDoorTrigger[] {
  return doc.props
    .filter((p) => typeof p.targetSceneId === 'string' && p.targetSceneId.length > 0)
    .map((p) => ({
      key: `qp-${doc.id}-${tx}-${tz}-${p.key}`,
      position: tileLocalToWorld(tx, tz, p.position),
      size: [...PROP_DOOR_SIZE] as [number, number, number],
      targetSceneId: p.targetSceneId as string,
      spawnPoint: [...(p.spawnPoint ?? [0, 0, 0])] as [number, number, number],
    }));
}

/** Stable identity of a scene-seeded item placement (for collected-set persistence). */
export function seededItemKey(docId: string, tx: number, tz: number, index: number): string {
  return `${docId}:${tx},${tz}:${index}`;
}

/**
 * The doc's items as ground pickups for a tile placement, skipping the ones the
 * player already collected (`collected` carries seededItemKey entries).
 */
export function seedItemsForTile(
  doc: SceneDoc, tx: number, tz: number, collected: readonly string[] = [],
): GroundItem[] {
  const taken = new Set(collected);
  const out: GroundItem[] = [];
  doc.items.forEach((item, i) => {
    const seedKey = seededItemKey(doc.id, tx, tz, i);
    if (taken.has(seedKey)) return;
    const [x, y, z] = tileLocalToWorld(tx, tz, item.position);
    out.push({
      tile: [tx, tz],
      pos: [x, y + 0.3, z], // lifted like a dropped pile so the marker reads
      id: item.itemId,
      qty: item.qty,
      seedKey,
    });
  });
  return out;
}
