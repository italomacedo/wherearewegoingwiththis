import { Vector3 } from '@babylonjs/core';
import { NPCManager, COOLDOWN_SECONDS } from '../../../src/systems/NPCManager';
import { ClaudeNPCService, ClaudeBridge } from '../../../src/systems/ClaudeNPCService';
import { NPCDefinition } from '../../../src/entities/NPCAgent';
import { ConversationContext } from '../../../src/systems/npc/ConversationContext';
import { WorldSnapshot } from '../../../src/systems/npc/PromptBuilder';
import { createZara } from '../../../src/entities/npcs/zara';

const def: NPCDefinition = {
  id: 'npc_a',
  name: 'A',
  role: 'vendor',
  location: 'L',
  personalityPrompt: 'x',
  defaultMood: 'neutral',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [0, 0, 0],
};

const world: WorldSnapshot = {
  cityName: 'NeoBeiraRio', gameTime: '12:00, day 1', playerName: 'Kai',
  distanceMeters: 2, playerAction: 'idle', recentEvents: [],
};

describe('NPCManager', () => {
  let manager: NPCManager;

  beforeEach(() => {
    manager = new NPCManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('spawn registers an agent', () => {
    const agent = manager.spawn(def);
    expect(manager.getAgent('npc_a')).toBe(agent);
  });

  it('getAgent returns null for unknown id', () => {
    expect(manager.getAgent('missing')).toBeNull();
  });

  it('getAgents lists all spawned agents', () => {
    manager.spawn(def);
    manager.spawn({ ...def, id: 'npc_b' });
    expect(manager.getAgents()).toHaveLength(2);
  });

  it('spawn accepts a restored conversation', () => {
    const ctx = new ConversationContext();
    ctx.recordExchange('hi', 'hello');
    const agent = manager.spawn(def, ctx);
    expect(agent.conversation.getHistoryCount()).toBe(1);
  });

  it('update drives proximity state', () => {
    const agent = manager.spawn(def);
    manager.update(new Vector3(5, 0, 0), 'idle', 0.016);
    expect(agent.getState()).toBe('aware');
  });

  it('getConversableAgent returns nearby talkable NPC', () => {
    manager.spawn(def);
    const found = manager.getConversableAgent(new Vector3(2, 0, 0));
    expect(found?.definition.id).toBe('npc_a');
  });

  it('getConversableAgent returns null when none in range', () => {
    manager.spawn(def);
    expect(manager.getConversableAgent(new Vector3(10, 0, 0))).toBeNull();
  });

  it('getConversableAgent picks the nearest of several', () => {
    manager.spawn({ ...def, id: 'far', position: [2.5, 0, 0] });
    manager.spawn({ ...def, id: 'near', position: [1, 0, 0] });
    const found = manager.getConversableAgent(new Vector3(0, 0, 0));
    expect(found?.definition.id).toBe('near');
  });

  it('getConversableAgent skips busy NPCs', () => {
    const agent = manager.spawn(def);
    agent.beginResponse();
    expect(manager.getConversableAgent(new Vector3(2, 0, 0))).toBeNull();
  });

  // ─── Cooldown ──────────────────────────────────────────────────────────────

  it('cooldown elapses over successive updates', async () => {
    const { service } = makeService('hi there');
    manager = new NPCManager(service);
    const agent = manager.spawn(def);
    await manager.sendMessage('npc_a', world, 'hello');
    expect(agent.getState()).toBe('cooldown');

    // advance time past cooldown
    manager.update(new Vector3(2, 0, 0), 'idle', COOLDOWN_SECONDS + 0.1);
    expect(agent.getState()).toBe('aware');
  });

  it('cooldown decrements without ending early', async () => {
    const { service } = makeService('ok');
    manager = new NPCManager(service);
    const agent = manager.spawn(def);
    await manager.sendMessage('npc_a', world, 'hello');
    manager.update(new Vector3(2, 0, 0), 'idle', 1); // < COOLDOWN_SECONDS
    expect(agent.getState()).toBe('cooldown');
  });

  // ─── sendMessage ─────────────────────────────────────────────────────────

  it('sendMessage routes through the service and returns the reply', async () => {
    const { service } = makeService('Hello.');
    manager = new NPCManager(service);
    manager.spawn(def);
    const reply = await manager.sendMessage('npc_a', world, 'hi');
    expect(reply).toBe('Hello.');
  });

  it('sendMessage throws for unknown npc', async () => {
    const { service } = makeService('x');
    manager = new NPCManager(service);
    await expect(manager.sendMessage('missing', world, 'hi')).rejects.toThrow('not found');
  });

  it('sendMessage throws when no service configured', async () => {
    manager.spawn(def);
    await expect(manager.sendMessage('npc_a', world, 'hi')).rejects.toThrow('no ClaudeNPCService');
  });

  it('sendMessage forwards streamed chunks', async () => {
    const { service } = makeService('abcdef');
    manager = new NPCManager(service);
    manager.spawn(def);
    const chunks: string[] = [];
    await manager.sendMessage('npc_a', world, 'hi', (c) => chunks.push(c));
    expect(chunks.join('')).toBe('abcdef');
  });

  // ─── Memory serialize / restore ────────────────────────────────────────────

  it('serializeMemory captures each agent conversation', () => {
    const agent = manager.spawn(def);
    agent.conversation.recordExchange('hi', 'hello');
    const memory = manager.serializeMemory();
    expect(memory['npc_a'].history).toHaveLength(1);
  });

  it('restoreConversation returns saved context', () => {
    const memory = {
      npc_a: { mode: 'stateless' as const, sessionId: null, history: [{ player: 'a', npc: 'b' }] },
    };
    const ctx = NPCManager.restoreConversation(memory, 'npc_a');
    expect(ctx.getHistoryCount()).toBe(1);
  });

  it('restoreConversation returns fresh context when no memory', () => {
    const ctx = NPCManager.restoreConversation(undefined, 'npc_a');
    expect(ctx.getHistoryCount()).toBe(0);
  });

  it('restoreConversation returns fresh context when npc not in memory', () => {
    const ctx = NPCManager.restoreConversation({}, 'npc_a');
    expect(ctx.getHistoryCount()).toBe(0);
  });

  it('dispose clears agents and cooldowns', () => {
    manager.spawn(def);
    manager.dispose();
    expect(manager.getAgents()).toHaveLength(0);
  });

  it('works with Zara definition', () => {
    const zara = manager.spawn(createZara());
    expect(zara.definition.name).toBe('Zara');
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────

function makeService(reply: string): { service: ClaudeNPCService } {
  let chunkCb: ((d: { npcId: string; chunk: string }) => void) | null = null;
  const bridge: ClaudeBridge = {
    claudeQuery: jest.fn(async (params) => {
      chunkCb?.({ npcId: params.npcId, chunk: reply });
    }),
    claudeCancel: jest.fn(async () => {}),
    onClaudeResponseChunk: jest.fn((cb) => { chunkCb = cb; return () => {}; }),
    onClaudeResponseDone: jest.fn(() => () => {}),
  };
  return { service: new ClaudeNPCService({ claudePath: 'claude', bridge }) };
}
