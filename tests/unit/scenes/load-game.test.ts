import { NullEngine } from '@babylonjs/core';
import { LoadGameScene } from '../../../src/scenes/LoadGameScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

const testCharacter = { name: 'Kai', appearance: { ...DEFAULT_APPEARANCE } };

describe('LoadGameScene', () => {
  let engine: NullEngine;
  let scene: LoadGameScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    SaveService.reset();
    scene = new LoadGameScene(engine);
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

  it('onEnter loads save list', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    expect(scene.getSaves()).toHaveLength(1);
  });

  it('onEnter with no saves shows empty list', async () => {
    await scene.onEnter();
    expect(scene.getSaves()).toHaveLength(0);
  });

  it('onExit clears pendingDelete', async () => {
    await scene.onEnter();
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    scene.requestDelete(save.saveId);
    await scene.onExit();
    expect(scene.getPendingDelete()).toBeNull();
  });

  it('onBack navigates to main-menu', async () => {
    await scene.onEnter();
    scene.onBack();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
  });

  it('onLoadSave with valid ID navigates to game-world', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    await scene.onLoadSave(save.saveId);
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('game-world');
  });

  it('onLoadSave with invalid ID does not navigate', async () => {
    await scene.onEnter();
    await scene.onLoadSave('nonexistent');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
  });

  it('requestDelete sets pendingDelete', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    scene.requestDelete(save.saveId);
    expect(scene.getPendingDelete()).toBe(save.saveId);
  });

  it('confirmDelete deletes the pending save', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    scene.requestDelete(save.saveId);
    const result = scene.confirmDelete();
    expect(result).toBe(true);
    expect(SaveService.load(save.saveId)).toBeNull();
  });

  it('confirmDelete returns false when no pending delete', async () => {
    await scene.onEnter();
    expect(scene.confirmDelete()).toBe(false);
  });

  it('confirmDelete clears pendingDelete', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    scene.requestDelete(save.saveId);
    scene.confirmDelete();
    expect(scene.getPendingDelete()).toBeNull();
  });

  it('cancelDelete clears pendingDelete without deleting', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    scene.requestDelete(save.saveId);
    scene.cancelDelete();
    expect(scene.getPendingDelete()).toBeNull();
    expect(SaveService.load(save.saveId)).not.toBeNull();
  });

  it('getSaves returns independent copy', async () => {
    const save = SaveService.createNewSave(testCharacter);
    SaveService.save(save);
    await scene.onEnter();
    const copy = scene.getSaves();
    copy.push({ saveId: 'fake', saveName: 'x', updatedAt: '', gameTimeSeconds: 0 });
    expect(scene.getSaves()).toHaveLength(1);
  });
});
