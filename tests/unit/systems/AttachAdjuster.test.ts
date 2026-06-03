import {
  AttachAdjuster, ATTACH_FIELDS, POS_STEP, ROT_STEP, SCALE_STEP, MIN_SCALE,
} from '../../../src/systems/AttachAdjuster';
import type { ItemAttach } from '../../../src/entities/items/ItemCatalog';

const base = (): ItemAttach => ({ pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 });

describe('AttachAdjuster', () => {
  it('starts on the first field and exposes the item id', () => {
    const a = new AttachAdjuster('knife', base(), ['Wrist.R', 'Chest']);
    expect(a.itemId).toBe('knife');
    expect(a.field()).toBe(ATTACH_FIELDS[0]);
  });

  it('cycleField wraps both directions', () => {
    const a = new AttachAdjuster('knife', base());
    a.cycleField(-1);
    expect(a.field()).toBe(ATTACH_FIELDS[ATTACH_FIELDS.length - 1]);
    a.cycleField(1);
    expect(a.field()).toBe(ATTACH_FIELDS[0]);
  });

  it('nudges each field by its step', () => {
    const a = new AttachAdjuster('knife', base());
    a.nudge(1); // posX +
    expect(a.value().pos[0]).toBeCloseTo(POS_STEP, 6);
    a.cycleField(1); a.cycleField(1); // → posZ
    a.nudge(-1);
    expect(a.value().pos[2]).toBeCloseTo(-POS_STEP, 6);
    // jump to rotY
    const r = new AttachAdjuster('knife', base());
    r.cycleField(1); r.cycleField(1); r.cycleField(1); r.cycleField(1); // rotY (index 4)
    expect(r.field()).toBe('rotY');
    r.nudge(1);
    expect(r.value().rot[1]).toBeCloseTo(ROT_STEP, 6);
  });

  it('nudges every field component (full switch coverage)', () => {
    const a = new AttachAdjuster('knife', base());
    const expectByField: Record<string, () => number> = {
      posX: () => a.value().pos[0], posY: () => a.value().pos[1], posZ: () => a.value().pos[2],
      rotX: () => a.value().rot[0], rotY: () => a.value().rot[1], rotZ: () => a.value().rot[2],
      scale: () => a.value().scale,
    };
    for (let i = 0; i < ATTACH_FIELDS.length; i++) {
      const field = a.field();
      const before = expectByField[field]();
      a.nudge(1);
      expect(expectByField[field]()).not.toBe(before);
      a.cycleField(1);
    }
  });

  it('scale nudges and clamps at the minimum', () => {
    const a = new AttachAdjuster('knife', { ...base(), scale: MIN_SCALE });
    // move selection to scale (last field)
    a.cycleField(-1);
    expect(a.field()).toBe('scale');
    a.nudge(-1); // would go below min
    expect(a.value().scale).toBe(MIN_SCALE);
    a.nudge(1);
    expect(a.value().scale).toBeCloseTo(MIN_SCALE + SCALE_STEP, 6);
  });

  it('cycles the attach bone (wraps) and is a no-op with no bones', () => {
    const a = new AttachAdjuster('knife', base(), ['Wrist.R', 'LowerArm.R', 'Chest']);
    expect(a.bone()).toBe('Wrist.R'); // defaults to first
    a.cycleBone(1);
    expect(a.bone()).toBe('LowerArm.R');
    a.cycleBone(-1); a.cycleBone(-1);
    expect(a.bone()).toBe('Chest'); // wrapped past 0
    const none = new AttachAdjuster('knife', base(), []);
    none.cycleBone(1);
    expect(none.bone()).toBeUndefined();
  });

  it('seeds the bone index from the base bone when present', () => {
    const a = new AttachAdjuster('knife', { ...base(), bone: 'Chest' }, ['Wrist.R', 'Chest']);
    expect(a.bone()).toBe('Chest');
    a.cycleBone(1); // wraps to Wrist.R
    expect(a.bone()).toBe('Wrist.R');
  });

  it('value() returns an independent clone', () => {
    const a = new AttachAdjuster('knife', base());
    const v = a.value();
    v.pos[0] = 99;
    expect(a.value().pos[0]).toBe(0);
  });

  it('summary mentions the selected field and bone', () => {
    const a = new AttachAdjuster('knife', { ...base(), bone: 'Wrist.R' }, ['Wrist.R']);
    const s = a.summary();
    expect(s).toContain('scale');
    expect(s).toContain('Wrist.R');
    expect(s).toContain('posX');
  });
});
