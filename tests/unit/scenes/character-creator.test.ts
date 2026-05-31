import { NullEngine } from '@babylonjs/core';
import { CharacterCreatorScene } from '../../../src/scenes/CharacterCreatorScene';
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

  it('getCharacterData returns independent copy (not reference)', async () => {
    await scene.onEnter();
    const data1 = scene.getCharacterData();
    data1.name = 'mutated';
    const data2 = scene.getCharacterData();
    expect(data2.name).not.toBe('mutated');
  });
});
