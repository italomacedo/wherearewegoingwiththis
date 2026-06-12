import {
  SCENE_DOC_VERSION, emptySceneDoc, validateSceneDoc, migrateSceneDoc, uniqueKey,
  SceneDoc,
} from '@systems/sceneeditor/SceneDoc';

function docWith(patch: Partial<SceneDoc> = {}): SceneDoc {
  return { ...emptySceneDoc('alley', 'quadrant', 'Alley'), ...patch };
}

const prop = { key: 'crate', model: 'world/rpg/crate.glb', position: [1, 0, 2] as [number, number, number] };
const item = { itemId: 'medkit', qty: 2, position: [0, 0, 0] as [number, number, number] };
const npc = {
  id: 'vendor', name: 'Rex Vale', role: 'street vendor', personalityPrompt: 'Talks fast.',
  defaultMood: 'neutral' as const, initialDisposition: 'neutral' as const,
  outfit: 'punk', position: [3, 0, 3] as [number, number, number],
};
const door = {
  key: 'door', position: [0, 0, 22] as [number, number, number],
  size: [2, 3, 1] as [number, number, number], targetSceneId: 'bar', spawnPoint: [0, 0, -5] as [number, number, number],
};

describe('SceneDoc', () => {
  test('emptySceneDoc builds a valid current-version doc', () => {
    const doc = emptySceneDoc('alley', 'interior');
    expect(doc.version).toBe(SCENE_DOC_VERSION);
    expect(doc.kind).toBe('interior');
    expect(doc.name).toBe('alley');
    expect(validateSceneDoc(doc)).toEqual(doc);
  });

  test('validates a fully-populated doc', () => {
    const doc = docWith({
      ground: [0.2, 0.2, 0.2],
      props: [prop], items: [item], npcs: [npc], doorTriggers: [door],
      colliders: [{ key: 'wall', position: [0, 2, 30], size: [30, 4, 0.5] }],
    });
    expect(validateSceneDoc(doc)).toEqual(doc);
  });

  test.each([
    ['null', null],
    ['non-object', 'x'],
    ['missing version', { ...docWith(), version: undefined }],
    ['bad id chars', docWith({ id: 'Bad Id!' })],
    ['bad kind', { ...docWith(), kind: 'dungeon' }],
    ['empty name', docWith({ name: '' })],
    ['bad ground', { ...docWith(), ground: [1, 2] }],
    ['props not array', { ...docWith(), props: 'x' }],
    ['bad prop position', docWith({ props: [{ ...prop, position: [1, NaN, 2] as [number, number, number] }] })],
    ['bad prop scale', docWith({ props: [{ ...prop, scale: 'big' as unknown as number }] })],
    ['prop missing model', docWith({ props: [{ ...prop, model: '' }] })],
    ['bad item qty', docWith({ items: [{ ...item, qty: 0 }] })],
    ['bad npc mood', docWith({ npcs: [{ ...npc, defaultMood: 'angry' as never }] })],
    ['bad npc disposition', docWith({ npcs: [{ ...npc, initialDisposition: 'mad' as never }] })],
    ['npc missing outfit', docWith({ npcs: [{ ...npc, outfit: '' }] })],
    ['bad door size', docWith({ doorTriggers: [{ ...door, size: [2, 3] as unknown as [number, number, number] }] })],
    ['duplicate prop keys', docWith({ props: [prop, { ...prop }] })],
    ['duplicate npc ids', docWith({ npcs: [npc, { ...npc }] })],
    ['duplicate door keys', docWith({ doorTriggers: [door, { ...door }] })],
    ['bad colliders type', { ...docWith(), colliders: 'x' }],
    ['bad collider entry', { ...docWith(), colliders: [{ key: 1, position: [0, 0, 0], size: [1, 1, 1] }] }],
  ])('rejects %s', (_label, raw) => {
    expect(validateSceneDoc(raw)).toBeNull();
  });

  test('accepts non-vec3 rotationY/scale variants', () => {
    const doc = docWith({
      props: [
        { ...prop, key: 'a', rotationY: 1.2, scale: 2 },
        { ...prop, key: 'b', scale: [1, 2, 1] },
      ],
    });
    expect(validateSceneDoc(doc)).not.toBeNull();
  });

  test('rejects nulls inside collections', () => {
    expect(validateSceneDoc(docWith({ props: [null as never] }))).toBeNull();
    expect(validateSceneDoc(docWith({ items: [null as never] }))).toBeNull();
    expect(validateSceneDoc(docWith({ npcs: [null as never] }))).toBeNull();
    expect(validateSceneDoc(docWith({ doorTriggers: [null as never] }))).toBeNull();
  });

  test('migrateSceneDoc is identity at current version and bumps older docs', () => {
    const doc = docWith();
    expect(migrateSceneDoc(doc)).toBe(doc);
    const old = { ...doc, version: 0 };
    const migrated = migrateSceneDoc(old);
    expect(migrated.version).toBe(SCENE_DOC_VERSION);
    expect(migrated).not.toBe(old);
  });

  test('uniqueKey suffixes across props, doors and npcs', () => {
    const doc = docWith({ props: [prop], npcs: [npc], doorTriggers: [door] });
    expect(uniqueKey(doc, 'fresh')).toBe('fresh');
    expect(uniqueKey(doc, 'crate')).toBe('crate_2');
    expect(uniqueKey(doc, 'vendor')).toBe('vendor_2');
    expect(uniqueKey(doc, 'door')).toBe('door_2');
    doc.props.push({ ...prop, key: 'crate_2' });
    expect(uniqueKey(doc, 'crate')).toBe('crate_3');
  });
});
