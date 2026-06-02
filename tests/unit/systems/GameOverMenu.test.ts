import { Engine, NullEngine, Scene } from '@babylonjs/core';
import { GameOverMenu } from '@systems/GameOverMenu';

describe('GameOverMenu (pure surface, no DOM)', () => {
  let engine: Engine;
  let scene: Scene;
  let menu: GameOverMenu;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    menu = new GameOverMenu(scene);
  });

  afterEach(() => {
    menu.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('starts closed and toggles open/close', () => {
    expect(menu.isOpen()).toBe(false);
    menu.openMenu();
    expect(menu.isOpen()).toBe(true);
    menu.close();
    expect(menu.isOpen()).toBe(false);
  });

  it('invokes the load + main-menu handlers', () => {
    const onLoad = jest.fn();
    const onMainMenu = jest.fn();
    menu.setHandlers({ onLoad, onMainMenu });
    menu.loadLastSave();
    menu.quitToMainMenu();
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onMainMenu).toHaveBeenCalledTimes(1);
  });

  it('actions are safe with no handlers set', () => {
    expect(() => { menu.loadLastSave(); menu.quitToMainMenu(); }).not.toThrow();
  });
});
