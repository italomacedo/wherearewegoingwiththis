import { Vector3 } from '@babylonjs/core';
import { PlayerActor, NpcActor } from '@systems/actions/Actor';
import { NPCAgent, NPCDefinition } from '@entities/NPCAgent';
import { Inventory } from '@entities/Inventory';
import { Health } from '@entities/Health';
import { createDefaultStats } from '@entities/CharacterStats';

/**
 * Minimal stub satisfying the `PlayerController` shape `PlayerActor` reads
 * (only getHealth + getPosition are touched). We avoid instantiating the
 * full controller (which needs a Babylon scene + physics).
 */
function makePlayerControllerStub(opts: { health: Health; position: Vector3 }) {
  return {
    getHealth: () => opts.health,
    getPosition: () => opts.position,
  };
}

const def: NPCDefinition = {
  id: 'npc_test',
  name: 'Zara',
  role: 'fixer',
  location: 'Stall 7',
  personalityPrompt: 'Wary but fair.',
  defaultMood: 'neutral',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [12, 0, -4],
};

describe('PlayerActor', () => {
  let inventory: Inventory;
  let stats: ReturnType<typeof createDefaultStats>;
  let health: Health;
  let ctrl: ReturnType<typeof makePlayerControllerStub>;
  let actor: PlayerActor;

  beforeEach(() => {
    inventory = new Inventory();
    stats = createDefaultStats();
    health = new Health(100, 100);
    ctrl = makePlayerControllerStub({ health, position: new Vector3(3.5, 0, -7.2) });
    actor = new PlayerActor({
      controller: ctrl as never, // stub
      inventory,
      stats,
      displayName: 'V',
    });
  });

  it('identifies as the player with stable id "player"', () => {
    expect(actor.id).toBe('player');
    expect(actor.isPlayer).toBe(true);
    expect(actor.displayName).toBe('V');
  });

  it('exposes live inventory and stats references (not copies)', () => {
    expect(actor.getInventory()).toBe(inventory);
    expect(actor.getStats()).toBe(stats);
  });

  it('delegates HP to the controller', () => {
    expect(actor.getHealth()).toBe(health);
    expect(actor.isDefeated()).toBe(false);
    health.applyDamage(200);
    expect(actor.isDefeated()).toBe(true);
  });

  it('converts the controller Vector3 position to Point2 (XZ only)', () => {
    const p = actor.getPosition();
    expect(p).toEqual({ x: 3.5, z: -7.2 });
  });

  it('has no relationships ledger — always returns neutral', () => {
    expect(actor.getRelationship('npc_anyone')).toBe('neutral');
    expect(actor.getRelationship('player')).toBe('neutral');
  });
});

describe('NpcActor', () => {
  let agent: NPCAgent;
  let stats: ReturnType<typeof createDefaultStats>;
  let actor: NpcActor;

  beforeEach(() => {
    agent = new NPCAgent(def);
    stats = createDefaultStats();
    stats.attributes.destreza = 30;
    stats.skills.combate_corpo_a_corpo = 25;
    actor = new NpcActor(agent, stats);
  });

  it('mirrors the underlying NPCAgent identity', () => {
    expect(actor.id).toBe(def.id);
    expect(actor.isPlayer).toBe(false);
  });

  it('returns the stats block passed at construction (uniform enemyStatsFor today)', () => {
    expect(actor.getStats()).toBe(stats);
    expect(actor.getStats().attributes.destreza).toBe(30);
  });

  it('exposes live agent inventory and health references', () => {
    expect(actor.getInventory()).toBe(agent.getInventory());
    expect(actor.getHealth()).toBe(agent.getHealth());
  });

  it('converts the agent Vector3 position to Point2 (XZ only)', () => {
    const p = actor.getPosition();
    expect(p).toEqual({ x: def.position[0], z: def.position[2] });
  });

  it('exposes the relationships ledger via getRelationship', () => {
    expect(actor.getRelationship('npc_mback')).toBe('neutral'); // default
    agent.setRelationship('npc_mback', 'hostile');
    expect(actor.getRelationship('npc_mback')).toBe('hostile');
  });

  it('reports isDefeated tracking the agent state', () => {
    expect(actor.isDefeated()).toBe(false);
    agent.markDefeated();
    expect(actor.isDefeated()).toBe(true);
  });

  it('uses the agent display name (always the real name — ADR-0033)', () => {
    expect(actor.displayName).toBe(def.name);
  });
});
