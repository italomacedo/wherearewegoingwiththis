import { buildPersonaPrompt, parsePersonaResponse } from '@systems/sceneeditor/PersonaGen';
import type { SceneNpcDoc } from '@systems/sceneeditor/SceneDoc';

const npc: SceneNpcDoc = {
  id: 'npc_1', name: 'Nyx Mori', role: 'data scavenger', personalityPrompt: '',
  defaultMood: 'neutral', initialDisposition: 'wary', outfit: 'w_punk',
  attributes: { forca: 20, destreza: 45, inteligencia: 60, carisma: 25 },
  position: [0, 0, 0],
};

describe('buildPersonaPrompt', () => {
  test('carries identity, look, disposition, attributes and scene', () => {
    const p = buildPersonaPrompt(npc, 'Neon Alley');
    expect(p).toContain('"Nyx Mori", data scavenger');
    expect(p).toContain('look "w_punk"');
    expect(p).toContain('disposition wary');
    expect(p).toContain('inteligencia 60');
    expect(p).toContain('"Neon Alley"');
    expect(p).toContain('PERSONALITY:');
    expect(p).toContain('ROUTINE:');
  });

  test('defaults missing attributes to 20', () => {
    const p = buildPersonaPrompt({ ...npc, attributes: undefined }, 'X');
    expect(p).toContain('forca 20');
  });
});

describe('parsePersonaResponse', () => {
  test('parses the canonical format', () => {
    const out = parsePersonaResponse(
      'PERSONALITY: You are restless and curious.\nBACKSTORY: Lost everything in the purge.\nROUTINE: Sleeps by day, scavenges by night.',
    );
    expect(out).toEqual({
      personalityPrompt: 'You are restless and curious.',
      backstory: 'Lost everything in the purge.',
      routine: 'Sleeps by day, scavenges by night.',
    });
  });

  test('tolerates case, extra padding and multi-line sections', () => {
    const out = parsePersonaResponse(
      'Sure!\npersonality:  You are calm.\nStill calm.\n\nBackstory: Born in the\nlower decks.\nROUTINE: Walks the strip.',
    );
    expect(out?.personalityPrompt).toBe('You are calm. Still calm.');
    expect(out?.backstory).toBe('Born in the lower decks.');
    expect(out?.routine).toBe('Walks the strip.');
  });

  test.each([
    ['empty', ''],
    ['missing routine', 'PERSONALITY: a\nBACKSTORY: b'],
    ['empty section', 'PERSONALITY:\nBACKSTORY: b\nROUTINE: c'],
    ['garbage', 'I cannot help with that.'],
  ])('returns null for %s', (_l, raw) => {
    expect(parsePersonaResponse(raw)).toBeNull();
  });
});
