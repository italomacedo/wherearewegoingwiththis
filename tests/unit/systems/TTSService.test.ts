import {
  TTSService, ttsSpeechText, shouldSpeak, KOKORO_MODEL_ID, KOKORO_DTYPE,
  toAudioFrame, spatialParamsFor, PANNER_REF_DISTANCE, PANNER_MAX_DISTANCE, PANNER_ROLLOFF,
} from '@systems/TTSService';
import { SettingsService } from '@systems/SettingsService';
import { ServiceLocator } from '@core/ServiceLocator';
import { FIXED_VOICES, NARRATOR_VOICE } from '@systems/VoiceAssigner';

describe('TTSService pure helpers', () => {
  it('ttsSpeechText strips emotes and collapses whitespace', () => {
    expect(ttsSpeechText('*smiles* Hello   there *waves*')).toBe('Hello there');
    expect(ttsSpeechText('Plain line')).toBe('Plain line');
  });

  it('ttsSpeechText is empty for an all-emote line', () => {
    expect(ttsSpeechText('*shrugs* *looks away*')).toBe('');
  });

  it('shouldSpeak requires TTS enabled and non-empty speech', () => {
    expect(shouldSpeak('Hello', true)).toBe(true);
    expect(shouldSpeak('Hello', false)).toBe(false);
    expect(shouldSpeak('*nods*', true)).toBe(false);
    expect(shouldSpeak('', true)).toBe(false);
  });

  it('exposes the Kokoro model id + dtype constants', () => {
    expect(KOKORO_MODEL_ID).toContain('Kokoro');
    expect(KOKORO_DTYPE).toBe('q8');
  });
});

describe('TTSService spatial-audio helpers', () => {
  it('toAudioFrame negates Z (Babylon left-handed → Web Audio right-handed)', () => {
    // An NPC to the right and in front of the world origin.
    expect(toAudioFrame({ x: 5, y: 1, z: 8 })).toEqual({ x: 5, y: 1, z: -8 });
    expect(toAudioFrame({ x: -2, y: 0, z: -3 })).toEqual({ x: -2, y: 0, z: 3 });
  });

  it('applying toAudioFrame to both source and listener keeps left/right coherent', () => {
    // Listener at origin facing +Z; an NPC off to the +X (screen-right) side.
    const npc = toAudioFrame({ x: 4, y: 0, z: 0 });
    // X (left/right) is preserved, so a screen-right NPC stays to the right.
    expect(npc.x).toBeGreaterThan(0);
  });

  it('spatialParamsFor pans only with a finite source position', () => {
    expect(spatialParamsFor({ x: 1, y: 2, z: 3 })).toEqual({ panned: true });
    expect(spatialParamsFor(null)).toEqual({ panned: false });
    expect(spatialParamsFor(undefined)).toEqual({ panned: false });
    expect(spatialParamsFor({ x: NaN, y: 0, z: 0 })).toEqual({ panned: false });
    expect(spatialParamsFor({ x: 0, y: Infinity, z: 0 })).toEqual({ panned: false });
  });

  it('exposes sane panner attenuation constants', () => {
    expect(PANNER_REF_DISTANCE).toBeGreaterThan(0);
    expect(PANNER_MAX_DISTANCE).toBeGreaterThan(PANNER_REF_DISTANCE);
    expect(PANNER_ROLLOFF).toBeGreaterThan(0);
  });
});

describe('TTSService (speak gating, headless)', () => {
  afterEach(() => {
    SettingsService.reset();
    ServiceLocator.clear();
  });

  it('speak is a safe no-op headlessly and does not throw', () => {
    const tts = new TTSService();
    SettingsService.set('ttsEnabled', true);
    expect(() => tts.speak(FIXED_VOICES.zara!, 'Hello stranger')).not.toThrow();
  });

  it('speak returns early when TTS is disabled', () => {
    const tts = new TTSService();
    SettingsService.set('ttsEnabled', false);
    expect(() => tts.speak(NARRATOR_VOICE, 'The street falls silent')).not.toThrow();
  });

  it('speakSubject and speakNarrator route through speak without throwing', () => {
    const tts = new TTSService();
    SettingsService.set('ttsEnabled', true);
    expect(() => tts.speakSubject({ id: 'zara', gender: 'female' }, 'Watch yourself.')).not.toThrow();
    expect(() => tts.speakNarrator('A blade flashes in the neon.')).not.toThrow();
  });

  it('cancel and dispose are safe no-ops headlessly', () => {
    const tts = new TTSService();
    expect(() => tts.cancel()).not.toThrow();
    expect(() => tts.dispose()).not.toThrow();
  });
});
