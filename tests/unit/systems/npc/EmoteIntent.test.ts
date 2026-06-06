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
      expect(isSelfExamEmote('*examino meus ferimentos*')).toBe(true); // pt-BR plural (Fase 20 fix)
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
      expect(r.hostile).toBe(false);
      expect(r.effect).toBe('none');
      expect(r.target2).toBeNull();
      expect(r.dir).toBeNull();
    });
    it('parses EFFECT/TARGET2/DIR (Fase 20)', () => {
      const r = parseActionClassification(
        'VERDICT=DETERMINISTIC\nSKILL=tecnologia_informacao\nATTR=inteligencia\nDIFF=hard\nEFFECT=relationship\nTARGET2=Mback\nDIR=down');
      expect(r.effect).toBe('relationship');
      expect(r.target2).toBe('Mback');
      expect(r.dir).toBe('down');
    });
    it('EFFECT defaults to none when invalid/absent; TARGET2=none → null', () => {
      const r = parseActionClassification('VERDICT=DETERMINISTIC\nEFFECT=teleport\nTARGET2=none\nDIR=sideways');
      expect(r.effect).toBe('none');
      expect(r.target2).toBeNull();
      expect(r.dir).toBeNull();
    });
    it('parses EFFECT=steal and DIR=up', () => {
      const r = parseActionClassification('VERDICT=DETERMINISTIC\nSKILL=furtividade\nEFFECT=steal\nDIR=up');
      expect(r.effect).toBe('steal');
      expect(r.dir).toBe('up');
    });
    it('accepts the new Fase 21 slim-vocab verbs (disarm/persuade/intimidate/examine_self/narrate_time/narrative)', () => {
      const verbs = ['disarm', 'persuade', 'intimidate', 'examine_self', 'narrate_time', 'narrative'];
      verbs.forEach((v) => {
        const r = parseActionClassification(`VERDICT=DETERMINISTIC\nEFFECT=${v}`);
        expect(r.effect).toBe(v);
      });
    });
    it('still accepts legacy verbs for backward compat (deprecated, removed in 21D-F)', () => {
      // The classifier no longer EMITS these (the new prompt teaches only the slim vocab),
      // but the parser is tolerant so a stray output is still recognised rather than
      // silently degrading. Lets us catch unexpected legacy emissions in logs.
      const verbs = ['relationship', 'disposition', 'haggle', 'appraise', 'traverse', 'none'];
      verbs.forEach((v) => {
        const r = parseActionClassification(`VERDICT=DETERMINISTIC\nEFFECT=${v}`);
        expect(r.effect).toBe(v);
      });
    });
    it('parses HOSTILE=yes (and treats sim/true as hostile)', () => {
      expect(parseActionClassification('VERDICT=DETERMINISTIC\nSKILL=combate_corpo_a_corpo\nATTR=forca\nDIFF=medium\nHOSTILE=yes').hostile).toBe(true);
      expect(parseActionClassification('HOSTILE=sim').hostile).toBe(true);
      expect(parseActionClassification('VERDICT=DETERMINISTIC\nHOSTILE=no').hostile).toBe(false);
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
