import { NullEngine } from '@babylonjs/core';
import { CharacterCreatorScene, buildCreatorSchema } from '../../../src/scenes/CharacterCreatorScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { GameSession } from '../../../src/core/GameSession';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

describe('CharacterCreatorScene', () => {
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

  it('constructs without error', () => {
    expect(scene.babylonScene).toBeDefined();
  });

  it('onEnter resolves without error', async () => {
    await expect(scene.onEnter()).resolves.toBeUndefined();
  });

  it('onExit disposes assembled character', async () => {
    await scene.onEnter();
    await expect(scene.onExit()).resolves.toBeUndefined();
  });

  it('initial player name is empty', () => {
    expect(scene.getPlayerName()).toBe('');
  });

  it('setPlayerName updates name', () => {
    scene.setPlayerName('Kai');
    expect(scene.getPlayerName()).toBe('Kai');
  });

  it('getCharacterData returns a copy with defaults', async () => {
    await scene.onEnter();
    const data = scene.getCharacterData();
    expect(data.appearance.bodyBase).toBe(DEFAULT_APPEARANCE.bodyBase);
  });

  it('cycleBodyBase changes bodyBase', async () => {
    await scene.onEnter();
    const before = scene.getCharacterData().appearance.bodyBase;
    await scene.cycleBodyBase(1);
    const after = scene.getCharacterData().appearance.bodyBase;
    expect(after).not.toBe(before);
  });

  it('cycleBodyBase wraps around', async () => {
    await scene.onEnter();
    // Cycle backwards from index 0 should wrap to last
    const first = scene.getCharacterData().appearance.bodyBase;
    await scene.cycleBodyBase(-1);
    const last = scene.getCharacterData().appearance.bodyBase;
    expect(last).not.toBe(first);
  });

  it('setSkinTone updates skin tone', async () => {
    await scene.onEnter();
    await scene.setSkinTone('#FF0000');
    expect(scene.getCharacterData().appearance.colors.skin).toBe('#FF0000');
  });

  it('cycleHair changes hair style', async () => {
    await scene.onEnter();
    const before = scene.getCharacterData().appearance.slots.hair;
    await scene.cycleHair(1);
    const after = scene.getCharacterData().appearance.slots.hair;
    expect(after).not.toBe(before);
  });

  it('setHairColor updates hair color', async () => {
    await scene.onEnter();
    await scene.setHairColor('#FF00FF');
    expect(scene.getCharacterData().appearance.colors.hair).toBe('#FF00FF');
  });

  it('cycleHair cycles through all options including null', async () => {
    await scene.onEnter();
    // Cycle through all 7 options (6 hair styles + null)
    for (let i = 0; i < 7; i++) {
      await scene.cycleHair(1);
    }
    // After 7 cycles, we're back to original position
    expect(scene.getCharacterData().appearance.slots.hair).toBe(DEFAULT_APPEARANCE.slots.hair);
  });

  it('setClothingSlot top updates top', async () => {
    await scene.onEnter();
    await scene.setClothingSlot('top', 'jacket_neon_bomber');
    expect(scene.getCharacterData().appearance.slots.shirt).toBe('jacket_neon_bomber');
  });

  it('setClothingSlot can set null to remove clothing', async () => {
    await scene.onEnter();
    await scene.setClothingSlot('top', 'jacket_neon_bomber');
    await scene.setClothingSlot('top', null);
    expect(scene.getCharacterData().appearance.slots.shirt).toBeUndefined();
  });

  it('toggleImplant adds an implant', async () => {
    await scene.onEnter();
    scene.toggleImplant('eye_mod_left_optical');
    expect(scene.getCharacterData().appearance.implants).toContain('eye_mod_left_optical');
  });

  it('toggleImplant removes an already-active implant', async () => {
    await scene.onEnter();
    scene.toggleImplant('eye_mod_left_optical');
    scene.toggleImplant('eye_mod_left_optical');
    expect(scene.getCharacterData().appearance.implants).not.toContain('eye_mod_left_optical');
  });

  it('onBack navigates to main-menu', async () => {
    await scene.onEnter();
    scene.onBack();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
  });

  it('onBegin does nothing with empty name', async () => {
    await scene.onEnter();
    await scene.onBegin('');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
  });

  it('onBegin with valid name navigates to game-world', async () => {
    await scene.onEnter();
    await scene.onBegin('Kai');
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('game-world');
  });

  it('onBegin creates a save and registers a GameSession', async () => {
    await scene.onEnter();
    await scene.setSkinTone('#ABCDEF');
    await scene.onBegin('Kai');
    expect(SaveService.listMeta()).toHaveLength(1);
    const session = ServiceLocator.get<GameSession>('gameSession');
    expect(session.character.name).toBe('Kai');
    expect(session.character.appearance.colors.skin).toBe('#ABCDEF');
    expect(session.saveId).toBe(SaveService.listMeta()[0]!.saveId);
  });

  it('onBegin trims whitespace-only names', async () => {
    await scene.onEnter();
    await scene.onBegin('   ');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
  });

  it('setColorValue updates an arbitrary region tint', async () => {
    await scene.onEnter();
    await scene.setColorValue('eye', '#00FF00');
    expect(scene.getCharacterData().appearance.colors.eye).toBe('#00FF00');
  });

  it('setGender switches the body base male/female and keeps ethnicity', async () => {
    await scene.onEnter();
    await scene.setGender('male');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('body_male_african');
    expect(scene.getGender()).toBe('male');
    await scene.setGender('female');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('body_female_african');
    expect(scene.getGender()).toBe('female');
  });

  it('setEthnicity selects the matching body GLB (keeps gender)', async () => {
    await scene.onEnter();
    expect(scene.getEthnicity()).toBe('african'); // default body_female_african
    await scene.setEthnicity('caucasian');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('body_female_caucasian');
    expect(scene.getEthnicity()).toBe('caucasian');
    await scene.setGender('male');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('body_male_caucasian'); // ethnicity preserved
  });

  it('setSkinTextureChoice updates the skin texture', async () => {
    await scene.onEnter();
    await scene.setSkinTextureChoice('skin_03');
    expect(scene.getCharacterData().appearance.skinTexture).toBe('skin_03');
  });

  it('setSlotValue applies exclusion (boots clears sneakers)', async () => {
    await scene.onEnter();
    await scene.setSlotValue('sneakers', 'sneakers_neon');
    await scene.setSlotValue('boots', 'boots_combat');
    const slots = scene.getCharacterData().appearance.slots;
    expect(slots.boots).toBe('boots_combat');
    expect(slots.sneakers).toBeUndefined();
  });

  it('setMorph stores a morph slider value (applied live, no rebuild)', async () => {
    await scene.onEnter();
    await scene.setMorph('nose_width', 0.8);
    expect(scene.getCharacterData().appearance.morphs.nose_width).toBe(0.8);
  });

  it('serializes overlapping rebuilds — latest edit wins', async () => {
    await scene.onEnter();
    const p1 = scene.setSkinTone('#111111');
    const p2 = scene.setSkinTone('#222222');
    await Promise.all([p1, p2]);
    expect(scene.getCharacterData().appearance.colors.skin).toBe('#222222');
  });

  it('getCharacterData returns independent copy (not reference)', async () => {
    await scene.onEnter();
    const data1 = scene.getCharacterData();
    data1.name = 'mutated';
    const data2 = scene.getCharacterData();
    expect(data2.name).not.toBe('mutated');
  });
});

describe('buildCreatorSchema (pure)', () => {
  const schema = buildCreatorSchema();

  it('has the expected categories', () => {
    expect(schema.map((c) => c.title)).toEqual([
      'Body & Skin', 'Hair & Facial Hair', 'Eyes',
      'Tops', 'Bottoms & Belt', 'Footwear',
    ]);
  });

  it('Body & Skin exposes gender, ethnicity, skin swatch and skin color', () => {
    const kinds = schema[0]!.controls.map((c) => c.kind);
    expect(kinds).toEqual(['gender', 'ethnicity', 'swatch', 'color']);
    const swatch = schema[0]!.controls.find((c) => c.kind === 'swatch');
    expect(swatch && swatch.kind === 'swatch' && swatch.skinTextures.length).toBe(4);
  });

  it('clothing cyclers offer a "none" (null) option first', () => {
    const tops = schema.find((c) => c.title === 'Tops')!;
    for (const c of tops.controls) {
      if (c.kind === 'cycler') expect(c.options[0]).toBeNull();
    }
  });

  it('every colour control carries a non-empty preset palette', () => {
    const colors = schema.flatMap((c) => c.controls).filter((c) => c.kind === 'color');
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) {
      expect(c.kind === 'color' && c.presets.length).toBeGreaterThan(0);
    }
  });
});
