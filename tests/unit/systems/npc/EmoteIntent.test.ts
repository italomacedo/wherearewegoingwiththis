import {
  hasEmote, emoteTexts, isCheckTimeEmote, parseEmoteVerdict, narrateTime, DETERMINISTIC_PLACEHOLDER,
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
