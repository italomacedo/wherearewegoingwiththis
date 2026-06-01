import {
  hasEmote, emoteTexts, isCheckTimeEmote, parseEmoteVerdict, narrateTime, DETERMINISTIC_PLACEHOLDER,
  isSelfExamEmote, difficultyValue, parseActionClassification, DIFFICULTY_LEVELS,
} from '../../../../src/systems/npc/EmoteIntent';

describe('EmoteIntent (pure)', () => {
  describe('hasEmote / emoteTexts', () => {
    it('detects *emote* segments', () => {
      expect(hasEmote('*draws a knife* back off')).toBe(true);
      expect(hasEmote('just talking')).toBe(false);
      expect(hasEmote('**')).toBe(false); // empty emote
    });
    it('extracts trimmed emote texts', () => {
      expect(emoteTexts('*  glances up * "hi" *checks watch*')).toEqual(['glances up', 'checks watch']);
      expect(emoteTexts('no emotes here')).toEqual([]);
    });
  });

  describe('isCheckTimeEmote', () => {
    it('matches time-checking actions (en + pt)', () => {
      expect(isCheckTimeEmote('*checks the time*')).toBe(true);
      expect(isCheckTimeEmote('*glances at my watch*')).toBe(true);
      expect(isCheckTimeEmote('*olho que horas são*')).toBe(true);
      expect(isCheckTimeEmote('*confiro o relógio*')).toBe(true);
    });
    it('does not match unrelated emotes or plain speech', () => {
      expect(isCheckTimeEmote('*lights a cigarette*')).toBe(false);
      expect(isCheckTimeEmote('what time is it?')).toBe(false); // not in an emote
    });
  });

  describe('parseEmoteVerdict', () => {
    it('returns DETERMINISTIC only on an explicit verdict', () => {
      expect(parseEmoteVerdict('DETERMINISTIC')).toBe('DETERMINISTIC');
      expect(parseEmoteVerdict('  deterministic.\n')).toBe('DETERMINISTIC');
    });
    it('fails open to NARRATIVE otherwise', () => {
      expect(parseEmoteVerdict('NARRATIVE')).toBe('NARRATIVE');
      expect(parseEmoteVerdict('garbled noise')).toBe('NARRATIVE');
      expect(parseEmoteVerdict('')).toBe('NARRATIVE');
    });
  });

  describe('isSelfExamEmote', () => {
    it('matches checking your own condition (en + pt)', () => {
      expect(isSelfExamEmote('*check my wounds*')).toBe(true);
      expect(isSelfExamEmote('*avalio meu ferimento*')).toBe(true);
      expect(isSelfExamEmote('*how is my health*')).toBe(true);
    });
    it('does not match unrelated emotes', () => {
      expect(isSelfExamEmote('*lights a cigarette*')).toBe(false);
    });
  });

  describe('difficultyValue', () => {
    it('maps levels to numbers, defaulting to medium', () => {
      expect(difficultyValue('trivial')).toBe(DIFFICULTY_LEVELS.trivial);
      expect(difficultyValue('HARD')).toBe(65);
      expect(difficultyValue('nonsense')).toBe(50);
    });
  });

  describe('parseActionClassification', () => {
    it('parses a full structured reply', () => {
      const r = parseActionClassification('VERDICT=DETERMINISTIC\nSKILL=furtividade\nATTR=destreza\nDIFF=hard');
      expect(r.deterministic).toBe(true);
      expect(r.skillId).toBe('furtividade');
      expect(r.attribute).toBe('destreza');
      expect(r.difficulty).toBe(65);
    });
    it('infers the attribute from the skill when ATTR is missing/invalid', () => {
      const r = parseActionClassification('VERDICT=DETERMINISTIC\nSKILL=medicina\nDIFF=easy');
      expect(r.attribute).toBe('inteligencia');
      expect(r.difficulty).toBe(35);
    });
    it('SKILL=none → null skill, keeps the named attribute', () => {
      const r = parseActionClassification('VERDICT=DETERMINISTIC\nSKILL=none\nATTR=forca\nDIFF=medium');
      expect(r.skillId).toBeNull();
      expect(r.attribute).toBe('forca');
    });
    it('NARRATIVE verdict + defaults when unspecified', () => {
      const r = parseActionClassification('VERDICT=NARRATIVE');
      expect(r.deterministic).toBe(false);
      expect(r.skillId).toBeNull();
      expect(r.attribute).toBeNull();
      expect(r.difficulty).toBe(50);
    });
  });

  describe('narrateTime / placeholder', () => {
    it('narrates the time diegetically', () => {
      expect(narrateTime('22:15', 'night')).toContain('22:15');
      expect(narrateTime('22:15', 'night')).toContain('night');
    });
    it('placeholder mentions a skill check', () => {
      expect(DETERMINISTIC_PLACEHOLDER.toLowerCase()).toContain('skill check');
    });
  });
});
