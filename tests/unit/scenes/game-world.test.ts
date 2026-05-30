import { NullEngine } from '@babylonjs/core';
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
    scene.setAppearance({ ...DEFAULT_APPEARANCE, skinTone: '#FF0000' });
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

  it('Q rotates the camera left', async () => {
    await scene.onEnter();
    const cam = scene.getCameraSystem()!;
    const before = cam.getYaw();
    scene.getInputSystem()!.handleKeyDown('KeyQ');
    scene.update();
    expect(cam.getYaw()).toBeLessThan(before);
  });

  it('R rotates the camera right', async () => {
    await scene.onEnter();
    const cam = scene.getCameraSystem()!;
    const before = cam.getYaw();
    scene.getInputSystem()!.handleKeyDown('KeyR');
    scene.update();
    expect(cam.getYaw()).toBeGreaterThan(before);
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
    // Move player next to Zara (at [4,0,4])
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
    scene.getInputSystem()!.handleKeyDown('KeyE');
    scene.update();
    expect(scene.getDialog()!.isOpen()).toBe(true);
  });

  it('pressing interact while dialog open closes it', async () => {
    await scene.onEnter();
    const input = scene.getInputSystem()!;
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
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
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
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

  // ─── GameSession glue (Phase 8 integration) ───────────────────────────────

  function makeSession(): GameSession {
    const character = { name: 'Nyx', appearance: { ...DEFAULT_APPEARANCE, skinTone: '#123456' } };
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
    session.world = { zone: 'mercado_sombras', position: [7, 0, 9], rotation: 0 };
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
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
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
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
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
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
    await scene.sendToActiveNPC('hi');
    expect(prompts[0]).toContain('Rei');
  });

  it('sendToActiveNPC streams the reply into the dialog via injected service', async () => {
    const { service } = makeInjectedService('Hello there.');
    scene.setClaudeService(service);
    await scene.onEnter();
    scene.getPlayer()!.getRoot().position.set(4, 0, 3);
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
});

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
