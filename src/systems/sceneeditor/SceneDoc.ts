/**
 * SceneDoc — the JSON document format for editor-authored scenes.
 *
 * Two kinds: 'quadrant' (a 60×60 m urban tile ringed by street+sidewalk, used
 * by the procedural mosaic as an authored tile) and 'interior' (a free 60×60
 * room reached through a door trigger placed in a quadrant).
 *
 * All positions are SCENE-LOCAL metres. Quadrant content must stay inside the
 * CityFrame sidewalk ring (|x|,|z| ≤ 22 — the interior band); interiors use the
 * full |x|,|z| ≤ 30 with the local origin at the room centre.
 *
 * Docs live as `public/scenes/<id>.json` (git-versioned, ships in the build);
 * the editor writes them through the `scene:*` IPC handlers, the game reads
 * them via SceneDocSource. Pure module — no Babylon/DOM, 100% tested.
 */
import type { NPCMood, NPCDisposition } from '@entities/NPCAgent';
import type { AttributeId } from '@entities/CharacterStats';
import type { InventoryStack } from '@entities/Inventory';
import type { ColliderBox } from '@assets/WorldAssetCatalog';
import type { CharacterAppearance } from '@entities/CharacterData';

export const SCENE_DOC_VERSION = 1;

/** Quadrant content band (CityFrame sidewalkInner); interiors use the full half-tile. */
export const QUADRANT_BAND = 22;
export const INTERIOR_BAND = 30;

export type SceneKind = 'quadrant' | 'interior';

export interface ScenePropDoc {
  key: string; // unique within the doc
  model: string; // GLB path relative to /assets/, e.g. 'world/guns/pistol.glb'
  position: [number, number, number];
  rotationY?: number;
  scale?: number | [number, number, number];
  solid?: boolean; // emits a box collider at runtime (TileScenery pattern)
  fit?: number; // optional auto-fit footprint in metres
}

export interface SceneItemDoc {
  itemId: string; // ITEM_REGISTRY id
  qty: number;
  position: [number, number, number];
}

export interface SceneNpcDoc {
  id: string; // doc-local id; runtime prefixes it per placement
  name: string;
  role: string;
  personalityPrompt: string;
  backstory?: string;
  routine?: string;
  relationships?: string;
  defaultMood: NPCMood;
  initialDisposition: NPCDisposition;
  outfit: string; // AvatarMeshCatalog outfit key (gender derives from it)
  attributes?: Partial<Record<AttributeId, number>>;
  loadout?: InventoryStack[];
  position: [number, number, number];
  rotationY?: number;
  // ── Full-fidelity passthroughs (authored casts like the migrated downtown;
  //    the editor itself only writes `outfit`). ──
  /** Custom avatar (tints etc.) — wins over the plain `outfit` look. */
  appearance?: CharacterAppearance;
  home?: string;
  location?: string;
  npcRelationships?: Record<string, NPCDisposition>;
  dealer?: boolean;
  addict?: boolean;
}

export interface DoorTriggerDoc {
  key: string;
  position: [number, number, number]; // AABB centre (local)
  size: [number, number, number]; // AABB full extents
  targetSceneId: string; // another SceneDoc id (usually an interior)
  spawnPoint: [number, number, number]; // local position in the TARGET scene
}

export interface SceneDoc {
  version: number;
  id: string; // filename stem, /^[a-z0-9_-]+$/
  kind: SceneKind;
  name: string; // display name
  ground?: [number, number, number]; // interior-plane tint
  props: ScenePropDoc[];
  items: SceneItemDoc[];
  npcs: SceneNpcDoc[];
  doorTriggers: DoorTriggerDoc[];
  /** Raw collision boxes — only the migrated downtown carries these (not editor-authored in v1). */
  colliders?: ColliderBox[];
}

export const SCENE_ID_RE = /^[a-z0-9_-]+$/;

export function emptySceneDoc(id: string, kind: SceneKind, name = id): SceneDoc {
  return {
    version: SCENE_DOC_VERSION,
    id,
    kind,
    name,
    props: [],
    items: [],
    npcs: [],
    doorTriggers: [],
  };
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function validScale(s: unknown): boolean {
  if (s === undefined) return true;
  if (typeof s === 'number') return Number.isFinite(s);
  return isVec3(s);
}

function validProp(p: unknown): p is ScenePropDoc {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return typeof o.key === 'string' && o.key.length > 0
    && typeof o.model === 'string' && o.model.length > 0
    && isVec3(o.position)
    && (o.rotationY === undefined || typeof o.rotationY === 'number')
    && validScale(o.scale);
}

function validItem(i: unknown): i is SceneItemDoc {
  if (typeof i !== 'object' || i === null) return false;
  const o = i as Record<string, unknown>;
  return typeof o.itemId === 'string' && o.itemId.length > 0
    && typeof o.qty === 'number' && o.qty >= 1
    && isVec3(o.position);
}

const MOODS: readonly string[] = ['neutral', 'friendly', 'suspicious', 'hostile', 'scared'];
const DISPOSITIONS: readonly string[] = ['hostile', 'wary', 'neutral', 'friendly'];

function validNpc(n: unknown): n is SceneNpcDoc {
  if (typeof n !== 'object' || n === null) return false;
  const o = n as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0
    && typeof o.name === 'string' && o.name.length > 0
    && typeof o.role === 'string'
    && typeof o.personalityPrompt === 'string'
    && MOODS.includes(o.defaultMood as string)
    && DISPOSITIONS.includes(o.initialDisposition as string)
    && typeof o.outfit === 'string' && o.outfit.length > 0
    && isVec3(o.position);
}

function validDoor(d: unknown): d is DoorTriggerDoc {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o.key === 'string' && o.key.length > 0
    && isVec3(o.position)
    && isVec3(o.size)
    && typeof o.targetSceneId === 'string'
    && isVec3(o.spawnPoint);
}

function uniqueKeys(keys: string[]): boolean {
  return new Set(keys).size === keys.length;
}

/**
 * Validate an unknown value into a SceneDoc, or null when malformed. Checks the
 * id regex, every entry's shape, and key uniqueness per collection. Corrupt or
 * hand-edited docs fail closed (the loader skips them).
 */
export function validateSceneDoc(raw: unknown): SceneDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== 'number') return null;
  if (typeof o.id !== 'string' || !SCENE_ID_RE.test(o.id)) return null;
  if (o.kind !== 'quadrant' && o.kind !== 'interior') return null;
  if (typeof o.name !== 'string' || o.name.length === 0) return null;
  if (o.ground !== undefined && !isVec3(o.ground)) return null;
  const props = Array.isArray(o.props) ? o.props : null;
  const items = Array.isArray(o.items) ? o.items : null;
  const npcs = Array.isArray(o.npcs) ? o.npcs : null;
  const doors = Array.isArray(o.doorTriggers) ? o.doorTriggers : null;
  if (!props || !items || !npcs || !doors) return null;
  if (!props.every(validProp) || !items.every(validItem) || !npcs.every(validNpc) || !doors.every(validDoor)) return null;
  if (!uniqueKeys(props.map((p) => (p as ScenePropDoc).key))) return null;
  if (!uniqueKeys(npcs.map((n) => (n as SceneNpcDoc).id))) return null;
  if (!uniqueKeys(doors.map((d) => (d as DoorTriggerDoc).key))) return null;
  if (o.colliders !== undefined) {
    if (!Array.isArray(o.colliders)) return null;
    const okCol = o.colliders.every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const cb = c as Record<string, unknown>;
      return typeof cb.key === 'string' && isVec3(cb.position) && isVec3(cb.size);
    });
    if (!okCol) return null;
  }
  return o as unknown as SceneDoc;
}

/** Bump older docs to the current version (identity at v1). */
export function migrateSceneDoc(doc: SceneDoc): SceneDoc {
  if (doc.version === SCENE_DOC_VERSION) return doc;
  // Future migrations switch on doc.version here.
  return { ...doc, version: SCENE_DOC_VERSION };
}

/** A key not yet used by any prop/door in the doc: base, base_2, base_3, … */
export function uniqueKey(doc: SceneDoc, base: string): string {
  const used = new Set<string>([
    ...doc.props.map((p) => p.key),
    ...doc.doorTriggers.map((d) => d.key),
    ...doc.npcs.map((n) => n.id),
  ]);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
