import { ClaudeNPCService, ClaudeBridge } from '../../../src/systems/ClaudeNPCService';
import { NPCAgent, NPCDefinition } from '../../../src/entities/NPCAgent';
import { ConversationContext } from '../../../src/systems/npc/ConversationContext';
import { WorldSnapshot } from '../../../src/systems/npc/PromptBuilder';

const def: NPCDefinition = {
  id: 'npc_zara',
  name: 'Zara',
  role: 'vendor',
  location: 'Stall 7',
  personalityPrompt: 'Wary.',
  defaultMood: 'suspicious',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [0, 0, 0],
};

const world: WorldSnapshot = {
  cityName: 'NeoBeiraRio',
  gameTime: '14:30, day 1',
  playerName: 'Kai',
  distanceMeters: 2,
  playerAction: 'idle',
  recentEvents: [],
};

/**
 * A mock Electron bridge that captures the last query and lets the test drive
 * the streamed chunks before the query promise resolves.
 */
function makeBridge(reply: string) {
  let chunkCb: ((d: { npcId: string; chunk: string }) => void) | null = null;
  const lastParams: { value: unknown } = { value: null };
  const bridge: ClaudeBridge = {
    claudeQuery: jest.fn(async (params) => {
      lastParams.value = params;
      // Stream the reply in two chunks, scoped to this npc
      chunkCb?.({ npcId: params.npcId, chunk: reply.slice(0, 3) });
      chunkCb?.({ npcId: params.npcId, chunk: reply.slice(3) });
    }),
    claudeCancel: jest.fn(async () => {}),
    onClaudeResponseChunk: jest.fn((cb) => {
      chunkCb = cb;
      return () => { chunkCb = null; };
    }),
    onClaudeResponseDone: jest.fn(() => () => {}),
  };
  return { bridge, lastParams };
}

describe('ClaudeNPCService', () => {
  it('queries Claude and returns the streamed reply', async () => {
    const { bridge } = makeBridge('  Hello there.  ');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    const reply = await service.query(agent, world, 'hi');
    expect(reply).toBe('Hello there.'); // trimmed
  });

  it('streams chunks to the onChunk callback', async () => {
    const { bridge } = makeBridge('abcdef');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);
    const chunks: string[] = [];

    await service.query(agent, world, 'hi', (c) => chunks.push(c));
    expect(chunks.join('')).toBe('abcdef');
  });

  it('records the exchange in the conversation', async () => {
    const { bridge } = makeBridge('Sure.');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    await service.query(agent, world, 'got chips?');
    expect(agent.conversation.getHistoryCount()).toBe(1);
    expect(agent.conversation.getFullHistory()[0]).toEqual({ player: 'got chips?', npc: 'Sure.' });
  });

  it('sets and clears busy/responding state around the call', async () => {
    const { bridge } = makeBridge('ok');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    await service.query(agent, world, 'hi');
    expect(agent.getState()).toBe('cooldown'); // endResponse() ran
    expect(agent.isBusy()).toBe(false);
  });

  it('throws if the agent is already responding', async () => {
    const { bridge } = makeBridge('ok');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);
    agent.beginResponse();

    await expect(service.query(agent, world, 'hi')).rejects.toThrow('already responding');
  });

  it('uses stateless mode for short conversations (no session flags)', async () => {
    const { bridge, lastParams } = makeBridge('ok');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    await service.query(agent, world, 'hi');
    const params = lastParams.value as { useSession?: boolean; sessionId?: string; prompt: string };
    expect(params.useSession).toBeUndefined();
    expect(params.sessionId).toBeUndefined();
    expect(params.prompt).toContain('Zara'); // full stateless prompt
  });

  it('graduates to session mode when context grows large', async () => {
    const { bridge, lastParams } = makeBridge('ok');
    const service = new ClaudeNPCService({
      claudePath: 'claude',
      bridge,
      sessionIdFactory: () => 'session-fixed',
    });
    // Pre-fill a context that exceeds the graduation threshold
    const longText = 'x'.repeat(7000);
    const ctx = new ConversationContext();
    ctx.recordExchange(longText, longText);
    const agent = new NPCAgent(def, ctx);

    await service.query(agent, world, 'hi');
    const params = lastParams.value as { useSession?: boolean; sessionId?: string; prompt: string };
    expect(params.useSession).toBe(true);
    expect(params.sessionId).toBe('session-fixed');
    // first session call includes the primer
    expect(params.prompt).toContain('roleplaying as Zara');
  });

  it('subsequent session-mode calls send a compact turn (no primer)', async () => {
    const { bridge, lastParams } = makeBridge('ok');
    const service = new ClaudeNPCService({
      claudePath: 'claude',
      bridge,
      sessionIdFactory: () => 'session-fixed',
    });
    const ctx = ConversationContext.fromState({
      mode: 'session',
      sessionId: 'session-fixed',
      history: [{ player: 'earlier', npc: 'reply' }],
    });
    const agent = new NPCAgent(def, ctx);

    await service.query(agent, world, 'and now?');
    const params = lastParams.value as { useSession?: boolean; prompt: string };
    expect(params.useSession).toBe(true);
    expect(params.prompt).not.toContain('roleplaying as Zara'); // no primer
    expect(params.prompt).toContain('and now?');
  });

  it('cancel calls the bridge and ends the response', async () => {
    const { bridge } = makeBridge('ok');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);
    agent.beginResponse();

    await service.cancel(agent);
    expect(bridge.claudeCancel).toHaveBeenCalledWith('npc_zara');
    expect(agent.getState()).toBe('cooldown');
  });

  it('unsubscribes the chunk listener after the query', async () => {
    const off = jest.fn();
    const bridge: ClaudeBridge = {
      claudeQuery: jest.fn(async () => {}),
      claudeCancel: jest.fn(async () => {}),
      onClaudeResponseChunk: jest.fn(() => off),
      onClaudeResponseDone: jest.fn(() => () => {}),
    };
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    await service.query(agent, world, 'hi');
    expect(off).toHaveBeenCalled();
  });

  it('ignores chunks addressed to a different npc', async () => {
    let chunkCb: ((d: { npcId: string; chunk: string }) => void) | null = null;
    const bridge: ClaudeBridge = {
      claudeQuery: jest.fn(async (params) => {
        chunkCb?.({ npcId: 'other-npc', chunk: 'WRONG' });
        chunkCb?.({ npcId: params.npcId, chunk: 'right' });
      }),
      claudeCancel: jest.fn(async () => {}),
      onClaudeResponseChunk: jest.fn((cb) => { chunkCb = cb; return () => {}; }),
      onClaudeResponseDone: jest.fn(() => () => {}),
    };
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const agent = new NPCAgent(def);

    const reply = await service.query(agent, world, 'hi');
    expect(reply).toBe('right');
  });
});
