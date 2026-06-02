import { recruitSides, RecruitParticipant, SIDE_INITIATOR, SIDE_TARGET } from '@systems/combat/CombatRecruiter';
import { NPCDisposition } from '@entities/NPCAgent';

/** A participant whose relationships are a fixed lookup table (default neutral). */
function p(id: string, rels: Record<string, NPCDisposition> = {}): RecruitParticipant {
  return { id, relationTo: (other) => rels[other] ?? 'neutral' };
}

describe('recruitSides', () => {
  it('always places the initiator and target on opposite seed sides', () => {
    const sides = recruitSides({ initiatorId: 'player', targetId: 'mback', participants: [p('player'), p('mback')] });
    expect(sides.player).toBe(SIDE_INITIATOR);
    expect(sides.mback).toBe(SIDE_TARGET);
  });

  it('THE scenario: Zara (wary→Mback) joins the player attacking Mback', () => {
    const sides = recruitSides({
      initiatorId: 'player',
      targetId: 'mback',
      participants: [p('player'), p('mback'), p('zara', { mback: 'wary' })],
    });
    expect(sides.zara).toBe(SIDE_INITIATOR); // wary toward Mback → opposes him → player's side
  });

  it('a fighter the bystander likes pulls them onto that fighter side', () => {
    const sides = recruitSides({
      initiatorId: 'player',
      targetId: 'mback',
      participants: [p('player'), p('mback'), p('goon', { mback: 'friendly' })],
    });
    expect(sides.goon).toBe(SIDE_TARGET); // friendly to Mback → defends him (against the player)
  });

  it('a neutral bystander stays out of the fight', () => {
    const sides = recruitSides({
      initiatorId: 'player',
      targetId: 'mback',
      participants: [p('player'), p('mback'), p('passerby')],
    });
    expect(sides.passerby).toBeUndefined();
  });

  it('a conflicted tie keeps the bystander out', () => {
    // wary toward BOTH fighters → equal pull to each side → out.
    const sides = recruitSides({
      initiatorId: 'player',
      targetId: 'mback',
      participants: [p('player'), p('mback'), p('torn', { player: 'wary', mback: 'wary' })],
    });
    expect(sides.torn).toBeUndefined();
  });

  it('a stronger bond breaks the tie (hostile outweighs wary)', () => {
    // hostile toward the player (mag 2) vs wary toward Mback (mag 1) → joins Mback's side.
    const sides = recruitSides({
      initiatorId: 'player',
      targetId: 'mback',
      participants: [p('player'), p('mback'), p('thug', { player: 'hostile', mback: 'wary' })],
    });
    expect(sides.thug).toBe(SIDE_TARGET);
  });
});
