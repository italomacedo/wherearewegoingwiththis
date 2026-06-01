import { Vector3 } from '@babylonjs/core';
import { NPCAgent, NPCDefinition } from '../../../src/entities/NPCAgent';

const def: NPCDefinition = {
  id: 'npc_test',
  name: 'Zara',
  role: 'vendor',
  location: 'Stall 7',
  personalityPrompt: 'Wary.',
  defaultMood: 'suspicious',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [0, 0, 0],
};

describe('NPCAgent', () => {
  let agent: NPCAgent;

  beforeEach(() => {
    agent = new NPCAgent(def);
  });

  it('starts idle with default mood', () => {
    expect(agent.getState()).toBe('idle');
    expect(agent.getMood()).toBe('suspicious');
  });

  it('getPosition returns the definition position', () => {
    expect(agent.getPosition()).toEqual(new Vector3(0, 0, 0));
  });

  it('distanceTo computes euclidean distance', () => {
    expect(agent.distanceTo(new Vector3(3, 0, 4))).toBeCloseTo(5, 5);
  });

  // ─── Name discovery (anti-metagaming) ─────────────────────────────────────

  it('hides the name until introduced', () => {
    expect(agent.isNameKnown()).toBe(false);
    expect(agent.getDisplayName()).toBe('Unknown');
  });

  it('reveals the name when it appears in the NPC reply', () => {
    expect(agent.revealNameIfMentioned("They call me Zara, stranger.")).toBe(true);
    expect(agent.isNameKnown()).toBe(true);
    expect(agent.getDisplayName()).toBe('Zara');
  });

  it('reveal is case-insensitive and only fires once', () => {
    expect(agent.revealNameIfMentioned('the name is zara')).toBe(true);
    expect(agent.revealNameIfMentioned('Zara again')).toBe(false); // already known
  });

  it('does not reveal when the name is absent', () => {
    expect(agent.revealNameIfMentioned('What do you want?')).toBe(false);
    expect(agent.isNameKnown()).toBe(false);
  });

  it('markNameKnown forces the reveal', () => {
    agent.markNameKnown();
    expect(agent.getDisplayName()).toBe('Zara');
  });

  // ─── Proximity state machine ──────────────────────────────────────────────

  it('becomes aware when player within interaction radius', () => {
    agent.updateProximity(new Vector3(5, 0, 0));
    expect(agent.getState()).toBe('aware');
  });

  it('stays idle when player far away', () => {
    agent.updateProximity(new Vector3(20, 0, 0));
    expect(agent.getState()).toBe('idle');
  });

  it('returns to idle when player leaves after being aware', () => {
    agent.updateProximity(new Vector3(5, 0, 0));
    expect(agent.getState()).toBe('aware');
    agent.updateProximity(new Vector3(20, 0, 0));
    expect(agent.getState()).toBe('idle');
  });

  it('canConverse true within conversation radius', () => {
    expect(agent.canConverse(new Vector3(2, 0, 0))).toBe(true);
  });

  it('canConverse false outside conversation radius', () => {
    expect(agent.canConverse(new Vector3(5, 0, 0))).toBe(false);
  });

  // ─── Threat reaction ──────────────────────────────────────────────────────

  it('defaults disposition to neutral, or the definition value', () => {
    expect(agent.getDisposition()).toBe('neutral');
    expect(new NPCAgent({ ...def, initialDisposition: 'wary' }).getDisposition()).toBe('wary');
  });

  it('worsenDisposition steps friendly→neutral→wary→hostile and clamps', () => {
    const a = new NPCAgent({ ...def, initialDisposition: 'friendly' });
    expect(a.worsenDisposition()).toBe('neutral');
    expect(a.worsenDisposition()).toBe('wary');
    expect(a.worsenDisposition()).toBe('hostile');
    expect(a.worsenDisposition()).toBe('hostile'); // clamped
  });

  it('onHostilePlayerAction worsens + issues an ultimatum the first time, not when already hostile', () => {
    const a = new NPCAgent({ ...def, initialDisposition: 'neutral' });
    expect(a.onHostilePlayerAction()).toEqual({ ultimatum: true });
    expect(a.getDisposition()).toBe('wary');
    expect(a.getMood()).toBe('hostile');
    a.setDisposition('hostile');
    expect(a.onHostilePlayerAction()).toEqual({ ultimatum: false });
  });

  it('shouldInitiateCombat only when hostile and player present', () => {
    const a = new NPCAgent({ ...def, initialDisposition: 'hostile' });
    expect(a.shouldInitiateCombat(true)).toBe(true);
    expect(a.shouldInitiateCombat(false)).toBe(false);
    a.setDisposition('wary');
    expect(a.shouldInitiateCombat(true)).toBe(false);
  });

  it('stores and returns a deliberated intent', () => {
    expect(agent.getIntent()).toEqual({ kind: 'stay' });
    agent.setIntent({ kind: 'approach', targetNpcId: 'npc_x' });
    expect(agent.getIntent()).toEqual({ kind: 'approach', targetNpcId: 'npc_x' });
  });

  it('weapon_drawn turns suspicious NPC hostile', () => {
    agent.updateProximity(new Vector3(5, 0, 0), 'weapon_drawn');
    expect(agent.getState()).toBe('hostile');
    expect(agent.getMood()).toBe('hostile');
  });

  it('weapon_drawn makes a friendly-disposition NPC scared', () => {
    const friendly = new NPCAgent({ ...def, initialDisposition: 'friendly' });
    friendly.updateProximity(new Vector3(5, 0, 0), 'weapon_drawn');
    expect(friendly.getState()).toBe('hostile');
    expect(friendly.getMood()).toBe('scared');
  });

  it('hostile relaxes only when player leaves interaction radius', () => {
    agent.updateProximity(new Vector3(2, 0, 0), 'weapon_drawn');
    expect(agent.getState()).toBe('hostile');
    agent.updateProximity(new Vector3(4, 0, 0)); // still within radius
    expect(agent.getState()).toBe('hostile');
    agent.updateProximity(new Vector3(20, 0, 0)); // left radius
    expect(agent.getState()).toBe('idle');
    expect(agent.getMood()).toBe('suspicious');
  });

  // ─── Conversation flow states ─────────────────────────────────────────────

  it('beginResponse sets responding and isBusy', () => {
    agent.beginResponse();
    expect(agent.getState()).toBe('responding');
    expect(agent.isBusy()).toBe(true);
  });

  it('proximity does not override responding state', () => {
    agent.beginResponse();
    agent.updateProximity(new Vector3(20, 0, 0));
    expect(agent.getState()).toBe('responding');
  });

  it('endResponse moves to cooldown', () => {
    agent.beginResponse();
    agent.endResponse();
    expect(agent.getState()).toBe('cooldown');
  });

  it('proximity does not override cooldown state', () => {
    agent.beginResponse();
    agent.endResponse();
    agent.updateProximity(new Vector3(5, 0, 0));
    expect(agent.getState()).toBe('cooldown');
  });

  it('endCooldown returns to aware', () => {
    agent.beginResponse();
    agent.endResponse();
    agent.endCooldown();
    expect(agent.getState()).toBe('aware');
  });

  it('endCooldown does nothing if not in cooldown', () => {
    agent.updateProximity(new Vector3(5, 0, 0)); // aware
    agent.endCooldown();
    expect(agent.getState()).toBe('aware');
  });

  it('setMood updates the mood', () => {
    agent.setMood('friendly');
    expect(agent.getMood()).toBe('friendly');
  });

  it('accepts an injected conversation context', () => {
    const agent2 = new NPCAgent(def);
    agent2.conversation.recordExchange('a', 'b');
    expect(agent2.conversation.getHistoryCount()).toBe(1);
  });

  it('weapon_drawn while responding still forces hostile', () => {
    agent.beginResponse();
    agent.updateProximity(new Vector3(2, 0, 0), 'weapon_drawn');
    expect(agent.getState()).toBe('hostile');
  });
});
