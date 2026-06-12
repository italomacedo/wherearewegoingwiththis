import { randomNpc, randomAttributes } from '@systems/sceneeditor/NpcRandomizer';
import { OUTFITS } from '@assets/AvatarMeshCatalog';
import { ATTRIBUTES } from '@entities/CharacterStats';
import { validateSceneDoc, emptySceneDoc } from '@systems/sceneeditor/SceneDoc';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('NpcRandomizer', () => {
  test('is deterministic for a fixed rng', () => {
    const a = randomNpc(seqRng([0.3, 0.7, 0.1, 0.9]));
    const b = randomNpc(seqRng([0.3, 0.7, 0.1, 0.9]));
    expect(a).toEqual(b);
  });

  test('rng at 0 picks the first of every pool', () => {
    const npc = randomNpc(seqRng([0]), [1, 0, 2]);
    expect(npc.name).toBe('Rex Vale');
    expect(npc.outfit).toBe(OUTFITS[0].key);
    expect(npc.role).toBe('street vendor');
    expect(npc.position).toEqual([1, 0, 2]);
    expect(npc.defaultMood).toBe('neutral');
    expect(npc.initialDisposition).toBe('neutral');
  });

  test('rng near 1 stays in bounds (last entries, attr capped at 60)', () => {
    const npc = randomNpc(seqRng([0.999999]));
    expect(OUTFITS.some((o) => o.key === npc.outfit)).toBe(true);
    for (const a of ATTRIBUTES) {
      expect(npc.attributes![a.id]).toBe(60);
    }
  });

  test('randomAttributes rolls every attribute in 10..60 steps of 5', () => {
    const attrs = randomAttributes(seqRng([0, 0.5, 0.99, 0.2]));
    for (const a of ATTRIBUTES) {
      const v = attrs[a.id];
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(60);
      expect(v % 5).toBe(0);
    }
  });

  test('output drops into a SceneDoc as a valid NPC', () => {
    const doc = emptySceneDoc('test', 'quadrant');
    doc.npcs.push({ ...randomNpc(seqRng([0.42])), id: 'npc_1' });
    expect(validateSceneDoc(doc)).not.toBeNull();
  });

  test('default position is the origin', () => {
    expect(randomNpc(seqRng([0.5])).position).toEqual([0, 0, 0]);
  });
});
