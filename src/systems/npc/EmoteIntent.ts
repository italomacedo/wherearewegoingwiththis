/**
 * Pure helpers for the emote pipeline (Phase 2 scaffolding for the Phase 4 cRPG
 * checks). After moderation, a message that contains an *emote* is classified as
 * DETERMINISTIC (an action that should resolve via a cRPG/skill check) or
 * NARRATIVE (just roleplay → goes to the NPC/ambient as normal chat).
 *
 * Phase 2 wiring: NARRATIVE flows to the NPC; DETERMINISTIC is narrated — the
 * "check the time" action narrates the in-world clock (no skill needed), any
 * other deterministic action narrates a placeholder until Phase 4 hooks real
 * skill checks. All pure + unit-tested.
 */

import { AttributeId, ATTRIBUTES, skillDef } from '@entities/CharacterStats';

export type EmoteVerdict = 'DETERMINISTIC' | 'NARRATIVE';

/** Difficulty levels the classifier may pick → the opponent value for a check. */
export const DIFFICULTY_LEVELS = {
  trivial: 20,
  easy: 35,
  medium: 50,
  hard: 65,
  extreme: 80,
} as const;

export type DifficultyLevel = keyof typeof DIFFICULTY_LEVELS;

/** Map a difficulty word → its value, defaulting to medium (50). */
export function difficultyValue(level: string): number {
  const key = level.toLowerCase() as DifficultyLevel;
  return DIFFICULTY_LEVELS[key] ?? DIFFICULTY_LEVELS.medium;
}

export interface ActionClassification {
  deterministic: boolean;
  skillId: string | null;
  attribute: AttributeId | null;
  difficulty: number;
  /** True when the action is aggression aimed at a person present (→ disposition worsens, may start combat). */
  hostile: boolean;
}

/**
 * Parse the structured action-classifier reply (lenient). Expected lines:
 *   VERDICT=DETERMINISTIC|NARRATIVE / SKILL=<id|none> / ATTR=<id> / DIFF=<level>
 * Unparseable bits fall back: skill→null, attribute→the skill's attribute (if any)
 * else null, difficulty→medium. Fails toward NARRATIVE only on a missing verdict.
 */
export function parseActionClassification(raw: string): ActionClassification {
  const deterministic = /\bDETERMINISTIC\b/i.test(raw);

  const skillMatch = raw.match(/SKILL\s*=\s*([a-z_]+)/i);
  let skillId: string | null = null;
  if (skillMatch && skillDef(skillMatch[1]!.toLowerCase())) skillId = skillMatch[1]!.toLowerCase();

  const attrMatch = raw.match(/ATTR\s*=\s*([a-z_]+)/i);
  let attribute: AttributeId | null = null;
  const isAttr = (id: string): id is AttributeId => ATTRIBUTES.some((a) => a.id === id);
  if (attrMatch && isAttr(attrMatch[1]!.toLowerCase())) attribute = attrMatch[1]!.toLowerCase() as AttributeId;
  else if (skillId) attribute = skillDef(skillId)!.attribute;

  const diffMatch = raw.match(/DIFF\s*=\s*([a-z]+)/i);
  const difficulty = diffMatch ? difficultyValue(diffMatch[1]!) : DIFFICULTY_LEVELS.medium;

  const hostile = /HOSTILE\s*=\s*(yes|true|sim)\b/i.test(raw);

  return { deterministic, skillId, attribute, difficulty, hostile };
}

/** True when the message contains at least one *emote* segment. */
export function hasEmote(message: string): boolean {
  return /\*[^*]+\*/.test(message);
}

/** The trimmed text of each *emote* segment in the message. */
export function emoteTexts(message: string): string[] {
  const re = /\*([^*]+)\*/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const t = m[1]!.trim();
    if (t) out.push(t);
  }
  return out;
}

const TIME_RE = /\b(time|clock|hour|hora|horas|rel[óo]gio|watch)\b/i;

/** True when an emote is the player checking the time (deterministic, no skill). */
export function isCheckTimeEmote(message: string): boolean {
  return emoteTexts(message).some((t) => TIME_RE.test(t));
}

const SELF_EXAM_RE =
  /\b(wound|wounds|hurt|injur\w*|bleed\w*|health|condition|ferida|ferid\w*|ferimento|sa[úu]de|machuca\w*|condi[çc][ãa]o)\b/i;

/** True when an emote is the player checking their own condition (Medicina-gated). */
export function isSelfExamEmote(message: string): boolean {
  return emoteTexts(message).some((t) => SELF_EXAM_RE.test(t));
}

/** Parse a classifier reply. Fails OPEN to NARRATIVE (never blocks normal chat). */
export function parseEmoteVerdict(raw: string): EmoteVerdict {
  return /\bDETERMINISTIC\b/i.test(raw) ? 'DETERMINISTIC' : 'NARRATIVE';
}

/** Diegetic narration of the current time (the "check the time" emote result). */
export function narrateTime(label: string, period: string): string {
  return `You check the time — it's ${label} (${period}).`;
}

/** Placeholder result for a deterministic action until Phase 4 wires skill checks. */
export const DETERMINISTIC_PLACEHOLDER =
  "You set about it — but the outcome will hinge on a skill check that isn't wired up yet.";
