import {
  VERBAL_VERBS,
  EMOTE_VERBS,
  AUTONOMY_VERBS,
  isVerbalVerb,
  isEmoteVerb,
  isAutonomyVerb,
  FALLBACK_VERB,
} from '@systems/actions/Verbs';

describe('Verbs vocabulary', () => {
  describe('VERBAL_VERBS', () => {
    it('includes all 21 verbal verbs (incl. spice + narrative)', () => {
      expect(VERBAL_VERBS).toHaveLength(21);
      // Job lifecycle
      expect(VERBAL_VERBS).toContain('job_request');
      expect(VERBAL_VERBS).toContain('job_claim');
      expect(VERBAL_VERBS).toContain('job_accept');
      expect(VERBAL_VERBS).toContain('job_decline');
      expect(VERBAL_VERBS).toContain('job_cancel');
      // Spice-trafficking job (Fase 22) — commerce-mirror negotiation
      expect(VERBAL_VERBS).toContain('spice_discovery');
      expect(VERBAL_VERBS).toContain('spice_pricing');
      expect(VERBAL_VERBS).toContain('spice_haggle');
      expect(VERBAL_VERBS).toContain('spice_buy');
      expect(VERBAL_VERBS).toContain('spice_sell');
      expect(VERBAL_VERBS).toContain('spice_report');
      // Commerce
      expect(VERBAL_VERBS).toContain('commerce_discovery');
      expect(VERBAL_VERBS).toContain('commerce_pricing');
      expect(VERBAL_VERBS).toContain('commerce_haggle');
      expect(VERBAL_VERBS).toContain('commerce_buy');
      expect(VERBAL_VERBS).toContain('commerce_sell');
      // Social
      expect(VERBAL_VERBS).toContain('manipulate');
      expect(VERBAL_VERBS).toContain('persuade');
      expect(VERBAL_VERBS).toContain('intimidate');
      expect(VERBAL_VERBS).toContain('info');
      // Fall-through
      expect(VERBAL_VERBS).toContain('narrative');
    });

    it('contains the post-playtest additions (decision #14)', () => {
      // job_cancel is new in Fase 21 (Q&A decision #14: player can cancel an
      // accepted contract at the cost of one disposition step).
      expect(VERBAL_VERBS).toContain('job_cancel');
    });
  });

  describe('EMOTE_VERBS', () => {
    it('includes all 13 emote verbs + narrative (14 total)', () => {
      expect(EMOTE_VERBS).toHaveLength(14);
      expect(EMOTE_VERBS).toEqual(
        expect.arrayContaining([
          'attack', 'steal', 'info', 'coerce', 'medicine_treat', 'sabotage',
          'repair', 'craft', 'persuade', 'intimidate', 'disarm',
          'medicine_check', 'narrate_time', 'narrative',
        ]),
      );
    });

    it('drops the legacy verbs that moved to verbal or were removed', () => {
      // Q&A: relationship/disposition/haggle/appraise → verbal renames;
      // traverse → removed entirely (Atletismo passive instead).
      expect(EMOTE_VERBS).not.toContain('relationship');
      expect(EMOTE_VERBS).not.toContain('disposition');
      expect(EMOTE_VERBS).not.toContain('haggle');
      expect(EMOTE_VERBS).not.toContain('appraise');
      expect(EMOTE_VERBS).not.toContain('traverse');
      expect(EMOTE_VERBS).not.toContain('none'); // renamed to 'narrative'
    });

    it('has medicine_check + narrate_time (decision #1 — replace short-circuits)', () => {
      // The legacy isCheckTimeEmote / isSelfExamEmote regex short-circuits
      // are dropped; their behaviour is folded into first-class verbs.
      // (medicine_check = the old examine_self, renamed to <skill>_<use_case>.)
      expect(EMOTE_VERBS).toContain('medicine_check');
      expect(EMOTE_VERBS).toContain('narrate_time');
    });

    it('has disarm (NEW Fase 21)', () => {
      expect(EMOTE_VERBS).toContain('disarm');
    });
  });

  describe('AUTONOMY_VERBS', () => {
    it('includes the 5 NPC-only locomotion/iniciative primitives', () => {
      expect(AUTONOMY_VERBS).toContain('move_to');
      expect(AUTONOMY_VERBS).toContain('flee_from');
      expect(AUTONOMY_VERBS).toContain('wait');
      expect(AUTONOMY_VERBS).toContain('talk_to');
      // use_item is the only auxiliary NPC verb in Fase 21 (decision #13);
      // the others (pickup/drop/equip/unequip) are deferred to Fase 22.
      expect(AUTONOMY_VERBS).toContain('use_item');
    });

    it('does NOT include the deferred auxiliary verbs (decision #13)', () => {
      expect(AUTONOMY_VERBS).not.toContain('pickup');
      expect(AUTONOMY_VERBS).not.toContain('drop');
      expect(AUTONOMY_VERBS).not.toContain('equip');
      expect(AUTONOMY_VERBS).not.toContain('unequip');
    });

    it('includes the verbal/emote subset relevant to NPCs', () => {
      expect(AUTONOMY_VERBS).toEqual(
        expect.arrayContaining([
          'attack', 'steal', 'info', 'sabotage', 'medicine_treat',
          'intimidate', 'persuade', 'manipulate', 'commerce_pricing', 'narrative',
        ]),
      );
    });
  });

  describe('type guards', () => {
    it('isVerbalVerb accepts vocabulary entries and rejects others', () => {
      expect(isVerbalVerb('job_request')).toBe(true);
      expect(isVerbalVerb('narrative')).toBe(true);
      expect(isVerbalVerb('move_to')).toBe(false); // autonomy-only
      expect(isVerbalVerb('disarm')).toBe(false); // emote-only
      expect(isVerbalVerb('')).toBe(false);
      expect(isVerbalVerb('not_a_verb')).toBe(false);
    });

    it('isEmoteVerb accepts vocabulary entries and rejects others', () => {
      expect(isEmoteVerb('attack')).toBe(true);
      expect(isEmoteVerb('medicine_check')).toBe(true);
      expect(isEmoteVerb('narrative')).toBe(true);
      expect(isEmoteVerb('job_request')).toBe(false); // verbal-only
      expect(isEmoteVerb('wait')).toBe(false); // autonomy-only
      expect(isEmoteVerb('relationship')).toBe(false); // legacy, removed
    });

    it('isAutonomyVerb accepts vocabulary entries and rejects others', () => {
      expect(isAutonomyVerb('move_to')).toBe(true);
      expect(isAutonomyVerb('use_item')).toBe(true);
      expect(isAutonomyVerb('attack')).toBe(true); // shared with emote
      expect(isAutonomyVerb('narrative')).toBe(true);
      expect(isAutonomyVerb('medicine_check')).toBe(false); // emote-only
      expect(isAutonomyVerb('job_request')).toBe(false); // verbal-only
    });
  });

  describe('FALLBACK_VERB', () => {
    it('is "narrative" — the unparseable/unknown fallback', () => {
      expect(FALLBACK_VERB).toBe('narrative');
    });

    it('belongs to all three vocabularies (so parser degrade is always safe)', () => {
      expect(isVerbalVerb(FALLBACK_VERB)).toBe(true);
      expect(isEmoteVerb(FALLBACK_VERB)).toBe(true);
      expect(isAutonomyVerb(FALLBACK_VERB)).toBe(true);
    });
  });
});
