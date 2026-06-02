/**
 * Combat side recruitment (pure; Fase 8B). When a fight breaks out between an
 * initiator and a target, every present combatant picks a side by its OWN
 * relationship ledger — there are no factions. The two seed sides are the
 * initiator's (`SIDE_INITIATOR`) and the target's (`SIDE_TARGET`).
 *
 * Each bystander votes by the strength of its bonds toward the two fighters:
 *   - hostile/wary toward a fighter  → join the OPPOSING side (help bring them down)
 *   - friendly toward a fighter      → join THEIR side (defend them)
 *   - neutral                        → no vote
 * Votes are summed by magnitude (hostile=2, wary/friendly=1); the heavier side
 * wins, and a tie (including all-neutral) keeps the bystander OUT of the fight.
 *
 * The caller supplies each participant's `relationTo(otherId)` (the scene reads it
 * from disposition-to-player for the player and from the NPC ledger for NPCs), so
 * this stays a pure function with no NPCAgent/Babylon dependency.
 */

import { NPCDisposition, dispositionMagnitude } from '@entities/NPCAgent';

export const SIDE_INITIATOR = 'A';
export const SIDE_TARGET = 'B';

export interface RecruitParticipant {
  id: string;
  /** How this participant regards another combatant (by id). Defaults handled by caller. */
  relationTo: (otherId: string) => NPCDisposition;
}

export interface RecruitInput {
  /** The combatant who starts the fight (always SIDE_INITIATOR). */
  initiatorId: string;
  /** The combatant being attacked (always SIDE_TARGET). */
  targetId: string;
  /** Everyone present in the scene (must include the initiator and the target). */
  participants: readonly RecruitParticipant[];
}

/** Side a bystander's relationship pushes toward, given how they regard a fighter on `fighterSide`. */
function voteFor(rel: NPCDisposition, fighterSide: string, otherSide: string): string | null {
  if (rel === 'hostile' || rel === 'wary') return otherSide; // oppose this fighter
  if (rel === 'friendly') return fighterSide;                // defend this fighter
  return null;                                               // neutral → no pull
}

/**
 * Assign every recruited combatant to a side. The initiator and target are always
 * included (SIDE_INITIATOR / SIDE_TARGET). Each other participant joins the side its
 * relationships pull hardest toward; ties / all-neutral are omitted (they stay out).
 */
export function recruitSides(input: RecruitInput): Record<string, string> {
  const { initiatorId, targetId, participants } = input;
  const sides: Record<string, string> = { [initiatorId]: SIDE_INITIATOR, [targetId]: SIDE_TARGET };

  for (const p of participants) {
    if (p.id === initiatorId || p.id === targetId) continue;
    let scoreInit = 0; // weight pulling toward SIDE_INITIATOR
    let scoreTarget = 0;
    const tally = (rel: NPCDisposition, fighterSide: string, otherSide: string) => {
      const vote = voteFor(rel, fighterSide, otherSide);
      if (vote === SIDE_INITIATOR) scoreInit += dispositionMagnitude(rel);
      else if (vote === SIDE_TARGET) scoreTarget += dispositionMagnitude(rel);
    };
    tally(p.relationTo(initiatorId), SIDE_INITIATOR, SIDE_TARGET);
    tally(p.relationTo(targetId), SIDE_TARGET, SIDE_INITIATOR);

    if (scoreInit > scoreTarget) sides[p.id] = SIDE_INITIATOR;
    else if (scoreTarget > scoreInit) sides[p.id] = SIDE_TARGET;
    // equal (incl. 0–0 neutral, or a conflicted tie) → stays out of the fight
  }
  return sides;
}
