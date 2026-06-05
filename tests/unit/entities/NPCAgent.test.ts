import { Vector3 } from '@babylonjs/core';
import {
  NPCAgent, NPCDefinition, worsenedDisposition, improvedDisposition, dispositionMagnitude, DISPOSITION_SCALE,
  friendlyFireDefection, NPC_DEFAULT_MAX_HP,
} from '../../../src/entities/NPCAgent';

describe('disposition scale helpers (pure)', () => {
  it('worsenedDisposition steps toward hostile and clamps', () => {
    expect(worsenedDisposition('friendly')).toBe('neutral');
    expect(worsenedDisposition('neutral')).toBe('wary');
    expect(worsenedDisposition('wary')).toBe('hostile');
    expect(worsenedDisposition('hostile')).toBe('hostile');
  });
  it('improvedDisposition steps toward friendly and clamps', () => {
    expect(improvedDisposition('hostile')).toBe('wary');
    expect(improvedDisposition('wary')).toBe('neutral');
    expect(improvedDisposition('neutral')).toBe('friendly');
    expect(improvedDisposition('friendly')).toBe('friendly');
  });
  it('dispositionMagnitude is the distance from neutral', () => {
    expect(dispositionMagnitude('neutral')).toBe(0);
    expect(dispositionMagnitude('wary')).toBe(1);
    expect(dispositionMagnitude('friendly')).toBe(1);
    expect(dispositionMagnitude('hostile')).toBe(2);
    expect(DISPOSITION_SCALE).toHaveLength(4);
  });

  it('friendlyFireDefection worsens one step and defects at wary (~2 hits for a friendly ally)', () => {
    const first = friendlyFireDefection('friendly');
    expect(first).toEqual({ disposition: 'neutral', defects: false });
    const second = friendlyFireDefection(first.disposition);
    expect(second).toEqual({ disposition: 'wary', defects: true });
    expect(friendlyFireDefection('neutral')).toEqual({ disposition: 'wary', defects: true });
    expect(friendlyFireDefection('wary')).toEqual({ disposition: 'hostile', defects: true });
  });
});

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

  it('has an empty inventory and fights with fists when no loadout is given', () => {
    expect(agent.getInventory().isEmpty()).toBe(true);
    expect(agent.getCombatWeaponId()).toBeNull();
  });

  it('builds an inventory from the loadout and auto-equips the first weapon', () => {
    const armed = new NPCAgent({ ...def, loadout: [{ id: 'pipe', qty: 1 }, { id: 'medkit', qty: 2 }] });
    expect(armed.getInventory().count('pipe')).toBe(1);
    expect(armed.getInventory().count('medkit')).toBe(2);
    expect(armed.getCombatWeaponId()).toBe('pipe'); // auto-equipped weapon
  });

  it('a loadout with no weapon leaves the NPC unarmed', () => {
    const medic = new NPCAgent({ ...def, loadout: [{ id: 'medkit', qty: 1 }] });
    expect(medic.getCombatWeaponId()).toBeNull();
  });

  it('starts at full pervasive HP (NPC default max)', () => {
    expect(agent.getHealthState()).toEqual({ current: NPC_DEFAULT_MAX_HP, max: NPC_DEFAULT_MAX_HP });
    expect(agent.getHealth().fraction()).toBe(1);
  });

  it('persists and restores wounded HP (pervasive across reloads)', () => {
    agent.getHealth().applyDamage(25);
    const wounded = agent.getHealthState();
    expect(wounded.current).toBe(NPC_DEFAULT_MAX_HP - 25);
    const reloaded = new NPCAgent(def);
    reloaded.setHealthState(wounded);
    expect(reloaded.getHealthState()).toEqual(wounded);
  });

  it('restoreInventory loads a persisted inventory, or rebuilds from the loadout when absent', () => {
    const armed = new NPCAgent({ ...def, loadout: [{ id: 'knife', qty: 1 }] });
    armed.getInventory().remove('knife', 1); // someone looted it
    const looted = armed.getInventoryState();
    const reloaded = new NPCAgent({ ...def, loadout: [{ id: 'knife', qty: 1 }] });
    reloaded.restoreInventory(looted);
    expect(reloaded.getInventory().count('knife')).toBe(0); // stays looted
    reloaded.restoreInventory(undefined);
    expect(reloaded.getInventory().count('knife')).toBe(1); // rebuilt from loadout
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
    expect(a.improveDisposition()).toBe('wary');
    expect(a.improveDisposition()).toBe('neutral');
  });

  it('onHostilePlayerAction worsens + issues an ultimatum the first time, not when already hostile', () => {
    const a = new NPCAgent({ ...def, initialDisposition: 'neutral' });
    expect(a.onHostilePlayerAction()).toEqual({ ultimatum: true });
    expect(a.getDisposition()).toBe('wary');
    expect(a.getMood()).toBe('hostile');
    a.setDisposition('hostile');
    expect(a.onHostilePlayerAction()).toEqual({ ultimatum: false });
  });

  it('defeated flag is false until marked, then sticks', () => {
    const a = new NPCAgent({ ...def });
    expect(a.isDefeated()).toBe(false);
    a.markDefeated();
    expect(a.isDefeated()).toBe(true);
  });

  it('shouldInitiateCombat only when hostile and player present', () => {
    const a = new NPCAgent({ ...def, initialDisposition: 'hostile' });
    expect(a.shouldInitiateCombat(true)).toBe(true);
    expect(a.shouldInitiateCombat(false)).toBe(false);
    a.setDisposition('wary');
    expect(a.shouldInitiateCombat(true)).toBe(false);
  });

  describe('NPC→NPC relationship ledger (8B)', () => {
    it('defaults to neutral and seeds from the definition', () => {
      const a = new NPCAgent({ ...def, npcRelationships: { npc_mback: 'wary' } });
      expect(a.getRelationship('npc_mback')).toBe('wary');
      expect(a.getRelationship('stranger')).toBe('neutral');
    });

    it('set / worsen (clamped) and antagonism predicate', () => {
      const a = new NPCAgent({ ...def });
      a.setRelationship('x', 'friendly');
      expect(a.isAntagonisticToward('x')).toBe(false);
      expect(a.worsenRelationship('x')).toBe('neutral');
      expect(a.worsenRelationship('x')).toBe('wary');
      expect(a.isAntagonisticToward('x')).toBe(true); // wary counts
      expect(a.worsenRelationship('x')).toBe('hostile');
      expect(a.worsenRelationship('x')).toBe('hostile'); // clamped
      expect(a.isAntagonisticToward('x')).toBe(true);
    });

    it('improveRelationship steps toward friendly (clamped)', () => {
      const a = new NPCAgent({ ...def });
      expect(a.improveRelationship('x')).toBe('friendly'); // neutral → friendly
      expect(a.improveRelationship('x')).toBe('friendly'); // clamped
      a.setRelationship('y', 'hostile');
      expect(a.improveRelationship('y')).toBe('wary');
    });

    it('serialises and restores the ledger as a record', () => {
      const a = new NPCAgent({ ...def, npcRelationships: { npc_mback: 'hostile' } });
      expect(a.relationshipsRecord()).toEqual({ npc_mback: 'hostile' });
      a.restoreRelationships({ ally: 'friendly' });
      expect(a.relationshipsRecord()).toEqual({ ally: 'friendly' });
      expect(a.getRelationship('npc_mback')).toBe('neutral'); // cleared on restore
      a.restoreRelationships(undefined);
      expect(a.relationshipsRecord()).toEqual({});
    });
  });

  describe('tamper trace + sabotage (Fase 20)', () => {
    it('seeds, reads, restores and clears a tamper trace', () => {
      const a = new NPCAgent({ ...def });
      expect(a.getTamper()).toBeNull();
      a.seedTamper({ kind: 'theft', playerSkillValue: 55 });
      expect(a.getTamper()).toEqual({ kind: 'theft', playerSkillValue: 55 });
      a.clearTamper();
      expect(a.getTamper()).toBeNull();
      a.restoreTamper({ kind: 'hack', playerSkillValue: 70 });
      expect(a.getTamper()).toEqual({ kind: 'hack', playerSkillValue: 70 });
      a.restoreTamper(undefined);
      expect(a.getTamper()).toBeNull();
    });

    it('marks, reads, restores and clears sabotage', () => {
      const a = new NPCAgent({ ...def });
      expect(a.isSabotaged()).toBe(false);
      a.markSabotaged();
      expect(a.isSabotaged()).toBe(true);
      a.clearSabotage();
      expect(a.isSabotaged()).toBe(false);
      a.restoreSabotaged(true);
      expect(a.isSabotaged()).toBe(true);
      a.restoreSabotaged(undefined);
      expect(a.isSabotaged()).toBe(false);
    });
  });

  describe('witnessed events memory (C)', () => {
    it('records events (deduped), exposes oldest-first + recent newest-first', () => {
      const a = new NPCAgent({ ...def });
      expect(a.getKnownEvents()).toEqual([]);
      a.rememberEvent('You saw Zara killed in a fight.');
      a.rememberEvent('You saw Zara killed in a fight.'); // dedup
      a.rememberEvent('  '); // blank ignored
      a.rememberEvent('Sirens passed.');
      expect(a.getKnownEvents()).toEqual(['You saw Zara killed in a fight.', 'Sirens passed.']);
      expect(a.getRecentEvents(1)).toEqual(['Sirens passed.']); // newest first
    });

    it('caps at 8 events (oldest dropped) and round-trips through restore', () => {
      const a = new NPCAgent({ ...def });
      for (let i = 0; i < 10; i++) a.rememberEvent(`e${i}`);
      const saved = a.getKnownEvents();
      expect(saved).toHaveLength(8);
      expect(saved[0]).toBe('e2'); // e0/e1 dropped
      const b = new NPCAgent({ ...def });
      b.restoreEvents(saved);
      expect(b.getKnownEvents()).toEqual(saved); // stable order
      b.restoreEvents(undefined);
      expect(b.getKnownEvents()).toEqual([]);
    });
  });

  it('setPosition moves the logical position (proximity/talk follow the NPC)', () => {
    const a = new NPCAgent({ ...def }); // copy so the shared def isn't mutated
    a.setPosition(new Vector3(12, 0, -3));
    expect(a.getPosition().x).toBe(12);
    expect(a.getPosition().z).toBe(-3);
    expect(a.distanceTo(new Vector3(12, 0, -3))).toBe(0);
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
