import { AdjustOverlay } from '../../../src/systems/AdjustOverlay';
import type { Scene } from '@babylonjs/core';
import type { ItemAttach, EquipSlot } from '../../../src/entities/items/ItemCatalog';

const scene = {} as unknown as Scene;
const base = (): ItemAttach => ({ pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, bone: 'Wrist.R' });

describe('AdjustOverlay (pure state + handlers)', () => {
  it('opens and closes, tracking the slot', () => {
    const o = new AdjustOverlay(scene);
    expect(o.isOpen()).toBe(false);
    o.open('knife', 'main_hand', base(), ['Wrist.R', 'Chest']);
    expect(o.isOpen()).toBe(true);
    expect(o.getSlot()).toBe('main_hand');
    expect(o.getAdjuster()?.itemId).toBe('knife');
    o.close();
    expect(o.isOpen()).toBe(false);
    expect(o.getAdjuster()).toBeNull();
  });

  it('fires onApply on open and on every nudge / bone cycle', () => {
    const applied: Array<{ slot: EquipSlot; attach: ItemAttach }> = [];
    const o = new AdjustOverlay(scene);
    o.setHandlers({ onApply: (slot, attach) => applied.push({ slot, attach }) });
    o.open('knife', 'main_hand', base(), ['Wrist.R', 'Chest']);
    expect(applied).toHaveLength(1); // preview on open
    o.nudge(1);
    expect(applied).toHaveLength(2);
    expect(applied[1].attach.pos[0]).toBeGreaterThan(0);
    o.cycleBone(1);
    expect(applied).toHaveLength(3);
    expect(applied[2].attach.bone).toBe('Chest');
  });

  it('cycleField does not fire onApply (no transform change)', () => {
    let applies = 0;
    const o = new AdjustOverlay(scene);
    o.setHandlers({ onApply: () => { applies += 1; } });
    o.open('knife', 'main_hand', base(), []);
    applies = 0; // ignore the open preview
    o.cycleField(1);
    expect(applies).toBe(0);
  });

  it('save fires onSave with the working transform', () => {
    let saved: { id: string; slot: EquipSlot; attach: ItemAttach } | null = null;
    const o = new AdjustOverlay(scene);
    o.setHandlers({ onSave: (id, slot, attach) => { saved = { id, slot, attach }; } });
    o.open('knife', 'main_hand', base(), []);
    o.nudge(1);
    o.save();
    expect(saved!.id).toBe('knife');
    expect(saved!.slot).toBe('main_hand');
    expect(saved!.attach.pos[0]).toBeGreaterThan(0);
  });

  it('close fires onClose', () => {
    let closed = false;
    const o = new AdjustOverlay(scene);
    o.setHandlers({ onClose: () => { closed = true; } });
    o.open('knife', 'main_hand', base(), []);
    o.close();
    expect(closed).toBe(true);
  });

  it('ops are safe when nothing is open', () => {
    const o = new AdjustOverlay(scene);
    expect(() => { o.nudge(1); o.cycleField(1); o.cycleBone(1); o.save(); o.close(); }).not.toThrow();
  });
});
