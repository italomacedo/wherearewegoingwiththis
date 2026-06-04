import { Inventory, DEFAULT_CAPACITY_WEIGHT } from '../../../src/entities/Inventory';

describe('Inventory', () => {
  it('starts empty with the default capacity', () => {
    const inv = new Inventory();
    expect(inv.isEmpty()).toBe(true);
    expect(inv.capacityWeight).toBe(DEFAULT_CAPACITY_WEIGHT);
    expect(inv.equippedWeaponId).toBeNull();
    expect(inv.totalWeight()).toBe(0);
  });

  it('adds and counts items', () => {
    const inv = new Inventory();
    expect(inv.add('scrap', 3)).toBe(3);
    expect(inv.count('scrap')).toBe(3);
    expect(inv.has('scrap')).toBe(true);
    expect(inv.has('scrap', 4)).toBe(false);
    expect(inv.has('knife')).toBe(false);
  });

  it('caps a stack at maxStack and reports the overflow not added', () => {
    const inv = new Inventory();
    expect(inv.add('medkit', 4)).toBe(4);  // maxStack 5
    expect(inv.add('medkit', 3)).toBe(1);  // only 1 fits → 5 total
    expect(inv.count('medkit')).toBe(5);
  });

  it('non-stackable items cap at 1', () => {
    const inv = new Inventory();
    expect(inv.add('knife', 1)).toBe(1);
    expect(inv.add('knife', 1)).toBe(0);
    expect(inv.count('knife')).toBe(1);
  });

  it('ignores non-positive add/remove', () => {
    const inv = new Inventory();
    expect(inv.add('scrap', 0)).toBe(0);
    expect(inv.add('scrap', -2)).toBe(0);
    expect(inv.remove('scrap', 0)).toBe(0);
  });

  it('totalWeight and isOverweight reflect contents vs capacity', () => {
    const inv = new Inventory({ capacityWeight: 5 });
    inv.add('pipe', 1);   // 2.0
    inv.add('medkit', 2); // 0.8 * 2 = 1.6  → 3.6 total
    expect(inv.totalWeight()).toBeCloseTo(3.6, 5);
    expect(inv.isOverweight()).toBe(false);
    expect(inv.remainingCapacity()).toBeCloseTo(1.4, 5);
  });

  it('acceptableQty honours both stack cap and weight room', () => {
    const inv = new Inventory({ capacityWeight: 2 });
    // medkit weight 0.8 → floor(2/0.8) = 2 fit by weight; stack allows 5
    expect(inv.acceptableQty('medkit', 5)).toBe(2);
    // zero-weight-room case
    inv.add('pipe', 1); // 2.0 → no room left
    expect(inv.acceptableQty('medkit', 5)).toBe(0);
    expect(inv.acceptableQty('medkit', 0)).toBe(0);
  });

  it('acceptableQty treats zero-weight items as weight-unbounded (stack-limited only)', () => {
    // An unknown id has weight 0 → weightRoom is Infinity, so only the stack cap (1) binds.
    const inv = new Inventory({ capacityWeight: 0 });
    expect(inv.acceptableQty('ghost', 5)).toBe(1);
    // A real, weighted item with no capacity has no room.
    expect(inv.acceptableQty('scrap', 5)).toBe(0);
  });

  it('addRespectingCapacity only takes what fits', () => {
    const inv = new Inventory({ capacityWeight: 1 });
    // medkit 0.8 → only 1 fits
    expect(inv.addRespectingCapacity('medkit', 5)).toBe(1);
    expect(inv.count('medkit')).toBe(1);
  });

  it('removes items and deletes the stack at zero', () => {
    const inv = new Inventory();
    inv.add('scrap', 3);
    expect(inv.remove('scrap', 1)).toBe(1);
    expect(inv.count('scrap')).toBe(2);
    expect(inv.remove('scrap', 10)).toBe(2); // only 2 left
    expect(inv.count('scrap')).toBe(0);
    expect(inv.isEmpty()).toBe(true);
  });

  it('equips an owned melee weapon and rejects non-weapons / unowned', () => {
    const inv = new Inventory();
    inv.add('knife', 1);
    expect(inv.equip('knife')).toBe(true);
    expect(inv.equippedWeaponId).toBe('knife');
    expect(inv.equip('medkit')).toBe(false);  // not a weapon
    expect(inv.equip('pipe')).toBe(false);     // not owned
    expect(inv.equippedWeaponId).toBe('knife');
    inv.unequip();
    expect(inv.equippedWeaponId).toBeNull();
  });

  it('combatWeaponId returns the main-hand weapon — melee OR firearm (Phase 11)', () => {
    const inv = new Inventory();
    inv.add('pistol', 1);
    expect(inv.equip('pistol')).toBe(true);
    expect(inv.equippedWeaponId).toBeNull();      // a firearm does NOT arm the melee fighter
    expect(inv.combatWeaponId).toBe('pistol');    // but it IS the combat (ranged) weapon
    inv.unequip();
    inv.add('knife', 1);
    inv.equip('knife');
    expect(inv.combatWeaponId).toBe('knife');     // melee weapon counts too
    inv.unequip();
    expect(inv.combatWeaponId).toBeNull();         // empty hand → fists
  });

  it('combatWeaponId is null when the main hand holds a non-weapon (e.g. backpack on back)', () => {
    const inv = new Inventory();
    inv.add('backpack', 1);
    inv.equip('backpack'); // goes to the back slot, not main hand
    expect(inv.combatWeaponId).toBeNull();
  });

  it('unequips automatically when the equipped weapon is fully removed', () => {
    const inv = new Inventory();
    inv.add('knife', 1);
    inv.equip('knife');
    inv.remove('knife', 1);
    expect(inv.equippedWeaponId).toBeNull();
    expect(inv.count('knife')).toBe(0);
  });

  it('transferTo moves items honouring the target capacity', () => {
    const corpse = new Inventory();
    corpse.add('knife', 1);
    corpse.add('medkit', 3);
    const player = new Inventory({ capacityWeight: 1 }); // tight
    // knife 0.6 fits; medkit 0.8 then exceeds → 0
    expect(corpse.transferTo(player, 'knife', 1)).toBe(1);
    expect(player.count('knife')).toBe(1);
    expect(corpse.count('knife')).toBe(0);
    expect(corpse.transferTo(player, 'medkit', 3)).toBe(0); // no room (0.4 left < 0.8)
    expect(player.count('medkit')).toBe(0);
    expect(corpse.count('medkit')).toBe(3);
  });

  it('transferTo caps at what the source actually has', () => {
    const a = new Inventory();
    a.add('scrap', 2);
    const b = new Inventory();
    expect(a.transferTo(b, 'scrap', 10)).toBe(2);
    expect(b.count('scrap')).toBe(2);
  });

  it('defaults the quantity to 1 across add/remove/addRespectingCapacity/transferTo', () => {
    const a = new Inventory();
    expect(a.add('scrap')).toBe(1);
    expect(a.count('scrap')).toBe(1);
    expect(a.addRespectingCapacity('scrap')).toBe(1);
    expect(a.count('scrap')).toBe(2);
    expect(a.remove('scrap')).toBe(1);
    expect(a.count('scrap')).toBe(1);
    const b = new Inventory();
    expect(a.transferTo(b, 'scrap')).toBe(1);
    expect(b.count('scrap')).toBe(1);
  });

  it('round-trips through toState / fromState', () => {
    const inv = new Inventory({ capacityWeight: 25 });
    inv.add('knife', 1);
    inv.add('medkit', 2);
    inv.equip('knife');
    const restored = Inventory.fromState(inv.toState());
    expect(restored.count('knife')).toBe(1);
    expect(restored.count('medkit')).toBe(2);
    expect(restored.equippedWeaponId).toBe('knife');
    expect(restored.capacityWeight).toBe(25);
  });

  it('constructor drops bad stacks and an invalid equipped id', () => {
    const inv = new Inventory({
      items: [{ id: 'knife', qty: 1 }, { id: '', qty: 5 }, { id: 'scrap', qty: 0 }],
      equippedWeaponId: 'medkit', // owned? no → dropped
      capacityWeight: -5,         // clamped to 0
    });
    expect(inv.count('knife')).toBe(1);
    expect(inv.count('scrap')).toBe(0);
    expect(inv.equippedWeaponId).toBeNull();
    expect(inv.capacityWeight).toBe(0);
  });

  // ── Phase 10: equipment slots + effective capacity ──

  describe('paper-doll slots (Phase 10)', () => {
    it('equips items into their natural slot and reads them back', () => {
      const inv = new Inventory();
      inv.add('knife', 1);
      inv.add('backpack', 1);
      expect(inv.equipToSlot('main_hand', 'knife')).toBe(true);
      expect(inv.equipToSlot('back', 'backpack')).toBe(true);
      expect(inv.equippedIn('main_hand')).toBe('knife');
      expect(inv.equippedIn('back')).toBe('backpack');
      expect(inv.equipment).toEqual({ main_hand: 'knife', back: 'backpack' });
    });

    it('rejects equipping into the wrong slot or an unowned item', () => {
      const inv = new Inventory();
      inv.add('backpack', 1);
      expect(inv.equipToSlot('main_hand', 'backpack')).toBe(false); // backpack is a back item
      expect(inv.equipToSlot('back', 'knife')).toBe(false);          // not owned
      expect(inv.equippedIn('back')).toBeNull();
    });

    it('a backpack on the back raises the effective capacity', () => {
      const inv = new Inventory({ capacityWeight: 10 });
      inv.add('backpack', 1);
      expect(inv.effectiveCapacity()).toBe(10);          // not equipped yet
      inv.equipToSlot('back', 'backpack');
      expect(inv.effectiveCapacity()).toBe(30);          // +20 bonus
      // The extra room is usable: 20 medkits (0.8 each = 16kg) now fit under 30.
      expect(inv.acceptableQty('medkit', 5)).toBe(5);
    });

    it('the flashlight doubles as a melee weapon when held; swapping re-arms', () => {
      const inv = new Inventory();
      inv.add('flashlight', 1);
      inv.equipToSlot('main_hand', 'flashlight');
      expect(inv.equippedIn('main_hand')).toBe('flashlight');
      expect(inv.equippedWeaponId).toBe('flashlight');    // bludgeon (melee)
      inv.add('knife', 1);
      inv.equipToSlot('main_hand', 'knife');              // replaces the flashlight
      expect(inv.equippedWeaponId).toBe('knife');
    });

    it('a cosmetic firearm in hand does not arm the melee fighter', () => {
      const inv = new Inventory();
      inv.add('pistol', 1);
      inv.equip('pistol'); // legacy convenience routes to main_hand (it is a weapon)
      expect(inv.equippedIn('main_hand')).toBe('pistol');
      expect(inv.equippedWeaponId).toBeNull(); // ranged → never the melee combat weapon
    });

    it('removing an equipped item clears every slot it occupied', () => {
      const inv = new Inventory();
      inv.add('backpack', 1);
      inv.equipToSlot('back', 'backpack');
      inv.remove('backpack', 1);
      expect(inv.equippedIn('back')).toBeNull();
      expect(inv.effectiveCapacity()).toBe(DEFAULT_CAPACITY_WEIGHT);
    });

    it('unequipSlot clears a specific slot', () => {
      const inv = new Inventory();
      inv.add('knife', 1);
      inv.equipToSlot('main_hand', 'knife');
      inv.unequipSlot('main_hand');
      expect(inv.equippedIn('main_hand')).toBeNull();
    });

    it('round-trips the slot map through toState / fromState', () => {
      const inv = new Inventory({ capacityWeight: 20 });
      inv.add('knife', 1);
      inv.add('backpack', 1);
      inv.equipToSlot('main_hand', 'knife');
      inv.equipToSlot('back', 'backpack');
      const restored = Inventory.fromState(inv.toState());
      expect(restored.equippedIn('main_hand')).toBe('knife');
      expect(restored.equippedIn('back')).toBe('backpack');
      expect(restored.equippedWeaponId).toBe('knife');
      expect(restored.effectiveCapacity()).toBe(40);
    });

    it('restores from the legacy equippedWeaponId when no slot map is present', () => {
      const inv = new Inventory({
        items: [{ id: 'pipe', qty: 1 }],
        equippedWeaponId: 'pipe',
      });
      expect(inv.equippedIn('main_hand')).toBe('pipe');
      expect(inv.equippedWeaponId).toBe('pipe');
    });

    it('drops a slot entry whose item is not owned or is wrong for the slot', () => {
      const inv = new Inventory({
        items: [{ id: 'knife', qty: 1 }],
        equipped: { main_hand: 'medkit', back: 'backpack' }, // neither valid
      });
      expect(inv.equippedIn('main_hand')).toBeNull();
      expect(inv.equippedIn('back')).toBeNull();
    });
  });

  // ── Phase 15: armor slots + damage reduction ──

  describe('armor (Phase 15)', () => {
    it('equips armor into its region slot and lists worn pieces', () => {
      const inv = new Inventory();
      inv.add('armor_tac_head', 1);
      inv.add('armor_tac_top', 1);
      expect(inv.equipToSlot('head', 'armor_tac_head')).toBe(true);
      expect(inv.equipToSlot('top', 'armor_tac_top')).toBe(true);
      expect(inv.equippedArmorIds()).toEqual(['armor_tac_head', 'armor_tac_top']);
    });

    it('a full tactical set reduces 25%, a full space set 50%', () => {
      const tac = new Inventory({ items: [{ id: 'armor_tac_head', qty: 1 }, { id: 'armor_tac_top', qty: 1 }, { id: 'armor_tac_legs', qty: 1 }] });
      tac.equipToSlot('head', 'armor_tac_head');
      tac.equipToSlot('top', 'armor_tac_top');
      tac.equipToSlot('bottom', 'armor_tac_legs');
      expect(tac.totalDamageReduction()).toBeCloseTo(0.25, 6);

      const spc = new Inventory({ items: [{ id: 'armor_spc_head', qty: 1 }, { id: 'armor_spc_top', qty: 1 }, { id: 'armor_spc_legs', qty: 1 }] });
      spc.equipToSlot('head', 'armor_spc_head');
      spc.equipToSlot('top', 'armor_spc_top');
      spc.equipToSlot('bottom', 'armor_spc_legs');
      expect(spc.totalDamageReduction()).toBeCloseTo(0.5, 6);
    });

    it('mixed tiers sum each piece; no armor = 0', () => {
      const inv = new Inventory({ items: [{ id: 'armor_tac_head', qty: 1 }, { id: 'armor_spc_top', qty: 1 }] });
      inv.equipToSlot('head', 'armor_tac_head');
      inv.equipToSlot('top', 'armor_spc_top');
      expect(inv.totalDamageReduction()).toBeCloseTo(0.25 / 3 + 0.5 / 3, 6);
      expect(new Inventory().totalDamageReduction()).toBe(0);
    });

    it('round-trips armor slots through toState / fromState', () => {
      const inv = new Inventory({ items: [{ id: 'armor_spc_head', qty: 1 }] });
      inv.equipToSlot('head', 'armor_spc_head');
      const restored = Inventory.fromState(inv.toState());
      expect(restored.equippedIn('head')).toBe('armor_spc_head');
      expect(restored.totalDamageReduction()).toBeCloseTo(0.5 / 3, 6);
    });
  });
});
