import { NullEngine, Scene } from '@babylonjs/core';
import { InventoryOverlay } from '../../../src/systems/InventoryOverlay';
import { Inventory } from '../../../src/entities/Inventory';

describe('InventoryOverlay (pure state + actions)', () => {
  let engine: NullEngine;
  let scene: Scene;
  let overlay: InventoryOverlay;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    overlay = new InventoryOverlay(scene);
  });

  afterEach(() => {
    overlay.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('starts closed', () => {
    expect(overlay.isOpen()).toBe(false);
  });

  it('openManage opens in manage mode and lists the player rows', () => {
    const inv = new Inventory();
    inv.add('knife', 1);
    inv.add('medkit', 2);
    inv.equip('knife');
    overlay.openManage(inv);
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.getMode()).toBe('manage');
    const rows = overlay.playerRows();
    const knife = rows.find((r) => r.id === 'knife')!;
    expect(knife.weapon).toBe(true);
    expect(knife.equipped).toBe(true);
    expect(typeof knife.name).toBe('string');
    const medkit = rows.find((r) => r.id === 'medkit')!;
    expect(medkit.consumable).toBe(true);
    expect(medkit.qty).toBe(2);
  });

  it('equip / unequip change the equipped weapon and notify onChange', () => {
    const inv = new Inventory();
    inv.add('knife', 1);
    let changes = 0;
    overlay.setHandlers({ onChange: () => { changes += 1; } });
    overlay.openManage(inv);
    overlay.equip('knife');
    expect(inv.equippedWeaponId).toBe('knife');
    overlay.unequip();
    expect(inv.equippedWeaponId).toBeNull();
    expect(changes).toBe(2);
  });

  it('useItem heals via onHeal and consumes one medkit', () => {
    const inv = new Inventory();
    inv.add('medkit', 2);
    let healed = 0;
    overlay.setHandlers({ onHeal: (a) => { healed += a; } });
    overlay.openManage(inv);
    overlay.useItem('medkit');
    expect(healed).toBe(40);
    expect(inv.count('medkit')).toBe(1);
  });

  it('useItem ignores non-consumables and missing items', () => {
    const inv = new Inventory();
    inv.add('knife', 1);
    let healed = 0;
    overlay.setHandlers({ onHeal: (a) => { healed += a; } });
    overlay.openManage(inv);
    overlay.useItem('knife');   // weapon, not consumable
    overlay.useItem('medkit');  // not owned
    expect(healed).toBe(0);
    expect(inv.count('knife')).toBe(1);
  });

  it('drop removes one of an item', () => {
    const inv = new Inventory();
    inv.add('scrap', 3);
    overlay.openManage(inv);
    overlay.drop('scrap');
    expect(inv.count('scrap')).toBe(2);
  });

  it('openLoot lists the corpse and take transfers into the player (capacity-aware)', () => {
    const corpse = new Inventory();
    corpse.add('knife', 1);
    corpse.add('medkit', 2);
    const player = new Inventory();
    let changes = 0;
    overlay.setHandlers({ onChange: () => { changes += 1; } });
    overlay.openLoot(player, corpse, 'Mback');
    expect(overlay.getMode()).toBe('loot');
    expect(overlay.getSourceName()).toBe('Mback');
    expect(overlay.sourceRows().map((r) => r.id).sort()).toEqual(['knife', 'medkit']);
    overlay.take('knife');
    expect(player.count('knife')).toBe(1);
    expect(corpse.count('knife')).toBe(0);
    expect(changes).toBe(1);
  });

  it('takeAll empties the corpse into the player within capacity', () => {
    const corpse = new Inventory();
    corpse.add('knife', 1);
    corpse.add('medkit', 2);
    corpse.add('scrap', 3);
    const player = new Inventory();
    overlay.openLoot(player, corpse, 'Zara');
    overlay.takeAll();
    expect(player.count('knife')).toBe(1);
    expect(player.count('medkit')).toBe(2);
    expect(player.count('scrap')).toBe(3);
    expect(corpse.isEmpty()).toBe(true);
  });

  it('take / takeAll are no-ops when not in loot mode', () => {
    const inv = new Inventory();
    inv.add('scrap', 1);
    overlay.openManage(inv);
    overlay.take('scrap');
    overlay.takeAll();
    expect(inv.count('scrap')).toBe(1);
  });

  it('close fires onClose and clears the loot source', () => {
    const player = new Inventory();
    const corpse = new Inventory();
    corpse.add('scrap', 1);
    let closed = 0;
    overlay.setHandlers({ onClose: () => { closed += 1; } });
    overlay.openLoot(player, corpse, 'X');
    overlay.close();
    expect(overlay.isOpen()).toBe(false);
    expect(closed).toBe(1);
    // a second close is a no-op (already closed)
    overlay.close();
    expect(closed).toBe(1);
    // loot actions now do nothing
    overlay.take('scrap');
    expect(player.count('scrap')).toBe(0);
  });

  it('sourceRows is empty in manage mode', () => {
    overlay.openManage(new Inventory());
    expect(overlay.sourceRows()).toEqual([]);
  });
});
