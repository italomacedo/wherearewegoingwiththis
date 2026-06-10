import type { Gender } from '@entities/CharacterData';

/**
 * Deterministic mapping of speakers → Kokoro voice ids. Pure + fully tested;
 * the actual synthesis lives in TTSService (browser-only). Voice ids are the
 * canonical Kokoro names (af_/bf_ female, am_/bm_ male; "a" = American,
 * "b" = British). A speaker always gets the same voice across a session so a
 * given NPC sounds consistent.
 */

/** Female voice pool (American + British), in stable order. */
export const FEMALE_VOICES: readonly string[] = [
  'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_aoede',
  'af_kore', 'af_nova', 'bf_emma', 'bf_isabella', 'bf_alice',
];

/** Male voice pool (American + British), in stable order. */
export const MALE_VOICES: readonly string[] = [
  'am_adam', 'am_michael', 'am_fenrir', 'am_eric', 'am_liam',
  'am_onyx', 'am_puck', 'bm_george', 'bm_lewis', 'bm_daniel',
];

/** The narrator's fixed voice — a deep, measured British male. */
export const NARRATOR_VOICE = 'bm_george';

/**
 * Hand-picked voices for the named cast, so they don't drift if the pools are
 * reordered. Keyed by NPC id. (Zara = a brighter activist voice; Mback = a
 * smooth corporate fixer.)
 */
export const FIXED_VOICES: Readonly<Record<string, string>> = {
  zara: 'af_bella',
  mback: 'am_onyx',
  // Roxane, the car AI — a cool, composed British female (classic onboard-AI
  // tone, less breathy than af_nicole). Keyed by her exact agent id.
  roxane_car_ai: 'bf_emma',
};

/** A stable 32-bit hash of a string (FNV-1a) — used to pick a pool slot. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface VoiceSubject {
  /** Speaker id (npc id, or 'player'); seeds the deterministic pick. */
  id?: string;
  gender: Gender;
}

/**
 * Resolve a speaker to a Kokoro voice id. A named-cast override wins; otherwise
 * pick deterministically from the gender pool by hashing the id (no id →
 * pool[0], a stable default).
 */
export function voiceForSubject(s: VoiceSubject): string {
  if (s.id && FIXED_VOICES[s.id]) return FIXED_VOICES[s.id]!;
  const pool = s.gender === 'female' ? FEMALE_VOICES : MALE_VOICES;
  const idx = s.id ? hashString(s.id) % pool.length : 0;
  return pool[idx]!;
}

/** The narrator's voice (constant). */
export function narratorVoice(): string {
  return NARRATOR_VOICE;
}
