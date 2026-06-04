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
    const params = lastParams.value as { useSession?: boolean; sessionId?: string; prompt: string; systemPrompt?: string; model?: string; effort?: string };
    expect(params.useSession).toBeUndefined();
    expect(params.sessionId).toBeUndefined();
    // Persona is now in systemPrompt, not in the main prompt
    expect(params.systemPrompt).toContain('Zara');
    expect(params.prompt).toContain('hi'); // dynamic context has the message
    expect(params.model).toBe('haiku'); // cheap model for all NPC calls (Fase 14E)
    expect(params.effort).toBe('low'); // minimal reasoning tokens (Fase 14E)
  });

  it('graduates to session mode when context grows large', async () => {
    const { bridge, lastParams } = makeBridge('ok');
    const service = new ClaudeNPCService({
      claudePath: 'claude',
      bridge,
      sessionIdFactory: () => 'session-fixed',
    });
    // Pre-fill a context that exceeds the graduation threshold
    const longText = 'x'.repeat(3000);
    const ctx = new ConversationContext();
    ctx.recordExchange(longText, longText);
    const agent = new NPCAgent(def, ctx);

    await service.query(agent, world, 'hi');
    const params = lastParams.value as { useSession?: boolean; sessionId?: string; prompt: string; systemPrompt?: string };
    expect(params.useSession).toBe(true);
    expect(params.sessionId).toBe('session-fixed');
    // graduation: systemPrompt is included on the primer call
    expect(params.systemPrompt).toContain('Zara');
    // primer contains mood/player context but NOT the full persona
    expect(params.prompt).toContain('conversation so far');
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
    const params = lastParams.value as { useSession?: boolean; prompt: string; systemPrompt?: string };
    expect(params.useSession).toBe(true);
    expect(params.systemPrompt).toBeUndefined(); // no persona on subsequent session turns
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

  // ─── Pre-moderation ─────────────────────────────────────────────────────────

  it('moderate allows a message the classifier marks ALLOW', async () => {
    const { bridge, lastParams } = makeBridge('ALLOW');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    await expect(service.moderate('npc_zara', 'got chips?')).resolves.toBe(true);
    const params = lastParams.value as { npcId: string; prompt: string; model?: string; effort?: string };
    expect(params.npcId).toBe('npc_zara::moderation');
    expect(params.prompt).toContain('ALLOW or BLOCK');
    expect(params.model).toBe('haiku'); // cheap model for classifiers too (Fase 14E)
    expect(params.effort).toBe('low'); // minimal reasoning tokens (Fase 14E)
  });

  it('moderate blocks a message the classifier marks BLOCK', async () => {
    const { bridge } = makeBridge('BLOCK');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    await expect(service.moderate('npc_zara', 'disallowed thing')).resolves.toBe(false);
  });

  it('moderate fails open (allows) when the CLI errors', async () => {
    const bridge: ClaudeBridge = {
      claudeQuery: jest.fn(async () => { throw new Error('cli down'); }),
      claudeCancel: jest.fn(async () => {}),
      onClaudeResponseChunk: jest.fn(() => () => {}),
      onClaudeResponseDone: jest.fn(() => () => {}),
    };
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    await expect(service.moderate('npc_zara', 'whatever')).resolves.toBe(true);
  });

  // ─── Emote classifier + ambient narration (one-shot) ─────────────────────────

  it('classifyAction parses the structured verdict + skill/attr/difficulty', async () => {
    const { bridge, lastParams } = makeBridge('VERDICT=DETERMINISTIC\nSKILL=armas_de_fogo\nATTR=destreza\nDIFF=hard');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const r = await service.classifyAction('npc_zara', '*takes a shot*');
    expect(r.deterministic).toBe(true);
    expect(r.skillId).toBe('armas_de_fogo');
    expect(r.attribute).toBe('destreza');
    expect(r.difficulty).toBe(65); // hard
    const params = lastParams.value as { npcId: string; prompt: string };
    expect(params.npcId).toBe('npc_zara::action');
    expect(params.prompt).toContain('VERDICT=');
  });

  it('classifyAction fails open to a NARRATIVE classification when the CLI errors', async () => {
    const bridge: ClaudeBridge = {
      claudeQuery: jest.fn(async () => { throw new Error('cli down'); }),
      claudeCancel: jest.fn(async () => {}),
      onClaudeResponseChunk: jest.fn(() => () => {}),
      onClaudeResponseDone: jest.fn(() => () => {}),
    };
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    const r = await service.classifyAction('npc_zara', '*does a thing*');
    expect(r.deterministic).toBe(false);
  });

  it('narrate returns the one-shot reply, scoped to an ambient id', async () => {
    const { bridge, lastParams } = makeBridge('Rain ticks off the awning.');
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    await expect(service.narrate('world', 'narrate the street')).resolves.toBe('Rain ticks off the awning.');
    const params = lastParams.value as { npcId: string };
    expect(params.npcId).toBe('world::ambient');
  });

  it('narrate returns empty string when the CLI errors', async () => {
    const bridge: ClaudeBridge = {
      claudeQuery: jest.fn(async () => { throw new Error('cli down'); }),
      claudeCancel: jest.fn(async () => {}),
      onClaudeResponseChunk: jest.fn(() => () => {}),
      onClaudeResponseDone: jest.fn(() => () => {}),
    };
    const service = new ClaudeNPCService({ claudePath: 'claude', bridge });
    await expect(service.narrate('world', 'x')).resolves.toBe('');
  });
});
