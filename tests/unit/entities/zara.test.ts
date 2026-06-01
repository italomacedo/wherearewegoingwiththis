import { ZARA_DEFINITION, createZara } from '../../../src/entities/npcs/zara';

describe('Zara NPC definition', () => {
  it('has the expected id and name', () => {
    expect(ZARA_DEFINITION.id).toBe('npc_zara_vendor_01');
    expect(ZARA_DEFINITION.name).toBe('Zara');
  });

  it('is suspicious by default', () => {
    expect(ZARA_DEFINITION.defaultMood).toBe('suspicious');
  });

  it('has a non-trivial personality prompt', () => {
    expect(ZARA_DEFINITION.personalityPrompt.length).toBeGreaterThan(50);
  });

  it('conversation radius is within interaction radius', () => {
    expect(ZARA_DEFINITION.conversationRadius).toBeLessThan(ZARA_DEFINITION.interactionRadius);
  });

  it('has a rich identity (home / backstory / routine / relationships)', () => {
    expect(ZARA_DEFINITION.home && ZARA_DEFINITION.home.length).toBeGreaterThan(0);
    expect(ZARA_DEFINITION.backstory && ZARA_DEFINITION.backstory.length).toBeGreaterThan(0);
    expect(ZARA_DEFINITION.routine && ZARA_DEFINITION.routine.length).toBeGreaterThan(0);
    expect(ZARA_DEFINITION.relationships && ZARA_DEFINITION.relationships.length).toBeGreaterThan(0);
  });

  it('starts wary toward the player', () => {
    expect(ZARA_DEFINITION.initialDisposition).toBe('wary');
  });

  it('createZara returns an independent copy', () => {
    const a = createZara();
    const b = createZara();
    expect(a).not.toBe(b);
    a.position[0] = 999;
    expect(b.position[0]).toBe(ZARA_DEFINITION.position[0]);
  });

  it('createZara copies the position array', () => {
    const z = createZara();
    expect(z.position).toEqual(ZARA_DEFINITION.position);
    expect(z.position).not.toBe(ZARA_DEFINITION.position);
  });
});
