import { ActionRibbon, ribbonButtons, RibbonKey } from '@systems/ActionRibbon';
import { Engine, NullEngine, Scene } from '@babylonjs/core';

describe('ribbonButtons (pure gating)', () => {
  it('Attack Ranged needs a firearm; the rest are always enabled', () => {
    const without = ribbonButtons(false);
    const by = (k: RibbonKey) => without.find((b) => b.key === k)!;
    expect(without.map((b) => b.key)).toEqual(['attackRanged', 'attackMelee', 'talk', 'inventory', 'characterSheet']);
    expect(by('attackRanged').enabled).toBe(false);
    expect(by('attackMelee').enabled).toBe(true);
    expect(by('talk').enabled).toBe(true);
    expect(by('inventory').enabled).toBe(true);
    expect(by('characterSheet').enabled).toBe(true);

    expect(ribbonButtons(true).find((b) => b.key === 'attackRanged')!.enabled).toBe(true);
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
    });

    ribbon.press('attackRanged'); // no firearm → disabled → no-op
    ribbon.press('attackMelee');
    ribbon.press('talk');
    ribbon.press('inventory');
    ribbon.press('characterSheet');
    expect(fired).toEqual(['melee', 'talk', 'inv', 'sheet']);

    ribbon.setFirearmEquipped(true);
    ribbon.press('attackRanged'); // now enabled
    expect(fired).toContain('ranged');
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
