import { NullEngine, Scene } from '@babylonjs/core';
import { PauseMenu } from '../../../src/systems/PauseMenu';

describe('PauseMenu', () => {
  let engine: NullEngine;
  let scene: Scene;
  let menu: PauseMenu;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    menu = new PauseMenu(scene);
  });

  afterEach(() => {
    menu.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('starts closed', () => {
    expect(menu.isOpen()).toBe(false);
  });

  it('openMenu / close / toggle change the open state', () => {
    menu.openMenu();
    expect(menu.isOpen()).toBe(true);
    menu.close();
    expect(menu.isOpen()).toBe(false);
    menu.toggle();
    expect(menu.isOpen()).toBe(true);
    menu.toggle();
    expect(menu.isOpen()).toBe(false);
  });

  it('resume closes the menu and calls the resume handler', () => {
    const onResume = jest.fn();
    menu.setHandlers({ onResume });
    menu.openMenu();
    menu.resume();
    expect(menu.isOpen()).toBe(false);
    expect(onResume).toHaveBeenCalled();
  });

  it('save calls the save handler and stays open', () => {
    const onSave = jest.fn();
    menu.setHandlers({ onSave });
    menu.openMenu();
    menu.save();
    expect(onSave).toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
  });

  it('load and quitToMainMenu call their handlers', () => {
    const onLoad = jest.fn();
    const onMainMenu = jest.fn();
    menu.setHandlers({ onLoad, onMainMenu });
    menu.load();
    menu.quitToMainMenu();
    expect(onLoad).toHaveBeenCalled();
    expect(onMainMenu).toHaveBeenCalled();
  });

  it('actions without handlers do not throw', () => {
    expect(() => { menu.save(); menu.load(); menu.quitToMainMenu(); menu.resume(); }).not.toThrow();
  });

  it('dispose clears handlers', () => {
    const onSave = jest.fn();
    menu.setHandlers({ onSave });
    menu.dispose();
    menu.save();
    expect(onSave).not.toHaveBeenCalled();
  });
});
