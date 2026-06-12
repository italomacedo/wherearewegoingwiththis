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
    hud.setActionPrompt('[F] Enter car');
    hud.setActionPrompt(null);
    expect(hud.getActionPrompt()).toBeNull();
  });

  it('setting the same prompt value is a no-op (no throw)', () => {
    hud.setActionPrompt('x');
    expect(() => hud.setActionPrompt('x')).not.toThrow();
    expect(hud.getActionPrompt()).toBe('x');
  });

  it('tracks bottom-HUD text visibility (hidden during combat) idempotently', () => {
    expect(hud.isHudTextVisible()).toBe(true);
    hud.setHudTextVisible(false);
    expect(hud.isHudTextVisible()).toBe(false);
    expect(() => hud.setHudTextVisible(false)).not.toThrow(); // no-op when unchanged
    hud.setHudTextVisible(true);
    expect(hud.isHudTextVisible()).toBe(true);
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
    hud.setVehicleStatus('CAR 50%');
    expect(hud.getVehicleStatus()).toBe('CAR 50%');
    hud.setVehicleStatus(null);
    expect(hud.getVehicleStatus()).toBeNull();
  });

  it('stamina and hunger fractions start full, update and clamp', () => {
    expect(hud.getPlayerStamina()).toBe(1);
    expect(hud.getPlayerHunger()).toBe(1);
    hud.setPlayerStamina(0.4);
    hud.setPlayerHunger(0.7);
    expect(hud.getPlayerStamina()).toBe(0.4);
    expect(hud.getPlayerHunger()).toBe(0.7);
    hud.setPlayerStamina(5);
    hud.setPlayerHunger(-1);
    expect(hud.getPlayerStamina()).toBe(1);
    expect(hud.getPlayerHunger()).toBe(0);
    expect(() => hud.setPlayerStamina(1)).not.toThrow(); // no-op when unchanged
    expect(() => hud.setPlayerHunger(0)).not.toThrow();
  });

  it('healthBarColor maps fraction to green/amber/red', () => {
    expect(WorldHud.healthBarColor(1)).toBe('#4CAF50');
    expect(WorldHud.healthBarColor(0.51)).toBe('#4CAF50');
    expect(WorldHud.healthBarColor(0.5)).toBe('#FFC04D');
    expect(WorldHud.healthBarColor(0.26)).toBe('#FFC04D');
    expect(WorldHud.healthBarColor(0.25)).toBe('#FF5566');
    expect(WorldHud.healthBarColor(0)).toBe('#FF5566');
  });

  it('pushToast queues gain notifications and updateToasts prunes expired ones', () => {
    hud.pushToast('Atletismo +0.1', 1000);
    hud.pushToast('Pilotagem +0.1', 2000);
    expect(hud.getToastTexts()).toEqual(['Atletismo +0.1', 'Pilotagem +0.1']);
    hud.updateToasts(2500); // none expired yet
    expect(hud.getToastTexts()).toHaveLength(2);
    hud.updateToasts(1000 + 3000 + 1); // first toast past its ttl
    expect(hud.getToastTexts()).toEqual(['Pilotagem +0.1']);
  });

  it('dispose clears the toasts', () => {
    hud.pushToast('x', 0);
    hud.dispose();
    expect(hud.getToastTexts()).toHaveLength(0);
  });

  it('dispose resets prompt and vehicle status', () => {
    hud.setActionPrompt('x');
    hud.setVehicleStatus('CAR 10%');
    hud.dispose();
    expect(hud.getActionPrompt()).toBeNull();
    expect(hud.getVehicleStatus()).toBeNull();
  });
});
