import {
  FEMALE_VOICES, MALE_VOICES, NARRATOR_VOICE, FIXED_VOICES,
  hashString, voiceForSubject, narratorVoice,
} from '@systems/VoiceAssigner';

describe('VoiceAssigner', () => {
  it('hashString is deterministic and unsigned', () => {
    expect(hashString('zara')).toBe(hashString('zara'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('anything')).toBeGreaterThanOrEqual(0);
  });

  it('named-cast overrides win over the gender pool', () => {
    expect(voiceForSubject({ id: 'zara', gender: 'female' })).toBe(FIXED_VOICES.zara);
    expect(voiceForSubject({ id: 'mback', gender: 'male' })).toBe(FIXED_VOICES.mback);
  });

  it('Roxane (car AI) has a fixed female voice regardless of the passed gender', () => {
    // She has no avatar, so the scene may pass either gender — the fixed id wins.
    expect(voiceForSubject({ id: 'roxane_car_ai', gender: 'male' })).toBe(FIXED_VOICES.roxane_car_ai);
    expect(FEMALE_VOICES).toContain(FIXED_VOICES.roxane_car_ai);
  });

  it('picks a female voice for female speakers and male for male', () => {
    const f = voiceForSubject({ id: 'someNpc', gender: 'female' });
    const m = voiceForSubject({ id: 'someNpc', gender: 'male' });
    expect(FEMALE_VOICES).toContain(f);
    expect(MALE_VOICES).toContain(m);
  });

  it('is stable for the same id+gender across calls', () => {
    const a = voiceForSubject({ id: 'guardX', gender: 'male' });
    const b = voiceForSubject({ id: 'guardX', gender: 'male' });
    expect(a).toBe(b);
  });

  it('falls back to the first pool entry when no id is given', () => {
    expect(voiceForSubject({ gender: 'female' })).toBe(FEMALE_VOICES[0]);
    expect(voiceForSubject({ gender: 'male' })).toBe(MALE_VOICES[0]);
  });

  it('narratorVoice is the constant narrator voice', () => {
    expect(narratorVoice()).toBe(NARRATOR_VOICE);
    expect(MALE_VOICES).toContain(NARRATOR_VOICE);
  });

  it('pools are non-empty and disjoint', () => {
    expect(FEMALE_VOICES.length).toBeGreaterThan(0);
    expect(MALE_VOICES.length).toBeGreaterThan(0);
    const overlap = FEMALE_VOICES.filter((v) => MALE_VOICES.includes(v));
    expect(overlap).toEqual([]);
  });
});
