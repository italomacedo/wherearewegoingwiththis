/**
 * Pure combat-beat description. Turns a CombatEvent into one plain factual
 * sentence (no numbers): it doubles as the Claude narration seed AND the
 * deterministic fallback line when the CLI is unavailable. Mechanics-only events
 * (end_turn / rejected) return null — nothing to narrate.
 */

import { CombatEvent } from './CombatEncounter';

export type CombatNames = Record<string, string>;

function nameOf(names: CombatNames, id: string | undefined): string {
  if (!id) return 'they';
  return names[id] ?? id;
}

/** A short factual sentence for an event, or null when there is nothing to narrate. */
export function combatBeat(ev: CombatEvent, names: CombatNames): string | null {
  const actor = nameOf(names, ev.actorId);
  const target = nameOf(names, ev.targetId);
  switch (ev.kind) {
    case 'hit': return `${actor} lands a hit on ${target}.`;
    case 'miss': return `${actor} attacks ${target} but misses.`;
    case 'death': return `${actor} drops ${target} for good.`;
    case 'move': return `${actor} repositions.`;
    case 'cover': return `${actor} ducks behind cover.`;
    case 'hunker': return `${actor} hunkers down, fully covered.`;
    case 'reload': return `${actor} reloads.`;
    case 'flee': return `${actor} breaks off and flees.`;
    default: return null; // end_turn / rejected — no narration
  }
}
