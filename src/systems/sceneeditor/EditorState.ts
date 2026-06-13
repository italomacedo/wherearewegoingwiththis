/**
 * EditorState — the Scene Editor's entire logical state, pure and headless.
 *
 * The Babylon layer (SceneEditorScene/EditorPanels) is a dumb renderer of
 * `doc` that forwards gizmo drags into setTransform and gallery clicks into
 * the add* methods. Every mutation here is unit-tested without a GPU.
 */
import {
  SceneDoc, SceneKind, ScenePropDoc, SceneItemDoc, SceneNpcDoc, DoorTriggerDoc,
  emptySceneDoc, uniqueKey,
} from './SceneDoc';

export type EditorTab = 'models' | 'items' | 'npcs';

export type Selection =
  | { kind: 'prop'; key: string }
  | { kind: 'item'; index: number }
  | { kind: 'npc'; id: string }
  | { kind: 'door'; key: string }
  | null;

export interface TransformPatch {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number | [number, number, number];
}

const DEFAULT_DOOR_SIZE: [number, number, number] = [2, 3, 1];

export class EditorState {
  doc: SceneDoc = emptySceneDoc('untitled', 'quadrant');
  dirty = false;
  tab: EditorTab = 'models';
  selection: Selection = null;

  newDoc(id: string, kind: SceneKind): void {
    this.doc = emptySceneDoc(id, kind);
    this.dirty = false;
    this.selection = null;
  }

  loadDoc(doc: SceneDoc): void {
    this.doc = doc;
    this.dirty = false;
    this.selection = null;
  }

  setMeta(patch: { id?: string; name?: string }): void {
    if (patch.id !== undefined) this.doc.id = patch.id;
    if (patch.name !== undefined) this.doc.name = patch.name;
    this.dirty = true;
  }

  setGround(tint: [number, number, number] | undefined): void {
    this.doc.ground = tint;
    this.dirty = true;
  }

  // ─── Adders (return the new selection key) ─────────────────────────────────

  addProp(model: string, at: [number, number, number]): string {
    const stem = (model.split('/').pop() ?? model).replace(/\.glb$/i, '');
    const key = uniqueKey(this.doc, stem);
    const prop: ScenePropDoc = { key, model, position: at, solid: true };
    this.doc.props.push(prop);
    this.selection = { kind: 'prop', key };
    this.dirty = true;
    return key;
  }

  addItem(itemId: string, at: [number, number, number], qty = 1): number {
    const item: SceneItemDoc = { itemId, qty, position: at };
    this.doc.items.push(item);
    const index = this.doc.items.length - 1;
    this.selection = { kind: 'item', index };
    this.dirty = true;
    return index;
  }

  addNpc(npc: Omit<SceneNpcDoc, 'id'> & { id?: string }): string {
    const id = uniqueKey(this.doc, npc.id ?? 'npc');
    this.doc.npcs.push({ ...npc, id });
    this.selection = { kind: 'npc', id };
    this.dirty = true;
    return id;
  }

  addDoor(at: [number, number, number]): string {
    const key = uniqueKey(this.doc, 'door');
    const door: DoorTriggerDoc = {
      key, position: at, size: [...DEFAULT_DOOR_SIZE],
      targetSceneId: '', spawnPoint: [0, 0, 0],
    };
    this.doc.doorTriggers.push(door);
    this.selection = { kind: 'door', key };
    this.dirty = true;
    return key;
  }

  // ─── Selection / lookup ────────────────────────────────────────────────────

  select(sel: Selection): void {
    this.selection = sel;
  }

  selectedProp(): ScenePropDoc | null {
    if (this.selection?.kind !== 'prop') return null;
    const key = this.selection.key;
    return this.doc.props.find((p) => p.key === key) ?? null;
  }

  selectedItem(): SceneItemDoc | null {
    if (this.selection?.kind !== 'item') return null;
    return this.doc.items[this.selection.index] ?? null;
  }

  selectedNpc(): SceneNpcDoc | null {
    if (this.selection?.kind !== 'npc') return null;
    const id = this.selection.id;
    return this.doc.npcs.find((n) => n.id === id) ?? null;
  }

  selectedDoor(): DoorTriggerDoc | null {
    if (this.selection?.kind !== 'door') return null;
    const key = this.selection.key;
    return this.doc.doorTriggers.find((d) => d.key === key) ?? null;
  }

  /** The selected entry's position/rotation/scale (uniform view), if any. */
  selectedTransform(): { position: [number, number, number]; rotationY: number; scale: number | [number, number, number] } | null {
    const p = this.selectedProp();
    if (p) return { position: p.position, rotationY: p.rotationY ?? 0, scale: p.scale ?? 1 };
    const i = this.selectedItem();
    if (i) return { position: i.position, rotationY: 0, scale: 1 };
    const n = this.selectedNpc();
    if (n) return { position: n.position, rotationY: n.rotationY ?? 0, scale: 1 };
    const d = this.selectedDoor();
    if (d) return { position: d.position, rotationY: 0, scale: 1 };
    return null;
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  deleteSelected(): boolean {
    const sel = this.selection;
    if (!sel) return false;
    if (sel.kind === 'prop') {
      this.doc.props = this.doc.props.filter((p) => p.key !== sel.key);
    } else if (sel.kind === 'item') {
      this.doc.items.splice(sel.index, 1);
    } else if (sel.kind === 'npc') {
      this.doc.npcs = this.doc.npcs.filter((n) => n.id !== sel.id);
    } else {
      this.doc.doorTriggers = this.doc.doorTriggers.filter((d) => d.key !== sel.key);
    }
    this.selection = null;
    this.dirty = true;
    return true;
  }

  duplicateSelected(offset: [number, number, number] = [1.5, 0, 1.5]): boolean {
    const move = (p: [number, number, number]): [number, number, number] =>
      [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
    const prop = this.selectedProp();
    if (prop) {
      const key = uniqueKey(this.doc, prop.key);
      this.doc.props.push({ ...prop, key, position: move(prop.position) });
      this.selection = { kind: 'prop', key };
      this.dirty = true;
      return true;
    }
    const item = this.selectedItem();
    if (item) {
      this.doc.items.push({ ...item, position: move(item.position) });
      this.selection = { kind: 'item', index: this.doc.items.length - 1 };
      this.dirty = true;
      return true;
    }
    const npc = this.selectedNpc();
    if (npc) {
      const id = uniqueKey(this.doc, npc.id);
      this.doc.npcs.push({ ...npc, id, name: npc.name, position: move(npc.position) });
      this.selection = { kind: 'npc', id };
      this.dirty = true;
      return true;
    }
    const door = this.selectedDoor();
    if (door) {
      const key = uniqueKey(this.doc, door.key);
      this.doc.doorTriggers.push({ ...door, key, position: move(door.position) });
      this.selection = { kind: 'door', key };
      this.dirty = true;
      return true;
    }
    return false;
  }

  /** Gizmo/properties write-back for the selected entry. */
  setTransform(patch: TransformPatch): boolean {
    const prop = this.selectedProp();
    if (prop) {
      if (patch.position) prop.position = patch.position;
      if (patch.rotationY !== undefined) prop.rotationY = patch.rotationY;
      if (patch.scale !== undefined) prop.scale = patch.scale;
      this.dirty = true;
      return true;
    }
    const item = this.selectedItem();
    if (item) {
      if (patch.position) item.position = patch.position;
      this.dirty = true;
      return true;
    }
    const npc = this.selectedNpc();
    if (npc) {
      if (patch.position) npc.position = patch.position;
      if (patch.rotationY !== undefined) npc.rotationY = patch.rotationY;
      this.dirty = true;
      return true;
    }
    const door = this.selectedDoor();
    if (door) {
      if (patch.position) door.position = patch.position;
      this.dirty = true;
      return true;
    }
    return false;
  }

  setPropSolid(solid: boolean): boolean {
    const prop = this.selectedProp();
    if (!prop) return false;
    prop.solid = solid;
    this.dirty = true;
    return true;
  }

  /** Turn the selected prop into a door (or clear it). Empty target drops the
   *  door fields; a target keeps/creates a spawn point in the target scene. */
  setPropDoor(targetSceneId: string, spawnPoint?: [number, number, number]): boolean {
    const prop = this.selectedProp();
    if (!prop) return false;
    if (!targetSceneId) {
      delete prop.targetSceneId;
      delete prop.spawnPoint;
    } else {
      prop.targetSceneId = targetSceneId;
      prop.spawnPoint = spawnPoint ?? prop.spawnPoint ?? [0, 0, 0];
    }
    this.dirty = true;
    return true;
  }

  setNpcField(patch: Partial<Omit<SceneNpcDoc, 'id' | 'position'>>): boolean {
    const npc = this.selectedNpc();
    if (!npc) return false;
    Object.assign(npc, patch);
    this.dirty = true;
    return true;
  }

  setDoorTarget(targetSceneId: string, spawnPoint?: [number, number, number]): boolean {
    const door = this.selectedDoor();
    if (!door) return false;
    door.targetSceneId = targetSceneId;
    if (spawnPoint) door.spawnPoint = spawnPoint;
    this.dirty = true;
    return true;
  }

  setDoorSize(size: [number, number, number]): boolean {
    const door = this.selectedDoor();
    if (!door) return false;
    door.size = size;
    this.dirty = true;
    return true;
  }

  /** Snapshot for persistence (the doc is already the canonical shape). */
  toJSON(): SceneDoc {
    return JSON.parse(JSON.stringify(this.doc)) as SceneDoc;
  }

  markSaved(): void {
    this.dirty = false;
  }
}
