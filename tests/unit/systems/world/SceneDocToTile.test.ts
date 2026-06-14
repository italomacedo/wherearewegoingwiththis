import {
  tileFromSceneDoc, doorTriggersForTile, propDoorTriggersForTile, seedItemsForTile, seededItemKey,
  pickQuadrantDoc, generateTileAuthored, quadrantNpcId, AUTHORED_TILE_CHANCE,
  isBedModel, sleepTriggersForTile, sleepTriggersFor, BED_SLEEP_SIZE,
} from '@systems/world/SceneDocToTile';
import { generateTile } from '@assets/world/ThemeRegistry';
import { emptySceneDoc, SceneDoc } from '@systems/sceneeditor/SceneDoc';

function quadrant(id = 'plaza'): SceneDoc {
  const doc = emptySceneDoc(id, 'quadrant', 'Plaza');
  doc.ground = [0.2, 0.21, 0.22];
  doc.props.push(
    { key: 'crate', model: 'world/rpg/crate.glb', position: [2, 0, -3], rotationY: 1.1, scale: 2, solid: true },
    { key: 'sign', model: 'world/downtown/sign.glb', position: [-5, 0, 5], solid: false, fit: 1.5 },
  );
  doc.items.push(
    { itemId: 'medkit', qty: 1, position: [1, 0, 1] },
    { itemId: 'credstick', qty: 5, position: [-1, 0, -1] },
  );
  doc.npcs.push({
    id: 'vendor', name: 'Rex Vale', role: 'street vendor', personalityPrompt: 'Talks fast.',
    backstory: 'Lost a job.', routine: 'Opens at dawn.', defaultMood: 'neutral',
    initialDisposition: 'friendly', outfit: 'punk', position: [4, 0, 4],
    loadout: [{ id: 'pipe', qty: 1 }],
  });
  doc.doorTriggers.push({
    key: 'bar_door', position: [0, 0, 20], size: [2, 3, 1],
    targetSceneId: 'bar', spawnPoint: [0, 0, -8],
  });
  return doc;
}

describe('tileFromSceneDoc', () => {
  test('maps local positions to world space at the tile centre', () => {
    const tile = tileFromSceneDoc(quadrant(), 3, 5);
    expect(tile.coord).toEqual({ tx: 3, tz: 5 });
    expect(tile.urban).toBe(true);
    expect(tile.ground).toEqual([0.2, 0.21, 0.22]);
    expect(tile.props[0].position).toEqual([3 * 60 + 2, 0, 5 * 60 - 3]);
    expect(tile.props[0]).toMatchObject({ rotationY: 1.1, scale: 2, solid: true });
    expect(tile.props[1]).toMatchObject({ solid: false, fit: 1.5 });
  });

  test('prefixes prop keys and NPC ids per doc + tile (no cross-tile collision)', () => {
    const doc = quadrant();
    const a = tileFromSceneDoc(doc, 1, 1);
    const b = tileFromSceneDoc(doc, 2, 1);
    expect(a.props[0].key).toBe('q-plaza-1-1-crate');
    expect(b.props[0].key).toBe('q-plaza-2-1-crate');
    expect(a.npcDefs[0].id).toBe(quadrantNpcId('plaza', 1, 1, 'vendor'));
    expect(a.npcDefs[0].id).not.toBe(b.npcDefs[0].id);
  });

  test('builds full NPCDefinitions (appearance from outfit, cloned loadout)', () => {
    const doc = quadrant();
    const tile = tileFromSceneDoc(doc, 0, 1);
    const def = tile.npcDefs[0];
    expect(def.name).toBe('Rex Vale');
    expect(def.appearance?.bodyBase).toBe('punk');
    expect(def.position).toEqual([4, 0, 64]);
    expect(def.initialDisposition).toBe('friendly');
    expect(def.loadout).toEqual([{ id: 'pipe', qty: 1 }]);
    expect(def.loadout).not.toBe(doc.npcs[0].loadout);
    expect(def.interactionRadius).toBe(8);
  });

  test('defaults the ground tint when the doc has none', () => {
    const doc = quadrant();
    delete doc.ground;
    expect(tileFromSceneDoc(doc, 1, 1).ground).toEqual([0.18, 0.18, 0.21]);
  });
});

describe('doorTriggersForTile', () => {
  test('lifts triggers to world space, keeps target + LOCAL spawn point', () => {
    const [door] = doorTriggersForTile(quadrant(), 2, 2);
    expect(door.key).toBe('q-plaza-2-2-bar_door');
    expect(door.position).toEqual([120, 0, 140]);
    expect(door.size).toEqual([2, 3, 1]);
    expect(door.targetSceneId).toBe('bar');
    expect(door.spawnPoint).toEqual([0, 0, -8]);
  });
});

describe('propDoorTriggersForTile', () => {
  test('lifts only props carrying a targetSceneId, with a default volume', () => {
    const doc = quadrant();
    doc.props.push({
      key: 'front_door', model: 'world/downtown/door_1.glb', position: [4, 0, -3],
      targetSceneId: 'myhouse', spawnPoint: [0, 0, 27],
    });
    const triggers = propDoorTriggersForTile(doc, 1, 0);
    expect(triggers).toHaveLength(1); // the crate/sign props are NOT doors
    expect(triggers[0].key).toBe('qp-plaza-1-0-front_door');
    expect(triggers[0].position).toEqual([64, 0, -3]);
    expect(triggers[0].size).toEqual([2.5, 3, 2.5]);
    expect(triggers[0].targetSceneId).toBe('myhouse');
    expect(triggers[0].spawnPoint).toEqual([0, 0, 27]);
  });

  test('defaults a missing spawn point to the origin', () => {
    const doc = quadrant();
    doc.props.push({ key: 'd', model: 'world/scifi/door_single.glb', position: [0, 0, 0], targetSceneId: 'lab' });
    expect(propDoorTriggersForTile(doc, 0, 0)[0].spawnPoint).toEqual([0, 0, 0]);
  });
});

describe('seedItemsForTile', () => {
  test('emits world-positioned pickups with stable seed keys', () => {
    const items = seedItemsForTile(quadrant(), 1, 2);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      tile: [1, 2], pos: [61, 0.3, 121], id: 'medkit', qty: 1,
      seedKey: seededItemKey('plaza', 1, 2, 0),
    });
  });

  test('skips collected placements (same doc on another tile unaffected)', () => {
    const collected = [seededItemKey('plaza', 1, 2, 0)];
    expect(seedItemsForTile(quadrant(), 1, 2, collected).map((g) => g.id)).toEqual(['credstick']);
    expect(seedItemsForTile(quadrant(), 3, 2, collected)).toHaveLength(2);
  });
});

describe('bed sleep triggers', () => {
  function withBeds(): SceneDoc {
    const doc = quadrant('inn');
    doc.props.push(
      { key: 'b1', model: 'world/interior/bed_single.glb', position: [2, 0, 3], solid: true },
      { key: 'b2', model: 'world/interior/BED_king.glb', position: [-4, 0, -1], solid: true },
    );
    return doc;
  }

  test('isBedModel detects bed GLBs (case-insensitive), ignores others', () => {
    expect(isBedModel('world/interior/bed_single.glb')).toBe(true);
    expect(isBedModel('world/interior/BED_king.glb')).toBe(true);
    expect(isBedModel('world/rpg/crate.glb')).toBe(false);
  });

  test('sleepTriggersForTile lifts only bed props to world space', () => {
    const triggers = sleepTriggersForTile(withBeds(), 1, 2);
    expect(triggers).toHaveLength(2); // crate/sign/door props are not beds
    expect(triggers[0].key).toBe('qbed-inn-1-2-b1');
    expect(triggers[0].position).toEqual([60 + 2, 0, 120 + 3]);
    expect(triggers[0].size).toEqual(BED_SLEEP_SIZE);
    expect(triggers[1].key).toBe('qbed-inn-1-2-b2');
  });

  test('sleepTriggersFor uses the injected world mapper + key prefix', () => {
    const triggers = sleepTriggersFor(withBeds(), 'int-inn', (l) => [l[0] - 5000, l[1], l[2] - 5000]);
    expect(triggers[0].key).toBe('int-inn-b1');
    expect(triggers[0].position).toEqual([-4998, 0, -4997]);
  });

  test('no beds → empty list', () => {
    expect(sleepTriggersForTile(quadrant(), 0, 0)).toEqual([]);
  });
});

describe('pickQuadrantDoc / generateTileAuthored', () => {
  const docs = [quadrant('alpha'), quadrant('beta'), quadrant('gamma')];

  test('is deterministic and never picks for tile (0,0) or empty docs', () => {
    expect(pickQuadrantDoc([], 5, 5, 42)).toBeNull();
    expect(pickQuadrantDoc(docs, 0, 0, 42)).toBeNull();
    for (let tx = 1; tx < 6; tx++) {
      expect(pickQuadrantDoc(docs, tx, 3, 42)).toBe(pickQuadrantDoc(docs, tx, 3, 42));
    }
  });

  test('roughly AUTHORED_TILE_CHANCE of tiles roll authored', () => {
    let hits = 0;
    const total = 23 * 23;
    for (let tx = 1; tx <= 23; tx++) {
      for (let tz = 1; tz <= 23; tz++) {
        if (pickQuadrantDoc(docs, tx, tz, 7)) hits++;
      }
    }
    expect(hits / total).toBeGreaterThan(AUTHORED_TILE_CHANCE - 0.12);
    expect(hits / total).toBeLessThan(AUTHORED_TILE_CHANCE + 0.12);
  });

  test('non-authored tiles are BIT-IDENTICAL to the pure procedural output', () => {
    let checked = 0;
    for (let tx = 1; tx <= 8 && checked < 5; tx++) {
      if (pickQuadrantDoc(docs, tx, 4, 99) === null) {
        const { tile, doc } = generateTileAuthored(tx, 4, 99, docs);
        expect(doc).toBeNull();
        expect(tile).toEqual(generateTile(tx, 4, 99));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('authored tiles come from the picked doc', () => {
    let found = false;
    for (let tx = 1; tx <= 23 && !found; tx++) {
      const picked = pickQuadrantDoc(docs, tx, 9, 5);
      if (picked) {
        const { tile, doc } = generateTileAuthored(tx, 9, 5, docs);
        expect(doc).toBe(picked);
        expect(tile.props[0].key.startsWith(`q-${picked.id}-`)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  test('no quadrant docs → plain procedural passthrough', () => {
    const { tile, doc } = generateTileAuthored(2, 2, 11, []);
    expect(doc).toBeNull();
    expect(tile).toEqual(generateTile(2, 2, 11));
  });
});
