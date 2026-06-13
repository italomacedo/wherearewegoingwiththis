import { EditorState } from '@systems/sceneeditor/EditorState';
import { SceneDoc, emptySceneDoc } from '@systems/sceneeditor/SceneDoc';

function fullNpc(state: EditorState): string {
  return state.addNpc({
    name: 'Nyx Mori', role: 'courier', personalityPrompt: 'Restless.',
    defaultMood: 'neutral', initialDisposition: 'neutral',
    outfit: 'punk', position: [2, 0, 2],
  });
}

describe('EditorState', () => {
  let s: EditorState;

  beforeEach(() => {
    s = new EditorState();
    s.newDoc('test', 'quadrant');
  });

  test('newDoc resets doc, dirty and selection', () => {
    s.addProp('world/rpg/crate.glb', [0, 0, 0]);
    s.newDoc('other', 'interior');
    expect(s.doc.id).toBe('other');
    expect(s.doc.kind).toBe('interior');
    expect(s.doc.props).toHaveLength(0);
    expect(s.dirty).toBe(false);
    expect(s.selection).toBeNull();
  });

  test('loadDoc adopts an external doc clean', () => {
    const doc: SceneDoc = { ...emptySceneDoc('bar', 'interior'), name: 'The Bar' };
    s.loadDoc(doc);
    expect(s.doc).toBe(doc);
    expect(s.dirty).toBe(false);
  });

  test('setMeta updates id/name and marks dirty', () => {
    s.setMeta({ id: 'alley', name: 'Alley' });
    expect(s.doc.id).toBe('alley');
    expect(s.doc.name).toBe('Alley');
    expect(s.dirty).toBe(true);
    s.setMeta({});
    expect(s.doc.id).toBe('alley');
  });

  test('setGround sets and clears the tint', () => {
    s.setGround([0.1, 0.2, 0.3]);
    expect(s.doc.ground).toEqual([0.1, 0.2, 0.3]);
    s.setGround(undefined);
    expect(s.doc.ground).toBeUndefined();
  });

  test('addProp derives a unique key from the model stem and selects it', () => {
    const k1 = s.addProp('world/rpg/crate.glb', [1, 0, 1]);
    const k2 = s.addProp('world/rpg/crate.glb', [2, 0, 2]);
    expect(k1).toBe('crate');
    expect(k2).toBe('crate_2');
    expect(s.selection).toEqual({ kind: 'prop', key: 'crate_2' });
    expect(s.doc.props[0].solid).toBe(true);
    expect(s.dirty).toBe(true);
  });

  test('addItem / addNpc / addDoor select what they create', () => {
    const idx = s.addItem('medkit', [0, 0, 0], 3);
    expect(idx).toBe(0);
    expect(s.selection).toEqual({ kind: 'item', index: 0 });
    expect(s.doc.items[0].qty).toBe(3);
    const id = fullNpc(s);
    expect(s.selection).toEqual({ kind: 'npc', id });
    const key = s.addDoor([0, 0, 22]);
    expect(s.selection).toEqual({ kind: 'door', key });
    expect(s.doc.doorTriggers[0].targetSceneId).toBe('');
  });

  test('addItem defaults qty to 1', () => {
    s.addItem('scrap', [0, 0, 0]);
    expect(s.doc.items[0].qty).toBe(1);
  });

  test('selected* return null when the selection is another kind or missing', () => {
    expect(s.selectedProp()).toBeNull();
    expect(s.selectedItem()).toBeNull();
    expect(s.selectedNpc()).toBeNull();
    expect(s.selectedDoor()).toBeNull();
    expect(s.selectedTransform()).toBeNull();
    s.addProp('world/x/a.glb', [0, 0, 0]);
    expect(s.selectedItem()).toBeNull();
    s.select({ kind: 'prop', key: 'ghost' });
    expect(s.selectedProp()).toBeNull();
    s.select({ kind: 'item', index: 9 });
    expect(s.selectedItem()).toBeNull();
    s.select({ kind: 'npc', id: 'ghost' });
    expect(s.selectedNpc()).toBeNull();
    s.select({ kind: 'door', key: 'ghost' });
    expect(s.selectedDoor()).toBeNull();
  });

  test('selectedTransform reflects each kind', () => {
    s.addProp('world/x/a.glb', [1, 0, 1]);
    expect(s.selectedTransform()).toEqual({ position: [1, 0, 1], rotationY: 0, scale: 1 });
    s.addItem('medkit', [2, 0, 2]);
    expect(s.selectedTransform()).toEqual({ position: [2, 0, 2], rotationY: 0, scale: 1 });
    fullNpc(s);
    expect(s.selectedTransform()!.position).toEqual([2, 0, 2]);
    s.addDoor([3, 0, 3]);
    expect(s.selectedTransform()!.position).toEqual([3, 0, 3]);
  });

  test('deleteSelected removes each kind and clears selection', () => {
    expect(s.deleteSelected()).toBe(false);
    s.addProp('world/x/a.glb', [0, 0, 0]);
    expect(s.deleteSelected()).toBe(true);
    expect(s.doc.props).toHaveLength(0);
    expect(s.selection).toBeNull();
    s.addItem('medkit', [0, 0, 0]);
    expect(s.deleteSelected()).toBe(true);
    expect(s.doc.items).toHaveLength(0);
    fullNpc(s);
    expect(s.deleteSelected()).toBe(true);
    expect(s.doc.npcs).toHaveLength(0);
    s.addDoor([0, 0, 0]);
    expect(s.deleteSelected()).toBe(true);
    expect(s.doc.doorTriggers).toHaveLength(0);
  });

  test('duplicateSelected clones each kind with offset + fresh key', () => {
    expect(s.duplicateSelected()).toBe(false);
    s.addProp('world/x/a.glb', [1, 0, 1]);
    expect(s.duplicateSelected()).toBe(true);
    expect(s.doc.props).toHaveLength(2);
    expect(s.doc.props[1].key).toBe('a_2');
    expect(s.doc.props[1].position).toEqual([2.5, 0, 2.5]);
    s.addItem('medkit', [0, 0, 0]);
    expect(s.duplicateSelected([1, 0, 0])).toBe(true);
    expect(s.doc.items[1].position).toEqual([1, 0, 0]);
    fullNpc(s);
    expect(s.duplicateSelected()).toBe(true);
    expect(s.doc.npcs).toHaveLength(2);
    expect(s.doc.npcs[1].id).not.toBe(s.doc.npcs[0].id);
    s.addDoor([0, 0, 0]);
    expect(s.duplicateSelected()).toBe(true);
    expect(s.doc.doorTriggers).toHaveLength(2);
  });

  test('duplicate with a stale selection returns false', () => {
    s.select({ kind: 'prop', key: 'ghost' });
    expect(s.duplicateSelected()).toBe(false);
  });

  test('setTransform writes the right fields per kind', () => {
    expect(s.setTransform({ position: [1, 1, 1] })).toBe(false);
    s.addProp('world/x/a.glb', [0, 0, 0]);
    s.setTransform({ position: [5, 0, 5], rotationY: 1.5, scale: 2 });
    expect(s.doc.props[0]).toMatchObject({ position: [5, 0, 5], rotationY: 1.5, scale: 2 });
    s.setTransform({ scale: [1, 2, 3] });
    expect(s.doc.props[0].scale).toEqual([1, 2, 3]);
    s.addItem('medkit', [0, 0, 0]);
    s.setTransform({ position: [9, 0, 9], rotationY: 2 });
    expect(s.doc.items[0].position).toEqual([9, 0, 9]);
    fullNpc(s);
    s.setTransform({ position: [4, 0, 4], rotationY: 0.5 });
    expect(s.doc.npcs[0]).toMatchObject({ position: [4, 0, 4], rotationY: 0.5 });
    s.addDoor([0, 0, 0]);
    s.setTransform({ position: [7, 0, 7] });
    expect(s.doc.doorTriggers[0].position).toEqual([7, 0, 7]);
  });

  test('setTransform with no fields still reports the hit kind', () => {
    s.addProp('world/x/a.glb', [0, 0, 0]);
    expect(s.setTransform({})).toBe(true);
    expect(s.doc.props[0].position).toEqual([0, 0, 0]);
  });

  test('setPropSolid toggles only on a prop selection', () => {
    expect(s.setPropSolid(false)).toBe(false);
    s.addProp('world/x/a.glb', [0, 0, 0]);
    expect(s.setPropSolid(false)).toBe(true);
    expect(s.doc.props[0].solid).toBe(false);
  });

  test('setPropDoor turns the selected prop into a door and clears it', () => {
    expect(s.setPropDoor('bar')).toBe(false); // no prop selected
    s.addProp('world/downtown/door_1.glb', [0, 0, 0]);
    expect(s.setPropDoor('bar')).toBe(true);
    expect(s.doc.props[0].targetSceneId).toBe('bar');
    expect(s.doc.props[0].spawnPoint).toEqual([0, 0, 0]); // default spawn
    expect(s.setPropDoor('bar', [1, 0, -2])).toBe(true);
    expect(s.doc.props[0].spawnPoint).toEqual([1, 0, -2]);
    // empty target drops the door fields
    expect(s.setPropDoor('')).toBe(true);
    expect(s.doc.props[0].targetSceneId).toBeUndefined();
    expect(s.doc.props[0].spawnPoint).toBeUndefined();
  });

  test('setNpcField patches the selected NPC', () => {
    expect(s.setNpcField({ name: 'X' })).toBe(false);
    fullNpc(s);
    expect(s.setNpcField({ name: 'Vera Klein', outfit: 'w_punk' })).toBe(true);
    expect(s.doc.npcs[0].name).toBe('Vera Klein');
    expect(s.doc.npcs[0].outfit).toBe('w_punk');
  });

  test('setDoorTarget / setDoorSize patch the selected door', () => {
    expect(s.setDoorTarget('bar')).toBe(false);
    expect(s.setDoorSize([1, 1, 1])).toBe(false);
    s.addDoor([0, 0, 0]);
    expect(s.setDoorTarget('bar', [1, 0, -2])).toBe(true);
    expect(s.doc.doorTriggers[0].targetSceneId).toBe('bar');
    expect(s.doc.doorTriggers[0].spawnPoint).toEqual([1, 0, -2]);
    expect(s.setDoorTarget('club')).toBe(true);
    expect(s.doc.doorTriggers[0].spawnPoint).toEqual([1, 0, -2]);
    expect(s.setDoorSize([4, 3, 2])).toBe(true);
    expect(s.doc.doorTriggers[0].size).toEqual([4, 3, 2]);
  });

  test('toJSON returns a deep clone; markSaved clears dirty', () => {
    s.addProp('world/x/a.glb', [0, 0, 0]);
    const json = s.toJSON();
    expect(json).toEqual(s.doc);
    expect(json).not.toBe(s.doc);
    json.props[0].position[0] = 99;
    expect(s.doc.props[0].position[0]).toBe(0);
    s.markSaved();
    expect(s.dirty).toBe(false);
  });
});
