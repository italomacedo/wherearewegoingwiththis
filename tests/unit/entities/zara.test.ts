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
