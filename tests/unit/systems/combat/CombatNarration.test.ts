import { combatBeat } from '@systems/combat/CombatNarration';
import { CombatEvent } from '@systems/combat/CombatEncounter';

const names = { player: 'Hero', zara: 'Zara' };

function ev(over: Partial<CombatEvent>): CombatEvent {
  return { kind: 'hit', actorId: 'player', ...over } as CombatEvent;
}

describe('combatBeat', () => {
  it('describes a hit / miss / death with names', () => {
    expect(combatBeat(ev({ kind: 'hit', targetId: 'zara' }), names)).toBe('Hero lands a hit on Zara.');
    expect(combatBeat(ev({ kind: 'miss', targetId: 'zara' }), names)).toBe('Hero attacks Zara but misses.');
    expect(combatBeat(ev({ kind: 'death', actorId: 'zara', targetId: 'player' }), names)).toBe('Zara drops Hero for good.');
  });
  it('describes movement and defensive beats', () => {
    expect(combatBeat(ev({ kind: 'move' }), names)).toBe('Hero repositions.');
    expect(combatBeat(ev({ kind: 'cover' }), names)).toBe('Hero ducks behind cover.');
    expect(combatBeat(ev({ kind: 'hunker' }), names)).toBe('Hero hunkers down, fully covered.');
    expect(combatBeat(ev({ kind: 'reload' }), names)).toBe('Hero reloads.');
    expect(combatBeat(ev({ kind: 'flee', actorId: 'zara' }), names)).toBe('Zara breaks off and flees.');
  });
  it('returns null for mechanics-only events', () => {
    expect(combatBeat(ev({ kind: 'end_turn' }), names)).toBeNull();
    expect(combatBeat(ev({ kind: 'rejected' }), names)).toBeNull();
  });
  it('falls back to the id when a name is unknown, and "they" for a missing target', () => {
    expect(combatBeat(ev({ kind: 'hit', actorId: 'ghost', targetId: 'zara' }), names)).toBe('ghost lands a hit on Zara.');
    expect(combatBeat(ev({ kind: 'hit', actorId: 'player', targetId: undefined }), names)).toBe('Hero lands a hit on they.');
  });
});
