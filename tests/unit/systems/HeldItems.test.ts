import {
  attachBoneNameFor, resolveAttach, heldPropsFor, DEFAULT_ATTACH, VISIBLE_SLOTS,
} from '../../../src/systems/HeldItems';

describe('HeldItems (pure decision logic)', () => {
  it('maps slots to the Quaternius rig bones', () => {
    expect(attachBoneNameFor('main_hand')).toBe('Wrist.R');
    expect(attachBoneNameFor('back')).toBe('Chest');
  });

  it('resolveAttach uses the item override when present, else the slot default', () => {
    // knife has a measured per-item transform
    expect(resolveAttach('knife', 'main_hand').scale).toBeCloseTo(0.38, 5);
    // pipe is a model-less legacy item with no transform → slot default
    expect(resolveAttach('pipe', 'main_hand')).toEqual(DEFAULT_ATTACH.main_hand);
  });

  it('VISIBLE_SLOTS are the two body slots', () => {
    expect([...VISIBLE_SLOTS]).toEqual(['main_hand', 'back']);
  });

  it('heldPropsFor renders occupied slots that have a model', () => {
    const props = heldPropsFor({ main_hand: 'knife', back: 'backpack' });
    expect(props.map((p) => p.slot)).toEqual(['main_hand', 'back']);
    const knife = props.find((p) => p.slot === 'main_hand')!;
    expect(knife.itemId).toBe('knife');
    expect(knife.modelPath).toBe('items/knife.glb');
    expect(knife.bone).toBe('Wrist.R');
    expect(knife.attach.scale).toBeCloseTo(0.38, 5);
    const pack = props.find((p) => p.slot === 'back')!;
    expect(pack.modelPath).toBe('items/backpack.glb');
    expect(pack.bone).toBe('Chest');
  });

  it('skips empty slots and model-less items (legacy pipe/bat show nothing)', () => {
    expect(heldPropsFor({})).toEqual([]);
    expect(heldPropsFor(undefined)).toEqual([]);
    expect(heldPropsFor({ main_hand: 'pipe' })).toEqual([]); // legacy, no GLB
  });

  it('renders a cosmetic firearm in the main hand', () => {
    const props = heldPropsFor({ main_hand: 'pistol' });
    expect(props).toHaveLength(1);
    expect(props[0].modelPath).toBe('items/pistol_1.glb');
    expect(props[0].bone).toBe('Wrist.R');
  });
});
