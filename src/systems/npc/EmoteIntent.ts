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

export type EmoteVerdict = 'DETERMINISTIC' | 'NARRATIVE';

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
