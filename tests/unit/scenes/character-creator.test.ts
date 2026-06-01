import { NullEngine } from '@babylonjs/core';
import { CharacterCreatorScene, buildCreatorSchema, COLOR_PRESETS } from '../../../src/scenes/CharacterCreatorScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { GameSession } from '../../../src/core/GameSession';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';
import { outfitsForGender, DEFAULT_OUTFIT } from '../../../src/assets/AvatarMeshCatalog';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

describe('CharacterCreatorScene (Quaternius outfits)', () => {
  let engine: NullEngine;
  let scene: CharacterCreatorScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    scene = new CharacterCreatorScene(engine);
    mockSceneManager.loadScene.mockClear();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
    SaveService.reset();
  });

  it('constructs and enters/exits without error', async () => {
    expect(scene.babylonScene).toBeDefined();
    await expect(scene.onEnter()).resolves.toBeUndefined();
    await expect(scene.onExit()).resolves.toBeUndefined();
  });

  it('player name starts empty and can be set', () => {
    expect(scene.getPlayerName()).toBe('');
    scene.setPlayerName('Kai');
    expect(scene.getPlayerName()).toBe('Kai');
  });

  it('defaults to the default outfit (male)', async () => {
    await scene.onEnter();
    expect(scene.getOutfit()).toBe(DEFAULT_APPEARANCE.bodyBase);
    expect(scene.getOutfit()).toBe(DEFAULT_OUTFIT);
    expect(scene.getGender()).toBe('male');
  });

  it('setOutfit / getOutfit selects a complete character', async () => {
    await scene.onEnter();
    await scene.setOutfit('punk');
    expect(scene.getOutfit()).toBe('punk');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('punk');
  });

  it('cycleOutfit walks the current gender outfits and wraps', async () => {
    await scene.onEnter();
    const keys = outfitsForGender('male').map((o) => o.key);
    await scene.setOutfit(keys[0]!);
    await scene.cycleOutfit(1);
    expect(scene.getOutfit()).toBe(keys[1]);
    await scene.setOutfit(keys[0]!);
    await scene.cycleOutfit(-1);
    expect(scene.getOutfit()).toBe(keys[keys.length - 1]);
  });

  it('setGender picks the first outfit of that gender', async () => {
    await scene.onEnter();
    await scene.setGender('male');
    expect(scene.getGender()).toBe('male');
    expect(scene.getOutfit()).toBe(outfitsForGender('male')[0]!.key);
  });

  it('setSkinTone / setHairColor / setColorValue update colours', async () => {
    await scene.onEnter();
    await scene.setSkinTone('#FF0000');
    await scene.setHairColor('#FF00FF');
    await scene.setColorValue('eye', '#00FF00');
    const c = scene.getCharacterData().appearance.colors;
    expect(c.skin).toBe('#FF0000');
    expect(c.hair).toBe('#FF00FF');
    expect(c.eye).toBe('#00FF00');
  });

  it('onBack navigates to main-menu; onBegin needs a non-empty name', async () => {
    await scene.onEnter();
    scene.onBack();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
    mockSceneManager.loadScene.mockClear();
    await scene.onBegin('   ');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
    await scene.onBegin('Kai');
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('game-world');
  });

  it('onBegin creates a save and registers a GameSession carrying the outfit', async () => {
    await scene.onEnter();
    await scene.setOutfit('swat');
    await scene.onBegin('Kai');
    expect(SaveService.listMeta()).toHaveLength(1);
    const session = ServiceLocator.get<GameSession>('gameSession');
    expect(session.character.name).toBe('Kai');
    expect(session.character.appearance.bodyBase).toBe('swat');
  });

  it('serializes overlapping rebuilds — latest edit wins', async () => {
    await scene.onEnter();
    await Promise.all([scene.setSkinTone('#111111'), scene.setSkinTone('#222222')]);
    expect(scene.getCharacterData().appearance.colors.skin).toBe('#222222');
  });

  // ─── RPG sheet (Phase 3) ────────────────────────────────────────────────────

  it('starts with a valid default RPG sheet (primary Força = 30%)', () => {
    const stats = scene.getStats();
    expect(scene.getPrimaryAttribute()).toBe('forca');
    expect(stats.attributes.forca).toBe(30);
    expect(stats.attributes.destreza).toBe(20);
    expect(Object.values(stats.skills).every((v) => v === 10)).toBe(true);
  });

  it('cyclePrimaryAttribute moves the 30% around the four attributes', () => {
    expect(scene.cyclePrimaryAttribute()).toBe('destreza');
    expect(scene.getStats().attributes.destreza).toBe(30);
    expect(scene.getStats().attributes.forca).toBe(20);
  });

  it('setStartingSkills validates and applies 2x40 + 3x20', () => {
    expect(scene.setStartingSkills(['armas_de_fogo'], ['x'])).toBe(false); // invalid
    expect(scene.setStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio'])).toBe(true);
    const s = scene.getStats();
    expect(s.skills.armas_de_fogo).toBe(40);
    expect(s.skills.furtividade).toBe(20);
  });

  it('choosePerk takes an unlocked tier-1 perk', () => {
    expect(scene.choosePerk('forca_t1_punho_calejado')).toBe(true);
    expect(scene.getStats().perks).toContain('forca_t1_punho_calejado');
    expect(scene.choosePerk('does_not_exist')).toBe(false);
  });

  it('setSlotPerk swaps the pick within the forca tier-1 slot', () => {
    expect(scene.setSlotPerk('forca_t1_punho_calejado')).toBe(true);
    expect(scene.setSlotPerk('forca_t1_folego_de_rua')).toBe(true);
    const perks = scene.getStats().perks;
    expect(perks).toContain('forca_t1_folego_de_rua');
    expect(perks).not.toContain('forca_t1_punho_calejado');
  });

  it('onBegin persists the RPG sheet onto the saved character', async () => {
    await scene.onEnter();
    scene.cyclePrimaryAttribute(); // forca → destreza
    await scene.onBegin('Kai');
    const session = ServiceLocator.get<GameSession>('gameSession');
    expect(session.character.stats!.attributes.destreza).toBe(30);
  });
});

describe('buildCreatorSchema (pure)', () => {
  const schema = buildCreatorSchema();

  it('has the outfit-model categories', () => {
    expect(schema.map((c) => c.title)).toEqual(['Body & Skin', 'Outfit']);
  });

  it('Body & Skin exposes gender + skin/eye colours', () => {
    expect(schema[0]!.controls.map((c) => c.kind)).toEqual(['gender', 'color', 'color']);
  });

  it('Outfit category has an outfit cycler + hair colour', () => {
    const kinds = schema.find((c) => c.title === 'Outfit')!.controls.map((c) => c.kind);
    expect(kinds).toContain('outfit');
    expect(kinds).toContain('color');
  });

  it('every colour control has a non-empty preset palette', () => {
    const colors = schema.flatMap((c) => c.controls).filter((c) => c.kind === 'color');
    for (const c of colors) {
      if (c.kind === 'color') expect(COLOR_PRESETS[c.colorKey].length).toBeGreaterThan(0);
    }
  });
});
