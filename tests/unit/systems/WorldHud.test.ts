import { NullEngine, Scene, MeshBuilder } from '@babylonjs/core';
import { WorldHud } from '../../../src/systems/WorldHud';

describe('WorldHud', () => {
  let engine: NullEngine;
  let scene: Scene;
  let hud: WorldHud;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    hud = new WorldHud(scene);
  });

  afterEach(() => {
    hud.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('has no action prompt initially', () => {
    expect(hud.getActionPrompt()).toBeNull();
  });

  it('setActionPrompt updates the prompt', () => {
    hud.setActionPrompt('[E] Talk to Zara');
    expect(hud.getActionPrompt()).toBe('[E] Talk to Zara');
  });

  it('setActionPrompt(null) clears the prompt', () => {
    hud.setActionPrompt('[F] Enter bike');
    hud.setActionPrompt(null);
    expect(hud.getActionPrompt()).toBeNull();
  });

  it('setting the same prompt value is a no-op (no throw)', () => {
    hud.setActionPrompt('x');
    expect(() => hud.setActionPrompt('x')).not.toThrow();
    expect(hud.getActionPrompt()).toBe('x');
  });

  it('addLabel tracks text by key and setLabelText updates it', () => {
    const mesh = MeshBuilder.CreateBox('m', { size: 1 }, scene);
    expect(() => hud.addLabel(mesh, 'Unknown', 'npc')).not.toThrow();
    expect(hud.getLabelText('npc')).toBe('Unknown');
    hud.setLabelText('npc', 'Zara');
    expect(hud.getLabelText('npc')).toBe('Zara');
  });

  it('setLabelText on an unknown key is a no-op', () => {
    expect(() => hud.setLabelText('missing', 'x')).not.toThrow();
    expect(hud.getLabelText('missing')).toBeNull();
  });

  it('player health starts full and updates', () => {
    expect(hud.getPlayerHealth()).toBe(1);
    hud.setPlayerHealth(0.5);
    expect(hud.getPlayerHealth()).toBe(0.5);
  });

  it('clamps the player health fraction to [0,1]', () => {
    hud.setPlayerHealth(2);
    expect(hud.getPlayerHealth()).toBe(1);
    hud.setPlayerHealth(-3);
    expect(hud.getPlayerHealth()).toBe(0);
  });

  it('vehicle status starts null and updates', () => {
    expect(hud.getVehicleStatus()).toBeNull();
    hud.setVehicleStatus('BIKE 50%');
    expect(hud.getVehicleStatus()).toBe('BIKE 50%');
    hud.setVehicleStatus(null);
    expect(hud.getVehicleStatus()).toBeNull();
  });

  it('dispose resets prompt and vehicle status', () => {
    hud.setActionPrompt('x');
    hud.setVehicleStatus('BIKE 10%');
    hud.dispose();
    expect(hud.getActionPrompt()).toBeNull();
    expect(hud.getVehicleStatus()).toBeNull();
  });
});
