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

/**
 * The mechanical effect a deterministic skill action produces.
 *
 * **Vocabulary in transition (Fase 21):** the slim emote vocabulary the
 * classifier emits going forward is `attack | steal | info | coerce | heal |
 * sabotage | repair | craft | persuade | intimidate | disarm | examine_self |
 * narrate_time | narrative`. The LEGACY entries (`relationship`,
 * `disposition`, `haggle`, `appraise`, `traverse`, `none`) remain in the
 * union for backward compatibility with scene + SkillActions switch branches
 * that are still wired today (Fase 21 21C — type superset). They will be
 * removed in 21D-F when the unified Resolver subsumes the old paths.
 */
export type SkillEffect =
  // ─── Slim vocab (Fase 21) — the classifier emits ONLY these going forward.
  | 'attack'         // offensive strike/shot/hack → ambush combat
  | 'steal'          // pickpocket / wire-transfer (surprise)
  | 'info'           // hack/scan to learn about target → PDA entry
  | 'coerce'         // fear → target yields item/credits/info
  | 'heal'           // restore HP (self or another)
  | 'sabotage'       // rig gear (Engenharia melee / IT remote)
  | 'repair'         // restore own item
  | 'craft'          // build melee weapon from scrap
  | 'persuade'       // emote charm/seduction (Fase 21 NEW)
  | 'intimidate'     // emote physical pressure (Fase 21 NEW)
  | 'disarm'         // knock target's weapon to the ground (Fase 21 NEW)
  | 'examine_self'   // *check my wounds* — narrate HP condition (Fase 21 NEW)
  | 'narrate_time'   // *check the time* — narrate diegetic time (Fase 21 NEW)
  | 'narrative'      // pure narration, no mechanic (Fase 21 — renamed from `none`)
  // ─── Legacy (deprecated, kept for type compatibility until 21D-F land).
  | 'relationship'   // → moves to verbal `manipulate` (decision #2)
  | 'disposition'    // → split into emote `persuade` / `intimidate` (decision #2)
  | 'haggle'         // → moves to verbal `commerce_haggle` (decision #2)
  | 'appraise'       // → merged into verbal `commerce_pricing` (decision #2)
  | 'traverse'       // → removed entirely (Atletismo is passive only)
  | 'none';          // → renamed to `narrative` (decision #3)

export const SKILL_EFFECTS: readonly SkillEffect[] = [
  // Slim vocab first (these are what the classifier emits today).
  'attack', 'steal', 'info', 'coerce', 'heal', 'sabotage', 'repair', 'craft',
  'persuade', 'intimidate', 'disarm', 'examine_self', 'narrate_time', 'narrative',
  // Legacy — recognised by the parser if a stray model output uses them.
  'relationship', 'disposition', 'haggle', 'appraise', 'traverse', 'none',
];

export interface ActionClassification {
  deterministic: boolean;
  skillId: string | null;
  attribute: AttributeId | null;
  difficulty: number;
  /** True when the action is aggression aimed at a person present (→ disposition worsens, may start combat). */
  hostile: boolean;
  /** The mechanical effect to apply (Fase 20); `none` = no mechanical result. */
  effect: SkillEffect;
  /** A SECOND NPC named in the action (for NPC↔NPC relationship effects), else null. */
  target2: string | null;
  /** Direction for disposition/relationship effects: 'up' improves, 'down' worsens, null = default per skill. */
  dir: 'up' | 'down' | null;
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

  const effMatch = raw.match(/EFFECT\s*=\s*([a-z_]+)/i);
  const effId = effMatch?.[1]!.toLowerCase();
  const effect: SkillEffect = (effId && SKILL_EFFECTS.includes(effId as SkillEffect))
    ? (effId as SkillEffect) : 'none';

  const t2Match = raw.match(/TARGET2\s*=\s*([^\n\r]+)/i);
  const t2 = t2Match?.[1]!.trim();
  const target2 = (t2 && !/^(none|n\/a|null)$/i.test(t2)) ? t2 : null;

  const dirMatch = raw.match(/DIR\s*=\s*(up|down)\b/i);
  const dir = dirMatch ? (dirMatch[1]!.toLowerCase() as 'up' | 'down') : null;

  return { deterministic, skillId, attribute, difficulty, hostile, effect, target2, dir };
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

// `ferimento(s)` is matched explicitly; `\b` is unreliable around accented letters
// (Lesson 49), so PT-BR variants `sa[úu]de` / `condi[çc][ãa]o` are anchored with the
// same word boundary but the accented ranges are tolerated by the case-insensitive flag.
const SELF_EXAM_RE =
  /\b(wound|wounds|hurt|injur\w*|bleed\w*|health|condition|ferida|ferid\w*|ferimento|ferimentos|sa[úu]de|machuca\w*|condi[çc][ãa]o)\b/i;

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
