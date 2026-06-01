import { NPCDisposition, NPCMood } from '@entities/NPCAgent';

/**
 * Intent deliberation — the "what does this NPC want to do right now" layer of
 * the Fase 5 two-layer brain. A throttled Claude call picks ONE item from a
 * constrained menu; the deterministic navigation/gossip layer then carries it
 * out. The menu is tiny on purpose so each deliberation is cheap and the output
 * parses 1:1 to an action.
 *
 * Pure: prompt building + parsing have no side effects and are unit-tested.
 * `attack` is a reserved stub here — Fase 5 only logs/flags it; turn-based
 * combat consumes it later.
 */
export type IntentKind = 'stay' | 'approach' | 'attack' | 'react_to_player';

export interface NPCIntent {
  kind: IntentKind;
  /** For approach/attack: the chosen nearby NPC's id (validated against candidates). */
  targetNpcId?: string;
}

/** A nearby NPC the deliberating agent may target. */
export interface IntentCandidate {
  id: string;
  /** Display name as THIS agent knows it (or a vague label). */
  name: string;
}

export interface IntentPromptInputs {
  selfName: string;
  role: string;
  mood: NPCMood;
  disposition: NPCDisposition;
  gameTime: string;
  /** Other NPCs within reach the agent could approach/attack. */
  nearbyNpcs: IntentCandidate[];
  /** Whether the player is present in the scene right now. */
  playerPresent: boolean;
}

const VALID_KINDS: readonly IntentKind[] = ['stay', 'approach', 'attack', 'react_to_player'];

/**
 * Parse the deliberation output. Lenient: scans for INTENT=/TARGET= lines in any
 * order/case. Falls back to `stay` for anything unrecognised. `approach`/`attack`
 * REQUIRE a target that is in `validTargetIds`; otherwise they degrade to `stay`
 * (an NPC can't approach/attack someone who isn't there). `react_to_player`
 * degrades to `stay` when the player is absent.
 */
export function parseIntent(
  raw: string,
  validTargetIds: readonly string[],
  playerPresent: boolean,
): NPCIntent {
  const text = raw ?? '';
  const kindMatch = /INTENT\s*=\s*([a-z_]+)/i.exec(text);
  const targetMatch = /TARGET\s*=\s*([^\s]+)/i.exec(text);
  const kindRaw = (kindMatch?.[1] ?? 'stay').toLowerCase();
  const kind = (VALID_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as IntentKind) : 'stay';
  const targetRaw = targetMatch?.[1]?.trim();
  const target = targetRaw && targetRaw.toLowerCase() !== 'none' ? targetRaw : undefined;

  if (kind === 'approach' || kind === 'attack') {
    if (target && validTargetIds.includes(target)) return { kind, targetNpcId: target };
    return { kind: 'stay' };
  }
  if (kind === 'react_to_player') {
    return playerPresent ? { kind: 'react_to_player' } : { kind: 'stay' };
  }
  return { kind: 'stay' };
}
