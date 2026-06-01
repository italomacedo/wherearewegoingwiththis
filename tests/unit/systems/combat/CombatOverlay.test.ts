import { Engine, NullEngine, Scene } from '@babylonjs/core';
import { CombatOverlay } from '@systems/combat/CombatOverlay';
import { CombatController } from '@systems/combat/CombatController';
import { CombatEncounter, CombatantInit } from '@systems/combat/CombatEncounter';
import { createDefaultStats } from '@entities/CharacterStats';

function mkController(): CombatController {
  const player: CombatantInit = { id: 'player', name: 'Hero', isPlayer: true, stats: createDefaultStats(), health: { current: 100, max: 100 } };
  const enemyStats = createDefaultStats();
  const enemy: CombatantInit = { id: 'zara', name: 'Zara', isPlayer: false, stats: enemyStats, health: { current: 100, max: 100 } };
  const enc = new CombatEncounter([player, enemy], { rng: () => 0 });
  return new CombatController(enc, { player: 'Hero', zara: 'Zara' }, 'player', 'zara', enemyStats);
}

describe('CombatOverlay (pure surface, no DOM)', () => {
  let engine: Engine;
  let scene: Scene;
  let overlay: CombatOverlay;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    overlay = new CombatOverlay(scene);
  });

  afterEach(() => {
    overlay.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('starts closed with no controller', () => {
    expect(overlay.isOpen()).toBe(false);
    expect(overlay.getController()).toBeNull();
  });

  it('start() adopts the controller and opens; close() clears it', () => {
    const c = mkController();
    overlay.start(c);
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.getController()).toBe(c);
    overlay.close();
    expect(overlay.isOpen()).toBe(false);
    expect(overlay.getController()).toBeNull();
  });

  it('stores handlers without throwing', () => {
    expect(() => overlay.setHandlers({ onEnd: () => {}, narrate: async (b) => b })).not.toThrow();
  });
});
