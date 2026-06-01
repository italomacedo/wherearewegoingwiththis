import { MBACK_DEFINITION, createMback } from '../../../src/entities/npcs/mback';
import { ZARA_DEFINITION } from '../../../src/entities/npcs/zara';

describe('Mback NPC definition', () => {
  it('has the expected id and name', () => {
    expect(MBACK_DEFINITION.id).toBe('npc_mback_fence_01');
    expect(MBACK_DEFINITION.name).toBe('Mback');
  });

  it('starts neutral toward the player', () => {
    expect(MBACK_DEFINITION.initialDisposition).toBe('neutral');
  });

  it('has a non-trivial personality prompt and rich identity', () => {
    expect(MBACK_DEFINITION.personalityPrompt.length).toBeGreaterThan(50);
    expect(MBACK_DEFINITION.home && MBACK_DEFINITION.home.length).toBeGreaterThan(0);
    expect(MBACK_DEFINITION.backstory && MBACK_DEFINITION.backstory.length).toBeGreaterThan(0);
    expect(MBACK_DEFINITION.routine && MBACK_DEFINITION.routine.length).toBeGreaterThan(0);
    expect(MBACK_DEFINITION.relationships && MBACK_DEFINITION.relationships.length).toBeGreaterThan(0);
  });

  it('stands within gossip range of Zara but outside her conversation radius', () => {
    const dx = MBACK_DEFINITION.position[0] - ZARA_DEFINITION.position[0];
    const dz = MBACK_DEFINITION.position[2] - ZARA_DEFINITION.position[2];
    const dist = Math.hypot(dx, dz);
    expect(dist).toBeLessThanOrEqual(20); // within deliberation candidate range
    expect(dist).toBeGreaterThan(ZARA_DEFINITION.conversationRadius); // not in her chat radius
  });

  it('createMback returns an independent copy', () => {
    const a = createMback();
    const b = createMback();
    expect(a).not.toBe(b);
    a.position[0] = 999;
    expect(b.position[0]).toBe(MBACK_DEFINITION.position[0]);
  });
});
