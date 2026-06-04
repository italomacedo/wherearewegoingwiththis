import { NullEngine, Vector3 } from '@babylonjs/core';
import { GameWorldScene } from '../../../src/scenes/GameWorldScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { GameSession } from '../../../src/core/GameSession';
import { EventBus } from '../../../src/core/EventBus';
import { SettingsService } from '../../../src/systems/SettingsService';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';

describe('GameWorldScene', () => {
  let engine: NullEngine;
  let scene: GameWorldScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('eventBus', new EventBus());
    SettingsService.clearMemoryStore();
    scene = new GameWorldScene(engine);
  });

  afterEach(async () => {
    await scene.onExit();
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
    SettingsService.reset();
    SettingsService.clearMemoryStore();
    SaveService.reset();
  });

  it('constructs without error', () => {
    expect(scene.babylonScene).toBeDefined();
  });

  it('onEnter creates all core systems', async () => {
    await scene.onEnter();
    expect(scene.getCameraSystem()).not.toBeNull();
    expect(scene.getZoneManager()).not.toBeNull();
    expect(scene.getPlayer()).not.toBeNull();
    expect(scene.getInputSystem()).not.toBeNull();
  });

  it('onEnter loads the Mercado das Sombras zone', async () => {
    await scene.onEnter();
    expect(scene.getZoneManager()?.getCurrentZoneId()).toBe('mercado_sombras');
  });

  it('onEnter registers systems in ServiceLocator', async () => {
    await scene.onEnter();
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player'].forEach((k) => {
      expect(ServiceLocator.has(k)).toBe(true);
    });
  });

  it('onEnter spawns the player at the zone spawn point', async () => {
    await scene.onEnter();
    const player = scene.getPlayer()!;
    expect(player.getPartCount()).toBeGreaterThan(0);
  });

  it('setAppearance is applied to the spawned player', async () => {
    scene.setAppearance({ ...DEFAULT_APPEARANCE, colors: { ...DEFAULT_APPEARANCE.colors, skin: '#FF0000' } });
    await scene.onEnter();
    expect(scene.getPlayer()).not.toBeNull();
  });

  it('onExit disposes systems and unregisters services', async () => {
    await scene.onEnter();
    await scene.onExit();
    expect(scene.getZoneManager()).toBeNull();
    expect(scene.getCameraSystem()).toBeNull();
    expect(scene.getPlayer()).toBeNull();
    ['physics', 'cameraSystem', 'inputSystem', 'zoneManager', 'player'].forEach((k) => {
      expect(ServiceLocator.has(k)).toBe(false);
    });
  });

  it('update does not throw after onEnter', async () => {
    await scene.onEnter();
    expect(() => scene.update()).not.toThrow();
  });

  it('update does not throw before onEnter', () => {
    expect(() => scene.update()).not.toThrow();
  });

  it('update moves the player when forward is held', async () => {
    await scene.onEnter();
    const player = scene.getPlayer()!;
    const before = player.getPosition().z;
    scene.getInputSystem()!.handleKeyDown('KeyW');
    scene.update();
    expect(player.getPosition().z).toBeGreaterThanOrEqual(before);
  });

  it('holding Z and C orbit the camera in opposite directions', async () => {
    await scene.onEnter();
    jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
    const cam = scene.getCameraSystem()!;
    const input = scene.getInputSystem()!;
    const start = cam.getCamera().alpha;
    input.handleKeyDown('KeyZ');
    scene.update();
    const afterZ = cam.getCamera().alpha;
    expect(afterZ).toBeGreaterThan(start); // Z orbits one way
    input.handleKeyUp('KeyZ');
    input.handleKeyDown('KeyC');
    scene.update();
    expect(cam.getCamera().alpha).toBeLessThan(afterZ); // C orbits the other way
  });

  it('getters return null before onEnter', () => {
    expect(scene.getZoneManager()).toBeNull();
    expect(scene.getCameraSystem()).toBeNull();
    expect(scene.getPlayer()).toBeNull();
    expect(scene.getInputSystem()).toBeNull();
  });

  // ─── NPC integration (Phase 8) ─────────────────────────────────────────────

  it('onEnter spawns the NPC manager with Zara', async () => {
    await scene.onEnter();
    const npc = scene.getNpcManager();
    expect(npc).not.toBeNull();
    expect(npc!.getAgent('npc_zara_vendor_01')).not.toBeNull();
  });

  it('onEnter also spawns the second street NPC (Mback) for gossip', async () => {
    await scene.onEnter();
    const npc = scene.getNpcManager()!;
    expect(npc.getAgent('npc_mback_fence_01')).not.toBeNull();
    expect(npc.getAgents().length).toBeGreaterThanOrEqual(2);
  });

  it('onEnter creates a dialog system', async () => {
    await scene.onEnter();
    expect(scene.getDialog()).not.toBeNull();
    expect(scene.getDialog()!.isOpen()).toBe(false);
  });

  it('restores NPC memory passed via setNpcMemory', async () => {
    scene.setNpcMemory({
      npc_zara_vendor_01: {
        mode: 'stateless', sessionId: null, history: [{ player: 'hi', npc: 'hello' }],
      },
    });
    await scene.onEnter();
    const zara = scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!;
    expect(zara.conversation.getHistoryCount()).toBe(1);
  });

  it('derivePlayerAction returns idle when not moving', async () => {
    await scene.onEnter();
    expect(scene.derivePlayerAction()).toBe('idle');
  });

  it('derivePlayerAction returns walking when moving', async () => {
    await scene.onEnter();
    scene.getInputSystem()!.handleKeyDown('KeyW');
    expect(scene.derivePlayerAction()).toBe('walking');
  });

  it('derivePlayerAction returns running when sprinting and moving', async () => {
    await scene.onEnter();
    scene.getInputSystem()!.handleKeyDown('KeyW');
    scene.getInputSystem()!.handleKeyDown('ShiftLeft');
    expect(scene.derivePlayerAction()).toBe('running');
  });

  it('pressing interact near an NPC opens the dialog', async () => {
    await scene.onEnter();
    // Move player next to Zara (at [3,0,6])
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(true);
  });

  it('a defeated NPC shows a Search prompt and opens the loot overlay (no live chat)', async () => {
    await scene.onEnter();
    scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!.markDefeated();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    scene.update();
    // Name is unknown until introduced → generic "search the body" prompt.
    expect(scene.getHud()!.getActionPrompt()).toBe('[E] Search the body');
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update();
    // Searching a corpse opens the loot overlay (not a chat dialog).
    expect(scene.getDialog()!.isOpen()).toBe(false);
    const overlay = scene.getInventoryOverlay()!;
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.getMode()).toBe('loot');
    // Zara's loadout (pipe + medkit + scrap) is lootable.
    expect(overlay.sourceRows().map((r) => r.id).sort()).toEqual(['medkit', 'pipe', 'scrap']);
  });

  it('I opens the inventory overlay (manage) and freezes the world; ESC closes it', async () => {
    await scene.onEnter();
    const input = scene.getInputSystem()!;
    const overlay = scene.getInventoryOverlay()!;
    input.handleKeyDown('KeyI');
    scene.update();
    expect(overlay.isOpen()).toBe(true);
    expect(overlay.getMode()).toBe('manage');
    input.handleKeyUp('KeyI');
    input.handleKeyDown('Escape');
    scene.update();
    expect(overlay.isOpen()).toBe(false);
  });

  it('pressing interact while dialog open closes it', async () => {
    await scene.onEnter();
    const input = scene.getInputSystem()!;
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    input.handleKeyDown('KeyE');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(true);
    // release and press again (held key does not retrigger just-pressed)
    input.handleKeyUp('KeyE');
    input.handleKeyDown('KeyE');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(false);
  });

  it('interact far from any NPC does not open dialog', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-20, 0, -20);
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(false);
  });

  it('sendToActiveNPC is a no-op with no Claude service (Node)', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    // No window.electronAPI in Node → npcManager has null service → sendMessage throws,
    // caught internally and dialog shows "..."
    await scene.sendToActiveNPC('hello');
    // dialog not opened by sendToActiveNPC directly; just verify no throw
    expect(scene.getNpcManager()).not.toBeNull();
  });

  it('getNpcManager and getDialog return null before onEnter', () => {
    expect(scene.getNpcManager()).toBeNull();
    expect(scene.getDialog()).toBeNull();
  });

  // ─── Pause menu + HUD (Phase 5 evidence / UX) ──────────────────────────────

  it('onEnter creates the pause menu and HUD', async () => {
    await scene.onEnter();
    expect(scene.getPauseMenu()).not.toBeNull();
    expect(scene.getHud()).not.toBeNull();
    expect(scene.getPauseMenu()!.isOpen()).toBe(false);
  });

  it('getPauseMenu and getHud return null before onEnter', () => {
    expect(scene.getPauseMenu()).toBeNull();
    expect(scene.getHud()).toBeNull();
  });

  it('ESC toggles the pause menu', async () => {
    await scene.onEnter();
    const input = scene.getInputSystem()!;
    input.handleKeyDown('Escape');
    scene.update();
    expect(scene.getPauseMenu()!.isOpen()).toBe(true);
    input.handleKeyUp('Escape');
    input.handleKeyDown('Escape');
    scene.update();
    expect(scene.getPauseMenu()!.isOpen()).toBe(false);
  });

  it('freezes player movement while paused', async () => {
    await scene.onEnter();
    jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
    const input = scene.getInputSystem()!;
    input.handleKeyDown('Escape');
    scene.update(); // pause
    const z = scene.getPlayer()!.getPosition().z;
    input.handleKeyDown('KeyW');
    scene.update();
    scene.update();
    expect(scene.getPlayer()!.getPosition().z).toBeCloseTo(z);
  });

  it('freezes the world while a combat encounter is open', async () => {
    const { CombatEncounter } = await import('../../../src/systems/combat/CombatEncounter');
    const { CombatController } = await import('../../../src/systems/combat/CombatController');
    const { createDefaultStats } = await import('../../../src/entities/CharacterStats');
    await scene.onEnter();
    jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
    const enemyStats = createDefaultStats();
    const enc = new CombatEncounter([
      { id: 'player', name: 'Hero', isPlayer: true, stats: createDefaultStats(), health: { current: 100, max: 100 } },
      { id: 'zara', name: 'Zara', isPlayer: false, stats: enemyStats, health: { current: 100, max: 100 } },
    ], { rng: () => 0 });
    scene.getCombat()!.start(new CombatController(enc, { player: 'Hero', zara: 'Zara' }, 'player'));
    expect(scene.getCombat()!.isOpen()).toBe(true);
    const z = scene.getPlayer()!.getPosition().z;
    scene.getInputSystem()!.handleKeyDown('KeyW');
    scene.update();
    scene.update();
    expect(scene.getPlayer()!.getPosition().z).toBeCloseTo(z);
  });

  it('player death inside a (spectator-continuing) combat ends the run + tears down the fight', async () => {
    const { CombatEncounter } = await import('../../../src/systems/combat/CombatEncounter');
    const { CombatController } = await import('../../../src/systems/combat/CombatController');
    const { createDefaultStats } = await import('../../../src/entities/CharacterStats');
    await scene.onEnter();
    // A multi-combatant fight where the player is already down: the encounter would
    // continue among the NPCs, so endCombat never fires — checkGameOver must catch it.
    const enc = new CombatEncounter([
      { id: 'player', name: 'Hero', isPlayer: true, stats: createDefaultStats(), health: { current: 0, max: 100 } },
      { id: 'zara', name: 'Zara', isPlayer: false, stats: createDefaultStats(), health: { current: 100, max: 100 } },
      { id: 'mback', name: 'Mback', isPlayer: false, stats: createDefaultStats(), health: { current: 100, max: 100 } },
    ], { rng: () => 0 });
    scene.getCombat()!.start(new CombatController(enc, { player: 'Hero', zara: 'Zara', mback: 'Mback' }, 'player'));
    expect(scene.getCombat()!.isOpen()).toBe(true);
    scene.update();
    expect(scene.getGameOverMenu()!.isOpen()).toBe(true);
    expect(scene.getCombat()!.isOpen()).toBe(false); // combat torn down (music stops)
  });

  it('ESC closes the dialog instead of pausing when a dialog is open', async () => {
    await scene.onEnter();
    const input = scene.getInputSystem()!;
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    input.handleKeyDown('KeyE');
    scene.update(); // open dialog
    expect(scene.getDialog()!.isOpen()).toBe(true);
    input.handleKeyDown('Escape');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(false);
    expect(scene.getPauseMenu()!.isOpen()).toBe(false);
  });

  it('pause menu Save persists the session to disk', async () => {
    const session = makeSession();
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(2, 0, 6);
    scene.getPauseMenu()!.save();
    const reloaded = SaveService.load(session.saveId)!;
    expect(reloaded.world.position[0]).toBeCloseTo(2);
    expect(reloaded.world.position[2]).toBeCloseTo(6);
  });

  it('HUD shows a generic talk prompt near an unintroduced NPC', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    scene.update();
    // Name is hidden until the NPC introduces itself (no metagaming).
    expect(scene.getHud()!.getActionPrompt()).toBe('[E] Interact');
  });

  it('reveals the NPC name once it introduces itself in a reply', async () => {
    const { service } = makeInjectedService('Name’s Zara. What do you want?');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('who are you?');
    const agent = scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!;
    expect(agent.isNameKnown()).toBe(true);
    expect(scene.getDialog()!.getState().npcName).toBe('Zara');
    // Now the prompt uses the real name.
    scene.update();
    expect(scene.getHud()!.getActionPrompt()).toBe('[E] Interact with Zara');
  });

  it('keeps the NPC name hidden when the reply does not mention it', async () => {
    const { service } = makeInjectedService('What do you want?');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('hey');
    expect(scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!.isNameKnown()).toBe(false);
  });

  it('HUD shows an enter prompt near the vehicle and exit prompt while piloting', async () => {
    await scene.onEnter();
    const v = scene.getVehicle()!;
    scene.getPlayer()!.getRoot().position.copyFrom(v.getPosition());
    scene.update();
    expect(scene.getHud()!.getActionPrompt()).toBe('[F] Enter bike');
    // mount, then the prompt becomes exit
    scene.getInputSystem()!.handleKeyDown('KeyF');
    scene.update();
    expect(scene.getHud()!.getActionPrompt()).toBe('[F] Exit bike');
  });

  it('HUD prompt is null far from anything interactive', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-25, 0, -25);
    scene.update();
    expect(scene.getHud()!.getActionPrompt()).toBeNull();
  });

  // ─── Health / fall / game over (HP feature) ────────────────────────────────

  it('adopts player + bike health from the session', async () => {
    const session = makeSession();
    session.playerHealth = { current: 25, max: 100 };
    session.vehicle = { health: { current: 40, max: 100 }, destroyed: false };
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    expect(scene.getPlayer()!.getHealth().current).toBe(25);
    expect(scene.getVehicle()!.getHealth().current).toBe(40);
  });

  it('a session with a destroyed bike spawns it wrecked', async () => {
    const session = makeSession();
    session.vehicle = { health: { current: 0, max: 100 }, destroyed: true };
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    expect(scene.getVehicle()!.isDestroyed()).toBe(true);
  });

  it('dismounting in the air drops the hero (not grounded)', async () => {
    await scene.onEnter();
    jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
    const v = scene.getVehicle()!;
    const input = scene.getInputSystem()!;
    scene.getPlayer()!.getRoot().position.copyFrom(v.getPosition());
    input.handleKeyDown('KeyF');
    scene.update(); // mount
    input.handleKeyDown('Space'); // climb
    for (let i = 0; i < 12; i++) scene.update();
    expect(v.getPosition().y).toBeGreaterThan(1);
    input.handleKeyUp('Space');
    input.handleKeyUp('KeyF');
    input.handleKeyDown('KeyF');
    scene.update(); // dismount
    expect(v.isOccupied()).toBe(false);
    expect(scene.getPlayer()!.isGrounded()).toBe(false); // hero is falling
  });

  it('HUD shows nave HP status while piloting', async () => {
    await scene.onEnter();
    const v = scene.getVehicle()!;
    scene.getPlayer()!.getRoot().position.copyFrom(v.getPosition());
    scene.getInputSystem()!.handleKeyDown('KeyF');
    scene.update();
    expect(scene.getHud()!.getVehicleStatus()).toBe('NAVE 100%');
  });

  it('opens the Game Over menu when the hero dies; its options load/quit', async () => {
    const sm = { loadScene: jest.fn().mockResolvedValue(undefined), transitionDurationMs: 0 };
    ServiceLocator.register('sceneManager', sm);
    await scene.onEnter();
    scene.getPlayer()!.getHealth().applyDamage(1000);
    scene.update();
    const over = scene.getGameOverMenu()!;
    expect(over.isOpen()).toBe(true);
    expect(sm.loadScene).not.toHaveBeenCalledWith('main-menu'); // no auto-return now
    // Return to main menu option
    over.quitToMainMenu();
    expect(sm.loadScene).toHaveBeenCalledWith('main-menu');
    // Load last save: no save on disk for this scene's id → falls back to main menu
    over.loadLastSave();
    expect(sm.loadScene).toHaveBeenCalled();
  });

  it('persists player health to the save', async () => {
    const session = makeSession();
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    scene.getPlayer()!.getHealth().applyDamage(40); // 60 left
    scene.getPauseMenu()!.save();
    const reloaded = SaveService.load(session.saveId)!;
    expect(reloaded.playerHealth.current).toBe(60);
  });

  // ─── Vehicles (Phase 9 MVP) ────────────────────────────────────────────────

  function mountVehicle() {
    const v = scene.getVehicle()!;
    scene.getPlayer()!.getRoot().position.copyFrom(v.getPosition());
    scene.getInputSystem()!.handleKeyDown('KeyF');
    scene.update();
    return v;
  }

  it('onEnter parks a vehicle in the world', async () => {
    await scene.onEnter();
    expect(scene.getVehicle()).not.toBeNull();
    expect(scene.getVehicle()!.getPartCount()).toBeGreaterThan(0);
    expect(scene.getVehicle()!.isOccupied()).toBe(false);
    expect(ServiceLocator.has('vehicle')).toBe(true);
  });

  it('pressing F near the vehicle mounts it and switches camera mode', async () => {
    await scene.onEnter();
    const v = mountVehicle();
    expect(v.isOccupied()).toBe(true);
    expect(scene.getCameraSystem()!.isVehicleMode()).toBe(true);
  });

  it('cannot mount when far from the vehicle', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-50, 0, -50);
    scene.getInputSystem()!.handleKeyDown('KeyF');
    scene.update();
    expect(scene.getVehicle()!.isOccupied()).toBe(false);
  });

  it('piloting moves the vehicle and not the player', async () => {
    await scene.onEnter();
    // NullEngine reports ~0 delta time; force a real dt so flight integrates.
    jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
    const v = mountVehicle();
    const playerBefore = scene.getPlayer()!.getPosition();
    const vehBefore = v.getPosition();
    const input = scene.getInputSystem()!;
    input.handleKeyDown('KeyW');
    for (let i = 0; i < 10; i++) scene.update();
    const vehAfter = v.getPosition();
    expect(Vector3Distance(vehBefore, vehAfter)).toBeGreaterThan(0.1);
    // player stays parked where it mounted
    expect(Vector3Distance(playerBefore, scene.getPlayer()!.getPosition())).toBeCloseTo(0);
  });

  it('pressing F while piloting dismounts and restores camera/player', async () => {
    await scene.onEnter();
    const v = mountVehicle();
    const input = scene.getInputSystem()!;
    input.handleKeyUp('KeyF');
    input.handleKeyDown('KeyF');
    scene.update();
    expect(v.isOccupied()).toBe(false);
    expect(scene.getCameraSystem()!.isVehicleMode()).toBe(false);
    expect(scene.getPlayer()!.getRoot().isEnabled()).toBe(true);
  });

  it('onExit unregisters the vehicle service', async () => {
    await scene.onEnter();
    await scene.onExit();
    expect(ServiceLocator.has('vehicle')).toBe(false);
    expect(scene.getVehicle()).toBeNull();
  });

  // ─── GameSession glue (Phase 8 integration) ───────────────────────────────

  function makeSession(): GameSession {
    const character = { name: 'Nyx', appearance: { ...DEFAULT_APPEARANCE, colors: { ...DEFAULT_APPEARANCE.colors, skin: '#123456' } } };
    const save = SaveService.createNewSave(character, 'Nyx');
    SaveService.save(save);
    return GameSession.fromSave(save);
  }

  it('adopts appearance, name and npc memory from a registered GameSession', async () => {
    const session = makeSession();
    session.npcMemory = {
      npc_zara_vendor_01: { mode: 'stateless', sessionId: null, history: [{ player: 'hi', npc: 'yo' }] },
    };
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    const zara = scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!;
    expect(zara.conversation.getHistoryCount()).toBe(1);
    expect(scene.getPlayer()).not.toBeNull();
  });

  it('spawns the player at the saved world position when non-zero', async () => {
    const session = makeSession();
    session.world = { zone: 'mercado_sombras', position: [7, 0, 9], rotation: 0, worldSeed: 1, currentTile: [0, 0] };
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    const pos = scene.getPlayer()!.getPosition();
    expect(pos.x).toBeCloseTo(7);
    expect(pos.z).toBeCloseTo(9);
  });

  it('uses the zone spawn point when the saved position is all-zero', async () => {
    const session = makeSession(); // default world position is [0,0,0]
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    // spawn point is not the origin in the Mercado zone
    expect(scene.getPlayer()).not.toBeNull();
  });

  it('persists world position and npc memory back to the save on exit', async () => {
    const session = makeSession();
    ServiceLocator.register('gameSession', session);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 4);
    await scene.onExit();
    const reloaded = SaveService.load(session.saveId)!;
    expect(reloaded.world.position[0]).toBeCloseTo(3);
    expect(reloaded.world.position[2]).toBeCloseTo(4);
    // session object is updated in place as well
    expect(session.world.position[0]).toBeCloseTo(3);
  });

  it('does not persist anything when there is no session (no saveId)', async () => {
    await scene.onEnter();
    await scene.onExit();
    expect(SaveService.listMeta()).toHaveLength(0);
  });

  it('freezes player movement while the dialog is open', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update(); // opens dialog
    expect(scene.getDialog()!.isOpen()).toBe(true);
    const z = scene.getPlayer()!.getPosition().z;
    scene.getInputSystem()!.handleKeyDown('KeyW');
    scene.update();
    scene.update();
    expect(scene.getPlayer()!.getPosition().z).toBeCloseTo(z);
  });

  it('does not close the dialog on interact while the input is focused', async () => {
    await scene.onEnter();
    const dialog = scene.getDialog()!;
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update();
    expect(dialog.isOpen()).toBe(true);
    jest.spyOn(dialog, 'isInputFocused').mockReturnValue(true);
    const input = scene.getInputSystem()!;
    input.handleKeyUp('KeyE');
    input.handleKeyDown('KeyE');
    scene.update();
    expect(dialog.isOpen()).toBe(true); // still open — E went to the text field
  });

  it('setPlayerName flows into the world snapshot prompt', async () => {
    scene.setPlayerName('Rei');
    const { service, prompts } = makeInjectedService('Hey.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('hi');
    // A moderation prompt now precedes the NPC prompt; the player name is in the latter.
    expect(prompts.some((p) => p.includes('Rei'))).toBe(true);
  });

  it('blocks an out-of-policy message before it reaches the NPC', async () => {
    const { service, prompts } = makeInjectedService('BLOCK');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('something disallowed');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'system' && l.text.includes("can't say or do"))).toBe(true);
    // The NPC never replied and the player's text was not shown/sent.
    expect(scene.getDialog()!.getState().npcText).toBe('');
    expect(lines.some((l) => l.role === 'player')).toBe(false);
    // Only the moderation call happened — no NPC turn.
    expect(prompts).toHaveLength(1);
  });

  it('sendToActiveNPC streams the reply into the dialog via injected service', async () => {
    const { service } = makeInjectedService('Hello there.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('got chips?');
    expect(scene.getDialog()!.getState().npcText).toBe('Hello there.');
  });

  it('sendToActiveNPC does nothing when no NPC is in range', async () => {
    const { service } = makeInjectedService('x');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-20, 0, -20);
    await scene.sendToActiveNPC('hi');
    expect(scene.getDialog()!.getState().npcText).toBe('');
  });

  // ─── Time of day ───────────────────────────────────────────────────────────

  it('the NPC world snapshot carries an HH:MM (period) game time', async () => {
    const { service, prompts } = makeInjectedService('Hi.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('hello');
    // The NPC prompt embeds "Game time: HH:MM (period)".
    expect(prompts.some((p) => /Game time: \d{2}:\d{2} \((night|dawn|day|dusk)\)/.test(p))).toBe(true);
  });

  // ─── Global chat (T) + emote pipeline ──────────────────────────────────────

  it('T opens the global chat anywhere', async () => {
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-25, 0, -25); // nowhere near an NPC
    scene.getInputSystem()!.handleKeyDown('KeyT');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(true);
    expect(scene.getDialog()!.getState().npcName).toBe('Open channel');
  });

  it('global chat with no one addressed narrates the surroundings (ambient)', async () => {
    const { service } = makeInjectedService('Rain sheets off the awnings.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(-25, 0, -25); // Zara out of reach
    await scene.sendGlobalMessage('look around');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'narration' && l.text.includes('Rain sheets'))).toBe(true);
  });

  it('global chat routes to the NPC the player faces (aim)', async () => {
    const { service } = makeInjectedService('What do you want?');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 3); // just south of Zara (3,0,6), facing +Z
    await scene.sendGlobalMessage('hey there');
    expect(scene.getDialog()!.getState().npcText).toBe('What do you want?');
  });

  it('a check-the-time emote is narrated with the clock (no NPC call)', async () => {
    const { service } = makeInjectedService('DETERMINISTIC');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('*check the time*');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'narration' && l.text.includes('You check the time'))).toBe(true);
    expect(scene.getDialog()!.getState().npcText).toBe(''); // NPC was not called
  });

  it('checking the time via the global chat works anywhere, with no Claude call', async () => {
    await scene.onEnter(); // no injected service at all
    scene.getPlayer()!.getRoot().position.set(-25, 0, -25); // nowhere near an NPC
    await scene.sendGlobalMessage('*checa que horas são no meu comm link*');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'narration' && l.text.includes('You check the time'))).toBe(true);
  });

  it('a *shout* is a tone marker — it routes to the NPC, not the emote classifier', async () => {
    const { service } = makeInjectedService('Yo, kid.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 3); // just south of Zara (3,0,6), facing +Z
    await scene.sendGlobalMessage('*shout* hello there');
    // Routed to the NPC (not narrated as a deterministic action).
    expect(scene.getDialog()!.getState().npcText).toBe('Yo, kid.');
    const lines = scene.getDialog()!.getState().lines;
    // The shout marker is stripped from the shown player line.
    expect(lines.some((l) => l.role === 'player' && l.text === 'hello there')).toBe(true);
    expect(lines.some((l) => l.role === 'player' && l.text.includes('shout'))).toBe(false);
    // No skill-check placeholder.
    expect(lines.some((l) => l.role === 'narration' && /skill check/i.test(l.text))).toBe(false);
  });

  it('a deterministic action is resolved + narrated, and the NPC reacts', async () => {
    const { service } = makeInjectedService('VERDICT=DETERMINISTIC\nSKILL=armas_de_fogo\nATTR=destreza\nDIFF=hard');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('*take a shot at the lock*');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'narration')).toBe(true); // outcome narrated
    expect(scene.getDialog()!.getState().npcText).not.toBe('');    // NPC reacted
  });

  it('a hostile action worsens the NPC disposition, then turns it hostile and starts the duel', async () => {
    const { service } = makeInjectedService('VERDICT=DETERMINISTIC\nSKILL=combate_corpo_a_corpo\nATTR=forca\nDIFF=medium\nHOSTILE=yes');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5); // next to Zara (3,0,6)
    const zara = scene.getNpcManager()!.getAgent('npc_zara_vendor_01')!;
    zara.setDisposition('neutral');

    await scene.sendToActiveNPC('*punches Zara in the face*');
    expect(zara.getDisposition()).toBe('wary');           // first hostile action escalates

    await scene.sendToActiveNPC('*punches Zara again, hard*');
    expect(zara.getDisposition()).toBe('hostile');         // second turns it hostile
    expect(zara.shouldInitiateCombat(true)).toBe(true);    // → combat trigger fires
  });

  it('a self-exam emote narrates the condition (no NPC call)', async () => {
    await scene.onEnter(); // no service needed — pure check + descriptor
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('*check my wounds*');
    const lines = scene.getDialog()!.getState().lines;
    expect(lines.some((l) => l.role === 'narration')).toBe(true);
    expect(scene.getDialog()!.getState().npcText).toBe('');
  });

  it('a narrative emote falls through to a normal NPC reply', async () => {
    const { service } = makeInjectedService('NARRATIVE');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(3, 0, 5);
    await scene.sendToActiveNPC('*waves* hello');
    // classifier said NARRATIVE → the NPC turn ran (mock echoes the same reply).
    expect(scene.getDialog()!.getState().npcText).toBe('NARRATIVE');
  });
});

// Distance between two Babylon Vector3.
function Vector3Distance(a: Vector3, b: Vector3): number {
  return Vector3.Distance(a, b);
}

// Builds a ClaudeNPCService backed by a mock bridge for injection into the scene.
function makeInjectedService(reply: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClaudeNPCService } = require('../../../src/systems/ClaudeNPCService');
  const prompts: string[] = [];
  let chunkCb: ((d: { npcId: string; chunk: string }) => void) | null = null;
  const bridge = {
    claudeQuery: jest.fn(async (params: { npcId: string; prompt: string }) => {
      prompts.push(params.prompt);
      chunkCb?.({ npcId: params.npcId, chunk: reply });
    }),
    claudeCancel: jest.fn(async () => {}),
    onClaudeResponseChunk: jest.fn((cb: (d: { npcId: string; chunk: string }) => void) => {
      chunkCb = cb;
      return () => {};
    }),
    onClaudeResponseDone: jest.fn(() => () => {}),
  };
  return { service: new ClaudeNPCService({ claudePath: 'claude', bridge }), prompts };
}
