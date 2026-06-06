/**
 * Verbal classifier output + tolerant parser (Fase 21).
 *
 * Mirrors the shape of the action classifier (`parseActionClassification` in
 * `EmoteIntent.ts`) but for SPEECH messages — the player text contains no
 * `*emote*`. Output is a small fixed format the Claude one-shot emits as
 * lines; the parser is forgiving (case-insensitive, ignores unknown labels,
 * degrades unparseable verbs to `narrative`).
 *
 * The classifier prompt is built by `PromptBuilder.buildVerbalClassifierPrompt`;
 * the Claude one-shot is `ClaudeNPCService.classifyVerbal`.
 *
 * Vocabulary is in `Verbs.ts → VerbalVerb / VERBAL_VERBS` (15 + narrative).
 * Fields by verb:
 *   - job_request/claim/accept/decline/cancel : verb only (game picks target).
 *   - commerce_discovery                       : verb only.
 *   - commerce_pricing/buy/sell                : verb + ITEM (sellable id).
 *   - commerce_haggle                          : verb (+ optional PRICE proposal).
 *   - manipulate                               : verb + TARGET (3rd party npc id) + DIR.
 *   - persuade / intimidate                    : verb only (addressee is the target).
 *   - info                                     : verb + TARGET (npc id being asked about).
 *   - narrative                                : fall-through; verb only.
 */

import { VerbalVerb, isVerbalVerb, FALLBACK_VERB } from './Verbs';

export type Dir = 'up' | 'down' | null;

export interface VerbalClassification {
  verb: VerbalVerb;
  /** A second NPC the verb refers to (for `manipulate` / `info` / future). null when N/A. */
  target: string | null;
  /** Item id (sellable from the NPC's inventory) for `commerce_*`. null when N/A. */
  itemId: string | null;
  /** Price the player PROPOSES in a `commerce_haggle`. Non-positive integer → null. */
  proposedPrice: number | null;
  /** Direction hint for `manipulate` (improve/worsen target's standing). null when N/A. */
  dir: Dir;
}

const NONE: VerbalClassification = {
  verb: FALLBACK_VERB,
  target: null,
  itemId: null,
  proposedPrice: null,
  dir: null,
};

/** Read one `KEY=value` line by name (case-insensitive). Returns trimmed value or ''.
 *  Tolerates leading whitespace on the line so multi-line / pretty-printed
 *  classifier outputs parse cleanly. */
function field(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^\\s*${key}=(.*)$`, 'im'));
  return (m?.[1] ?? '').trim();
}

/** Lowercase + trim helper that treats 'none'/'' as null. */
function pickId(value: string, allowed?: readonly string[]): string | null {
  const v = value.trim();
  if (!v || v.toLowerCase() === 'none') return null;
  if (allowed && !allowed.includes(v)) return null;
  return v;
}

/**
 * Parse the verbal classifier output. Unknown verbs degrade to `narrative`;
 * unknown ids in TARGET/ITEM (when allowed lists are given) become null;
 * an unparseable PRICE becomes null. Fail-open by design — the pipeline
 * never blocks on a malformed classifier reply.
 */
export function parseVerbalClassification(
  raw: string,
  opts?: { rivalIds?: readonly string[]; sellableIds?: readonly string[]; npcIds?: readonly string[] },
): VerbalClassification {
  if (!raw) return { ...NONE };

  const verbRaw = field(raw, 'VERB').toLowerCase();
  const verb: VerbalVerb = isVerbalVerb(verbRaw) ? verbRaw : FALLBACK_VERB;

  // TARGET is validated against the union of rivalIds/npcIds when provided.
  const allowedTargets = opts?.npcIds ?? opts?.rivalIds;
  const target = pickId(field(raw, 'TARGET'), allowedTargets);

  const itemId = pickId(field(raw, 'ITEM'), opts?.sellableIds);

  const priceRaw = field(raw, 'PRICE');
  const priceNum = Math.floor(Number(priceRaw));
  const proposedPrice = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null;

  const dirRaw = field(raw, 'DIR').toLowerCase();
  const dir: Dir = dirRaw === 'up' ? 'up' : dirRaw === 'down' ? 'down' : null;

  return { verb, target, itemId, proposedPrice, dir };
}
