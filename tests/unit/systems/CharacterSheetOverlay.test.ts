import { NullEngine, Scene } from '@babylonjs/core';
import {
  buildSheetState,
  CharacterSheetOverlay,
} from '../../../src/systems/CharacterSheetOverlay';
import {
  createDefaultStats, grantPerkPoints, perksForTier, choosePerkReplacing,
} from '../../../src/entities/CharacterStats';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SettingsService } from '../../../src/systems/SettingsService';
import { resetLocale } from '../../../src/systems/I18n';

let engine: InstanceType<typeof NullEngine>;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  SettingsService.reset();
  resetLocale();
});

afterEach(() => {
  ServiceLocator.clear();
  scene.dispose();
  engine.dispose();
});

describe('buildSheetState — attributes', () => {
  it('returns 4 attribute rows with label, value, and description', () => {
    const state = buildSheetState(createDefaultStats());
    expect(state.attributes).toHaveLength(4);
    const forca = state.attributes.find((a) => a.id === 'forca')!;
    expect(forca.value).toBe(20);
    expect(forca.label).toBeTruthy();
    expect(forca.description).toBeTruthy(); // description present in i18n
  });
});

describe('buildSheetState — skills', () => {
  it('returns 13 skill rows with description', () => {
    const state = buildSheetState(createDefaultStats());
    expect(state.skills).toHaveLength(13);
    const pilot = state.skills.find((s) => s.id === 'pilotagem')!;
    expect(pilot.attribute).toBe('destreza');
    expect(pilot.description).toContain('speed');
  });

  it('skill value reflects the stats sheet', () => {
    const stats = createDefaultStats();
    stats.skills.pilotagem = 45;
    const state = buildSheetState(stats);
    const pilot = state.skills.find((s) => s.id === 'pilotagem')!;
    expect(pilot.value).toBe(45);
  });
});

describe('buildSheetState — perk trees', () => {
  it('returns 4 trees, one per attribute', () => {
    const state = buildSheetState(createDefaultStats());
    expect(state.perkTrees).toHaveLength(4);
  });

  it('each tree has 5 tier groups', () => {
    const state = buildSheetState(createDefaultStats());
    expect(state.perkTrees[0]!.tiers).toHaveLength(5);
  });

  it('tier 1 is unlocked at creation (attr=20); tiers 2–5 are locked', () => {
    const state = buildSheetState(createDefaultStats());
    const tree = state.perkTrees.find((t) => t.attrId === 'forca')!;
    expect(tree.tiers[0]!.unlocked).toBe(true);
    expect(tree.tiers[1]!.unlocked).toBe(false);
  });

  it('chosen perk has state "chosen"', () => {
    const [p1] = perksForTier('forca', 1);
    let stats = createDefaultStats();
    stats = choosePerkReplacing(stats, p1!.id);
    const state = buildSheetState(stats);
    const tree = state.perkTrees.find((t) => t.attrId === 'forca')!;
    const perk = tree.tiers[0]!.perks.find((p) => p.id === p1!.id)!;
    expect(perk.state).toBe('chosen');
  });

  it('pickable when tier unlocked + point available + slot empty', () => {
    let stats = createDefaultStats();
    stats.attributes.forca = 40;
    stats = grantPerkPoints(stats, { forca: 1 });
    const state = buildSheetState(stats);
    const tree = state.perkTrees.find((t) => t.attrId === 'forca')!;
    const tier2 = tree.tiers[1]!;
    expect(tier2.unlocked).toBe(true);
    expect(tier2.perks.some((p) => p.state === 'pickable')).toBe(true);
  });

  it('available (not pickable) when tier unlocked but no point', () => {
    let stats = createDefaultStats();
    stats.attributes.forca = 40;
    const state = buildSheetState(stats);
    const tree = state.perkTrees.find((t) => t.attrId === 'forca')!;
    const tier2 = tree.tiers[1]!;
    expect(tier2.unlocked).toBe(true);
    expect(tier2.perks.every((p) => p.state === 'available')).toBe(true);
  });

  it('availablePoints matches perkPoints on the stats', () => {
    let stats = createDefaultStats();
    stats = grantPerkPoints(stats, { destreza: 3 });
    const state = buildSheetState(stats);
    const tree = state.perkTrees.find((t) => t.attrId === 'destreza')!;
    expect(tree.availablePoints).toBe(3);
  });

  it('totalPoints aggregates across all attributes', () => {
    let stats = createDefaultStats();
    stats = grantPerkPoints(stats, { forca: 1, destreza: 2 });
    const state = buildSheetState(stats);
    expect(state.totalPoints).toBe(3);
  });
});

describe('buildSheetState — edge cases', () => {
  it('skill value defaults to 10 when missing from stats', () => {
    const stats = createDefaultStats();
    // Simulate a partial stats object missing a skill (legacy save edge case)
    delete (stats.skills as unknown as Record<string, unknown>)['pilotagem'];
    const state = buildSheetState(stats);
    const pilot = state.skills.find((s) => s.id === 'pilotagem')!;
    expect(pilot.value).toBe(10);
  });

  it('slot-filled perk (the other perk in the same tier was chosen) shows as available', () => {
    const [p1, p2] = perksForTier('forca', 1);
    let stats = createDefaultStats();
    stats = choosePerkReplacing(stats, p1!.id); // p1 chosen → p2 slot filled
    stats = grantPerkPoints(stats, { forca: 1 }); // has a point, but slot filled
    const state = buildSheetState(stats);
    const tree = state.perkTrees.find((t) => t.attrId === 'forca')!;
    const p2row = tree.tiers[0]!.perks.find((p) => p.id === p2!.id)!;
    expect(p2row.state).toBe('available'); // slot already filled by p1 → can't pick p2
  });
});

describe('CharacterSheetOverlay — state machine', () => {
  it('starts closed', () => {
    const overlay = new CharacterSheetOverlay(scene);
    expect(overlay.isOpen()).toBe(false);
  });

  it('show() marks as open; hide() marks as closed and calls onClose', () => {
    const overlay = new CharacterSheetOverlay(scene);
    const onClose = jest.fn();
    overlay.setHandlers({ onClose });
    overlay.show(createDefaultStats());
    expect(overlay.isOpen()).toBe(true);
    overlay.hide();
    expect(overlay.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('show() while already open is a no-op', () => {
    const overlay = new CharacterSheetOverlay(scene);
    const onClose = jest.fn();
    overlay.setHandlers({ onClose });
    overlay.show(createDefaultStats());
    overlay.show(createDefaultStats()); // second call ignored
    overlay.hide();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hide() while closed is a no-op (no double onClose)', () => {
    const overlay = new CharacterSheetOverlay(scene);
    const onClose = jest.fn();
    overlay.setHandlers({ onClose });
    overlay.hide(); // already closed
    expect(onClose).not.toHaveBeenCalled();
  });
});
