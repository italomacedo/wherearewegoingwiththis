import { ActionRibbon, ribbonButtons, RibbonKey } from '@systems/ActionRibbon';
import { Engine, NullEngine, Scene } from '@babylonjs/core';

describe('ribbonButtons (pure gating)', () => {
  it('Attack Ranged needs a firearm; the rest are always enabled', () => {
    const without = ribbonButtons(false);
    const by = (k: RibbonKey) => without.find((b) => b.key === k)!;
    expect(without.map((b) => b.key)).toEqual(['attackRanged', 'attackMelee', 'talk', 'inventory', 'characterSheet', 'pda']);
    expect(by('attackRanged').enabled).toBe(false);
    expect(by('attackMelee').enabled).toBe(true);
    expect(by('talk').enabled).toBe(true);
    expect(by('inventory').enabled).toBe(true);
    expect(by('characterSheet').enabled).toBe(true);
    expect(by('pda').enabled).toBe(true);

    expect(ribbonButtons(true).find((b) => b.key === 'attackRanged')!.enabled).toBe(true);
  });

  it('while piloting returns only adjustSeat', () => {
    const buttons = ribbonButtons(false, true);
    expect(buttons.map((b) => b.key)).toEqual(['adjustSeat']);
    expect(buttons[0].enabled).toBe(true);
    // firearm flag irrelevant while piloting
    expect(ribbonButtons(true, true).map((b) => b.key)).toEqual(['adjustSeat']);
  });
});

describe('ActionRibbon (state + dispatch, headless)', () => {
  let engine: Engine;
  let scene: Scene;
  beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
  afterEach(() => { scene.dispose(); engine.dispose(); });

  it('press() fires the matching handler only when enabled', () => {
    const ribbon = new ActionRibbon(scene);
    const fired: string[] = [];
    ribbon.setHandlers({
      onAttackRanged: () => fired.push('ranged'),
      onAttackMelee: () => fired.push('melee'),
      onTalk: () => fired.push('talk'),
      onInventory: () => fired.push('inv'),
      onCharacterSheet: () => fired.push('sheet'),
      onPda: () => fired.push('pda'),
    });

    ribbon.press('attackRanged'); // no firearm → disabled → no-op
    ribbon.press('attackMelee');
    ribbon.press('talk');
    ribbon.press('inventory');
    ribbon.press('characterSheet');
    ribbon.press('pda');
    expect(fired).toEqual(['melee', 'talk', 'inv', 'sheet', 'pda']);

    ribbon.setFirearmEquipped(true);
    ribbon.press('attackRanged'); // now enabled
    expect(fired).toContain('ranged');
    ribbon.dispose();
  });

  it('while piloting, only adjustSeat fires; on-foot buttons are no-ops', () => {
    const ribbon = new ActionRibbon(scene);
    const fired: string[] = [];
    ribbon.setHandlers({
      onAttackMelee: () => fired.push('melee'),
      onAdjustSeat: () => fired.push('adjustSeat'),
    });

    ribbon.setIsPiloting(true);
    ribbon.press('attackMelee');   // on-foot button — no-op while piloting
    ribbon.press('adjustSeat');    // only active button while piloting
    expect(fired).toEqual(['adjustSeat']);

    ribbon.setIsPiloting(false);
    ribbon.press('attackMelee');   // back on foot — fires again
    ribbon.press('adjustSeat');    // pilot-only — no-op on foot
    expect(fired).toEqual(['adjustSeat', 'melee']);
    ribbon.dispose();
  });

  it('tracks visibility', () => {
    const ribbon = new ActionRibbon(scene);
    expect(ribbon.isVisible()).toBe(true);
    ribbon.setVisible(false);
    expect(ribbon.isVisible()).toBe(false);
    ribbon.dispose();
  });
});
