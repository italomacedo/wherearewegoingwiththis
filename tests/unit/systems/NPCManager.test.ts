import { Vector3 } from '@babylonjs/core';
import { NPCManager, COOLDOWN_SECONDS } from '../../../src/systems/NPCManager';
import { ClaudeNPCService, ClaudeBridge } from '../../../src/systems/ClaudeNPCService';
import { NPCDefinition } from '../../../src/entities/NPCAgent';
import { ConversationContext } from '../../../src/systems/npc/ConversationContext';
import { WorldSnapshot } from '../../../src/systems/npc/PromptBuilder';
import { createZara } from '../../../src/entities/npcs/zara';
import { ClaudeCallQueue } from '../../../src/systems/ClaudeCallQueue';
import { AutonomyContext, AutonomyJob } from '../../../src/systems/NPCManager';

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

  it('classifyAction defaults to NARRATIVE and narrate* to "" with no service', async () => {
    await expect(manager.classifyAction('npc_a', '*x*')).resolves.toEqual(
      { deterministic: false, skillId: null, attribute: null, difficulty: 50, hostile: false, effect: 'none', target2: null, dir: null }
    );
    await expect(manager.narrateAmbient('hi', '20:00', 'street')).resolves.toBe('');
    await expect(manager.narrateOutcome('*x*', true)).resolves.toBe('');
    await expect(manager.narrateCombat('Hero lands a hit on Zara.')).resolves.toBe('');
    await expect(manager.classifyCommerce('npc_a', 'reply', 'msg', [], [])).resolves.toMatchObject({ offer: 'none' });
  });

  it('classifyCommerce delegates to the service', async () => {
    const svc = {
      classifyCommerce: jest.fn().mockResolvedValue({ offer: 'trade', itemId: 'knife', targetId: null, rewardItemId: null, rewardCredits: 0, accept: true }),
    } as unknown as ClaudeNPCService;
    const m = new NPCManager(svc);
    await expect(m.classifyCommerce('npc_a', 'sell knife', 'deal', ['knife'], [])).resolves.toMatchObject({ offer: 'trade', accept: true });
    m.dispose();
  });

  it('liveNpcIds excludes defeated agents', () => {
    const a = manager.spawn(def);
    manager.spawn({ ...def, id: 'npc_b' });
    expect(manager.liveNpcIds().sort()).toEqual(['npc_b', def.id].sort());
    a.markDefeated();
    expect(manager.liveNpcIds()).toEqual(['npc_b']);
  });

  it('classifyAction / narrate* delegate to the Claude service', async () => {
    const svc = {
      classifyAction: jest.fn().mockResolvedValue({ deterministic: true, skillId: 'furtividade', attribute: 'destreza', difficulty: 50 }),
      narrate: jest.fn().mockResolvedValue('Rain hisses on neon.'),
    } as unknown as ClaudeNPCService;
    const m = new NPCManager(svc);
    await expect(m.classifyAction('npc_a', '*picks lock*')).resolves.toMatchObject({ deterministic: true, skillId: 'furtividade' });
    await expect(m.narrateAmbient('look around', '20:00', 'a street')).resolves.toBe('Rain hisses on neon.');
    await expect(m.narrateOutcome('*shoots*', false)).resolves.toBe('Rain hisses on neon.');
    await expect(m.narrateCombat('Zara reloads.')).resolves.toBe('Rain hisses on neon.');
    expect(svc.narrate).toHaveBeenCalledTimes(3);
    m.dispose();
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

  it('serializeMemory persists each agent disposition', () => {
    const agent = manager.spawn({ ...def, initialDisposition: 'wary' });
    agent.worsenDisposition(); // wary → hostile
    const memory = manager.serializeMemory();
    expect(memory['npc_a'].disposition).toBe('hostile');
  });

  it('restoreDisposition reads the saved value or falls back', () => {
    const memory = { npc_a: { mode: 'stateless' as const, sessionId: null, history: [], disposition: 'hostile' as const } };
    expect(NPCManager.restoreDisposition(memory, 'npc_a', 'neutral')).toBe('hostile');
    expect(NPCManager.restoreDisposition(memory, 'npc_z', 'wary')).toBe('wary');
    expect(NPCManager.restoreDisposition(undefined, 'npc_a', 'friendly')).toBe('friendly');
  });

  it('serializes + restores the NPC→NPC relationship ledger (8B)', () => {
    const agent = manager.spawn({ ...def, npcRelationships: { foe: 'wary' } });
    agent.worsenRelationship('foe'); // wary → hostile
    const memory = manager.serializeMemory();
    expect(memory['npc_a'].relationships).toEqual({ foe: 'hostile' });
    expect(NPCManager.restoreRelationships(memory, 'npc_a')).toEqual({ foe: 'hostile' });
    expect(NPCManager.restoreRelationships(memory, 'npc_z')).toBeUndefined();
    expect(NPCManager.restoreRelationships(undefined, 'npc_a')).toBeUndefined();
  });

  it('serializes + restores the witnessed-events memory (C)', () => {
    const agent = manager.spawn({ ...def });
    agent.rememberEvent('You saw Zara killed in a fight.');
    const memory = manager.serializeMemory();
    expect(memory['npc_a'].events).toEqual(['You saw Zara killed in a fight.']);
    expect(NPCManager.restoreEvents(memory, 'npc_a')).toEqual(['You saw Zara killed in a fight.']);
    expect(NPCManager.restoreEvents(memory, 'npc_z')).toBeUndefined();
    expect(NPCManager.restoreEvents(undefined, 'npc_a')).toBeUndefined();
  });

  it('serializes + restores the NPC inventory (Phase 9 corpse loot stays looted)', () => {
    const agent = manager.spawn({ ...def, loadout: [{ id: 'knife', qty: 1 }, { id: 'medkit', qty: 2 }] });
    agent.getInventory().remove('medkit', 1); // someone looted one
    const memory = manager.serializeMemory();
    expect(memory['npc_a'].inventory!.items).toEqual([{ id: 'knife', qty: 1 }, { id: 'medkit', qty: 1 }]);
    expect(memory['npc_a'].inventory!.equippedWeaponId).toBe('knife');
    expect(NPCManager.restoreInventory(memory, 'npc_a')!.equippedWeaponId).toBe('knife');
    expect(NPCManager.restoreInventory(memory, 'npc_z')).toBeUndefined();
    expect(NPCManager.restoreInventory(undefined, 'npc_a')).toBeUndefined();
  });

  it('serializeMemory collapses a defeated NPC to death status + corpse inventory (Fase 18)', () => {
    const agent = manager.spawn({ ...def, initialDisposition: 'friendly', loadout: [{ id: 'knife', qty: 1 }] });
    agent.conversation.recordExchange('hi', 'hello');
    agent.rememberEvent('something happened');
    agent.markDefeated();
    const entry = manager.serializeMemory()['npc_a'];
    expect(entry.defeated).toBe(true);
    expect(entry.history).toEqual([]);          // conversation dropped (never talks again)
    expect(entry.disposition).toBeUndefined();   // disposition dropped
    expect(entry.events).toBeUndefined();        // witnessed events dropped
    expect(entry.relationships).toBeUndefined(); // ledger dropped
    expect(entry.inventory!.items).toEqual([{ id: 'knife', qty: 1 }]); // corpse loot kept
  });

  it('spawnWithMemory restores the defeated status so a killed NPC stays dead (Fase 18)', () => {
    const memory = { npc_a: { mode: 'stateless' as const, sessionId: null, history: [], defeated: true } };
    const agent = manager.spawnWithMemory(def, memory);
    expect(agent.isDefeated()).toBe(true);
  });

  it('spawnWithMemory leaves an NPC alive when no defeated flag is saved (Fase 18)', () => {
    const agent = manager.spawnWithMemory(def, undefined);
    expect(agent.isDefeated()).toBe(false);
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

describe('NPCManager autonomy (Fase 5)', () => {
  const ctx = (over: Partial<AutonomyContext> = {}): AutonomyContext => ({
    gameTimeLabel: '23:00 (night)',
    playerPresent: false,
    reflectionMs: 480_000,
    language: 'English',
    nearbyOf: () => [{ id: 'npc_b', name: 'B' }],
    ...over,
  });

  it('returns an empty result without a Claude service', async () => {
    const m = new NPCManager(null);
    m.spawn(def);
    const q = new ClaudeCallQueue<AutonomyJob>({ minGapMs: 0, maxPerMinute: 8 }, () => 0);
    const r = await m.tickAutonomy(q, 0, ctx());
    expect(r).toEqual({ attackers: [], enqueued: 0, deliberated: null });
    m.dispose();
  });

  it('enqueues then dispatches a deliberation and sets the parsed intent', async () => {
    const { service } = makeService('INTENT=approach\nTARGET=npc_b');
    const m = new NPCManager(service);
    const agent = m.spawn(def);
    const q = new ClaudeCallQueue<AutonomyJob>({ minGapMs: 0, maxPerMinute: 8 }, () => 0);
    const r = await m.tickAutonomy(q, 0, ctx());
    expect(r.enqueued).toBe(1);
    expect(r.deliberated).toEqual({ agentId: 'npc_a', intent: { kind: 'approach', targetNpcId: 'npc_b' } });
    expect(agent.getIntent()).toEqual({ kind: 'approach', targetNpcId: 'npc_b' });
    m.dispose();
  });

  it('a hibernating (off-quadrant) NPC is skipped entirely', async () => {
    const { service } = makeService('INTENT=approach\nTARGET=npc_b');
    const m = new NPCManager(service);
    const agent = m.spawn(def);
    agent.setAwake(false); // not in the player's current quadrant
    const q = new ClaudeCallQueue<AutonomyJob>({ minGapMs: 0, maxPerMinute: 8 }, () => 0);
    const r = await m.tickAutonomy(q, 0, ctx());
    expect(r.enqueued).toBe(0);
    expect(r.deliberated).toBeNull();
    m.dispose();
  });

  it('flags an attack for a hostile NPC that sees the player and skips its deliberation', async () => {
    const { service } = makeService('INTENT=stay');
    const m = new NPCManager(service);
    const agent = m.spawn({ ...def, initialDisposition: 'hostile' });
    const q = new ClaudeCallQueue<AutonomyJob>({ minGapMs: 0, maxPerMinute: 8 }, () => 0);
    const r = await m.tickAutonomy(q, 0, ctx({ playerPresent: true }));
    expect(r.attackers).toEqual(['npc_a']);
    expect(r.enqueued).toBe(0);
    expect(agent.getIntent()).toEqual({ kind: 'attack' });
    m.dispose();
  });

  it('honours the queue throttle across ticks (cooldown blocks re-enqueue)', async () => {
    const { service } = makeService('INTENT=stay');
    const m = new NPCManager(service);
    m.spawn(def);
    const q = new ClaudeCallQueue<AutonomyJob>({ minGapMs: 0, maxPerMinute: 8 }, () => 0);
    const first = await m.tickAutonomy(q, 0, ctx());
    expect(first.enqueued).toBe(1);
    // Same NPC within its reflection cooldown → not re-enqueued.
    const second = await m.tickAutonomy(q, 1000, ctx());
    expect(second.enqueued).toBe(0);
    m.dispose();
  });

  it('runGossip exchanges two lines and records them in both agents', async () => {
    const { service } = makeService('word on the street is bad');
    const m = new NPCManager(service);
    const a = m.spawn(def);
    const b = m.spawn({ ...def, id: 'npc_b', name: 'B' });
    const lines = await m.runGossip('npc_a', 'npc_b', 'English');
    expect(lines.speaker).toBe('word on the street is bad');
    expect(lines.listener).toBe('word on the street is bad');
    expect(a.conversation.getHistoryCount()).toBe(1);
    expect(b.conversation.getHistoryCount()).toBe(1);
    m.dispose();
  });

  it('runGossip is a no-op without a service or missing agents', async () => {
    const m = new NPCManager(null);
    expect(await m.runGossip('x', 'y')).toEqual({ speaker: '', listener: '' });
    m.dispose();
  });

  it('runDeliberation returns null for an unknown agent', async () => {
    const { service } = makeService('INTENT=stay');
    const m = new NPCManager(service);
    expect(await m.runDeliberation('ghost', ctx())).toBeNull();
    m.dispose();
  });
});

describe('NPCManager tile streaming (Fase 17)', () => {
  const defs: NPCDefinition[] = [
    { ...createZara(), id: 'civ_t1_0_0' },
    { ...createZara(), id: 'civ_t1_0_1', initialDisposition: 'neutral' },
  ];

  it('spawnTile spawns + tracks ids; despawnTile removes them + returns memory', () => {
    const m = new NPCManager();
    const agents = m.spawnTile('1,0', defs, undefined);
    expect(agents).toHaveLength(2);
    expect(m.tileNpcIds('1,0').sort()).toEqual(['civ_t1_0_0', 'civ_t1_0_1']);
    expect(m.getAgent('civ_t1_0_0')).not.toBeNull();

    const { ids, memory } = m.despawnTile('1,0');
    expect(ids.sort()).toEqual(['civ_t1_0_0', 'civ_t1_0_1']);
    expect(Object.keys(memory).sort()).toEqual(['civ_t1_0_0', 'civ_t1_0_1']);
    expect(m.getAgent('civ_t1_0_0')).toBeNull();
    expect(m.tileNpcIds('1,0')).toEqual([]);
    m.dispose();
  });

  it('despawnTile preserves disposition so a reload restores it', () => {
    const m = new NPCManager();
    m.spawnTile('2,3', defs, undefined);
    m.getAgent('civ_t1_0_0')!.setDisposition('friendly');
    const { memory } = m.despawnTile('2,3');
    expect(memory['civ_t1_0_0'].disposition).toBe('friendly');

    const m2 = new NPCManager();
    m2.spawnTile('2,3', defs, memory);
    expect(m2.getAgent('civ_t1_0_0')!.getDisposition()).toBe('friendly');
    m.dispose(); m2.dispose();
  });

  it('despawnTile of an unknown tile is a no-op', () => {
    const m = new NPCManager();
    expect(m.despawnTile('9,9')).toEqual({ ids: [], memory: {} });
    m.dispose();
  });

  it('spawnWithMemory restores the full persisted entry', () => {
    const m = new NPCManager();
    const memory = {
      civ_t1_0_0: {
        mode: 'stateless' as const, sessionId: null, history: [],
        disposition: 'hostile' as const,
      },
    };
    const agent = m.spawnWithMemory(defs[0], memory);
    expect(agent.getDisposition()).toBe('hostile');
    m.dispose();
  });
});

describe('NPCManager — covert-action detection (Fase 20G)', () => {
  const rollLow = () => 0.01;   // NPC check succeeds → notices
  const rollHigh = () => 0.999; // NPC check fails → oblivious

  it('resolveTamperNotice: theft uses Perception; a low roll notices', () => {
    const t = { kind: 'theft' as const, playerSkillValue: 20 };
    expect(NPCManager.resolveTamperNotice(t, { perception: 80, infotech: 10, hasDeck: false }, rollLow)).toBe(true);
    expect(NPCManager.resolveTamperNotice(t, { perception: 80, infotech: 10, hasDeck: false }, rollHigh)).toBe(false);
  });

  it('resolveTamperNotice: a hack is undetectable without a deck', () => {
    const t = { kind: 'hack' as const, playerSkillValue: 10 };
    expect(NPCManager.resolveTamperNotice(t, { perception: 99, infotech: 99, hasDeck: false }, rollLow)).toBe(false);
    expect(NPCManager.resolveTamperNotice(t, { perception: 10, infotech: 80, hasDeck: true }, rollLow)).toBe(true);
  });

  it('resolveTamperNotice: social uses IT for a hacker, else Perception', () => {
    const t = { kind: 'social' as const, playerSkillValue: 10 };
    expect(NPCManager.resolveTamperNotice(t, { perception: 80, infotech: 10, hasDeck: false }, rollLow)).toBe(true);
    expect(NPCManager.resolveTamperNotice(t, { perception: 10, infotech: 80, hasDeck: true }, rollLow)).toBe(true);
  });

  it('detectTampering: a notice records an event, worsens disposition, and clears the trace', () => {
    const m = new NPCManager();
    const agent = m.spawn(def);
    agent.seedTamper({ kind: 'theft', playerSkillValue: 5 }); // trivial → easy to notice
    const noticed = m.detectTampering(rollLow);
    expect(noticed).toEqual(['npc_a']);
    expect(agent.getTamper()).toBeNull();
    expect(agent.getDisposition()).toBe('wary'); // neutral → wary
    expect(agent.getKnownEvents().some((e) => /pocket/i.test(e))).toBe(true);
    m.dispose();
  });

  it('detectTampering: an oblivious NPC keeps the trace for next time', () => {
    const m = new NPCManager();
    const agent = m.spawn(def);
    agent.seedTamper({ kind: 'theft', playerSkillValue: 95 }); // very skilled thief
    expect(m.detectTampering(rollHigh)).toEqual([]);
    expect(agent.getTamper()).not.toBeNull();
    m.dispose();
  });

  it('detectTampering: skips defeated/asleep NPCs', () => {
    const m = new NPCManager();
    const dead = m.spawn({ ...def, id: 'dead' }); dead.seedTamper({ kind: 'theft', playerSkillValue: 5 }); dead.markDefeated();
    const asleep = m.spawn({ ...def, id: 'asleep' }); asleep.seedTamper({ kind: 'theft', playerSkillValue: 5 }); asleep.setAwake(false);
    expect(m.detectTampering(rollLow)).toEqual([]);
    m.dispose();
  });

  it('detectTampering: a hacker NPC (deck) catches a hack via Information Technology', () => {
    const m = new NPCManager();
    const hacker = m.spawn({ ...def, id: 'hacker', loadout: [{ id: 'cyberdeck', qty: 1 }] });
    hacker.seedTamper({ kind: 'hack', playerSkillValue: 5 });
    expect(m.detectTampering(rollLow)).toEqual(['hacker']);
    m.dispose();
  });

  it('serializeMemory persists the NPC position and spawnWithMemory restores it (Fase 20)', () => {
    const m = new NPCManager();
    const agent = m.spawn(def);
    agent.setPosition(new Vector3(12, 0, -7));
    const mem = m.serializeMemory();
    expect(mem.npc_a!.position).toEqual([12, 0, -7]);
    const m2 = new NPCManager();
    const restored = m2.spawnWithMemory(def, mem);
    expect(restored.getPosition().x).toBeCloseTo(12);
    expect(restored.getPosition().z).toBeCloseTo(-7);
    m.dispose(); m2.dispose();
  });

  it('serializeMemory persists position even for defeated NPCs (corpse stays where it fell)', () => {
    const m = new NPCManager();
    const agent = m.spawn(def);
    agent.setPosition(new Vector3(5, 0, 5));
    agent.markDefeated();
    const mem = m.serializeMemory();
    expect(mem.npc_a!.defeated).toBe(true);
    expect(mem.npc_a!.position).toEqual([5, 0, 5]);
    const m2 = new NPCManager();
    const restored = m2.spawnWithMemory(def, mem);
    expect(restored.isDefeated()).toBe(true);
    expect(restored.getPosition().x).toBeCloseTo(5);
    m.dispose(); m2.dispose();
  });

  it('serializeMemory persists a pending tamper + sabotage flag, and spawnWithMemory restores them', () => {
    const m = new NPCManager();
    const agent = m.spawn(def);
    agent.seedTamper({ kind: 'hack', playerSkillValue: 42 });
    agent.markSabotaged();
    const mem = m.serializeMemory();
    expect(mem.npc_a!.tamper).toEqual({ kind: 'hack', playerSkillValue: 42 });
    expect(mem.npc_a!.sabotaged).toBe(true);
    const m2 = new NPCManager();
    const restored = m2.spawnWithMemory(def, mem);
    expect(restored.getTamper()).toEqual({ kind: 'hack', playerSkillValue: 42 });
    expect(restored.isSabotaged()).toBe(true);
    m.dispose(); m2.dispose();
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
