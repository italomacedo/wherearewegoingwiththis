import {
  resolveSkillAction, SkillActionInput, SkillTargetInfo, SKILL_ACTION_RADIUS,
} from '../../../../src/systems/skills/SkillActions';
import { SkillEffect } from '../../../../src/systems/npc/EmoteIntent';

const target = (over: Partial<SkillTargetInfo> = {}): SkillTargetInfo => ({
  id: 'npc1', otherId: null, distance: 5, aware: false, alive: true,
  perception: 20, infotech: 20, charisma: 20, hasDeck: false, ...over,
});

const input = (over: Partial<SkillActionInput> = {}): SkillActionInput => ({
  effect: 'info', skillId: 'tecnologia_informacao', skillValue: 60, difficulty: 50,
  dir: null, hasCyberdeck: true, hasScrap: false, target: target(), ...over,
});

// Deterministic rolls: low = success, high = fail.
const rollLow = () => 0.01;   // ~1 on d100
const rollMid = () => 0.5;    // 50
const rollHigh = () => 0.999; // ~99.9

describe('SkillActions — gating', () => {
  it('blocks an IT action without a cyberdeck (no_tool)', () => {
    const r = resolveSkillAction(input({ hasCyberdeck: false }), rollLow);
    expect(r.allowed).toBe(false);
    expect(r.blockedReason).toBe('no_tool');
    expect(r.mutations).toEqual([]);
  });

  it('allows an IT action with a cyberdeck', () => {
    expect(resolveSkillAction(input(), rollLow).allowed).toBe(true);
  });

  it('blocks craft without scrap', () => {
    const r = resolveSkillAction(input({ effect: 'craft', skillId: 'engenharia', hasScrap: false, target: null }), rollLow);
    expect(r.blockedReason).toBe('no_tool');
  });

  it('blocks a target-required effect with no target', () => {
    expect(resolveSkillAction(input({ target: null }), rollLow).blockedReason).toBe('no_target');
  });

  it('blocks a dead target', () => {
    expect(resolveSkillAction(input({ target: target({ alive: false }) }), rollLow).blockedReason).toBe('dead_target');
  });

  it('blocks an out-of-range target', () => {
    const r = resolveSkillAction(input({ target: target({ distance: SKILL_ACTION_RADIUS + 1 }) }), rollLow);
    expect(r.blockedReason).toBe('out_of_range');
  });

  it('blocks a relationship effect without a second target', () => {
    const r = resolveSkillAction(input({ effect: 'relationship', target: target({ otherId: null }) }), rollLow);
    expect(r.blockedReason).toBe('no_target');
  });
});

describe('SkillActions — attack starts combat', () => {
  it('unaware target → ambush combat (no pre-check)', () => {
    const r = resolveSkillAction(input({ effect: 'attack', skillId: 'combate_corpo_a_corpo', target: target({ aware: false }) }), rollHigh);
    expect(r.allowed).toBe(true);
    expect(r.rolled).toBe(false);
    expect(r.surprise).toBe(true);
    expect(r.mutations).toEqual([{ kind: 'begin_combat', targetId: 'npc1', ambush: true }]);
  });
  it('aware target → open combat (no ambush)', () => {
    const r = resolveSkillAction(input({ effect: 'attack', target: target({ aware: true }) }), rollHigh);
    expect(r.mutations).toEqual([{ kind: 'begin_combat', targetId: 'npc1', ambush: false }]);
  });
});

describe('SkillActions — resisted vs surprise', () => {
  it('hack on an unaware target = surprise (vs fixed difficulty, no resistance)', () => {
    const r = resolveSkillAction(input({ effect: 'info', target: target({ aware: false }) }), rollMid);
    expect(r.surprise).toBe(true);
    expect(r.success).toBe(true); // 60 vs 50 @ roll 50
    expect(r.mutations).toEqual([{ kind: 'add_pda', subjectId: 'npc1' }]);
  });

  it('hack on an aware NON-hacker = still surprise (cannot resist without a deck)', () => {
    const r = resolveSkillAction(input({ effect: 'info', target: target({ aware: true, hasDeck: false }) }), rollMid);
    expect(r.surprise).toBe(true);
  });

  it('hack on an aware hacker-with-deck = resisted (vs their infotech)', () => {
    const r = resolveSkillAction(input({ effect: 'info', target: target({ aware: true, hasDeck: true, infotech: 90 }) }), rollMid);
    expect(r.surprise).toBe(false);
    expect(r.success).toBe(false); // 60 vs 90 @ roll 50 → likely fail
    expect(r.mutations).toEqual([]);
  });

  it('theft on an aware target = resisted vs Perception', () => {
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'furtividade', hasCyberdeck: false, target: target({ aware: true, perception: 90 }) }), rollMid);
    expect(r.surprise).toBe(false);
  });

  it('theft on an unaware target = surprise', () => {
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'furtividade', hasCyberdeck: false, target: target({ aware: false }) }), rollLow);
    expect(r.surprise).toBe(true);
    expect(r.mutations).toEqual([{ kind: 'steal_item', targetId: 'npc1' }]);
  });

  it('confront effects (disposition) are always resisted vs Charisma', () => {
    const r = resolveSkillAction(input({ effect: 'disposition', skillId: 'persuasao', hasCyberdeck: false, target: target({ aware: false, charisma: 30 }) }), rollLow);
    expect(r.surprise).toBe(false);
  });

  it('defence falls back to the EFFECT when no skill id is given', () => {
    // steal w/o skillId → Perception; relationship → infotech; coerce → charisma.
    // (Aware target so the resisted branch + defenceValue fallback are exercised.)
    const steal = resolveSkillAction(input({ effect: 'steal', skillId: null, hasCyberdeck: false, target: target({ aware: true, perception: 99 }) }), rollMid);
    expect(steal.surprise).toBe(false);
    expect(steal.success).toBe(false); // 60 vs 99
    const rel = resolveSkillAction(input({ effect: 'relationship', skillId: null, hasCyberdeck: false, target: target({ aware: true, hasDeck: true, infotech: 99, otherId: 'npc2' }) }), rollMid);
    expect(rel.success).toBe(false); // 60 vs 99 (infotech fallback)
    const coerce = resolveSkillAction(input({ effect: 'coerce', skillId: null, hasCyberdeck: false, target: target({ charisma: 99 }) }), rollMid);
    expect(coerce.success).toBe(false); // 60 vs 99 (charisma fallback)
  });
});

describe('SkillActions — steal variants', () => {
  it('IT steal = wire-transfer credits', () => {
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'tecnologia_informacao' }), rollLow);
    expect(r.mutations).toEqual([{ kind: 'steal_credits', targetId: 'npc1' }]);
  });
  it('stealth steal = pickpocket item', () => {
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'furtividade', hasCyberdeck: false }), rollLow);
    expect(r.mutations).toEqual([{ kind: 'steal_item', targetId: 'npc1' }]);
  });
});

describe('SkillActions — direction + critical steps', () => {
  it('persuasion disposition defaults up; intimidation down', () => {
    const up = resolveSkillAction(input({ effect: 'disposition', skillId: 'persuasao', hasCyberdeck: false, target: target({ charisma: 10 }) }), rollMid);
    expect(up.mutations[0]).toMatchObject({ kind: 'shift_disposition', dir: 'up', steps: 1 });
    const down = resolveSkillAction(input({ effect: 'disposition', skillId: 'intimidacao', hasCyberdeck: false, target: target({ charisma: 10 }) }), rollMid);
    expect(down.mutations[0]).toMatchObject({ kind: 'shift_disposition', dir: 'down' });
  });

  it('classifier dir overrides the default', () => {
    const r = resolveSkillAction(input({ effect: 'relationship', dir: 'up', target: target({ otherId: 'npc2', infotech: 10 }) }), rollMid);
    expect(r.mutations[0]).toMatchObject({ kind: 'alter_relationship', otherId: 'npc2', dir: 'up' });
  });

  it('a critical success (roll < 5) doubles the step count', () => {
    const r = resolveSkillAction(input({ effect: 'disposition', skillId: 'persuasao', hasCyberdeck: false, target: target({ charisma: 10 }) }), rollLow);
    expect(r.critical).toBe(true);
    expect(r.mutations[0]).toMatchObject({ steps: 2 });
  });

  it('a non-critical success is a single step', () => {
    const r = resolveSkillAction(input({ effect: 'relationship', target: target({ otherId: 'npc2', infotech: 10 }) }), rollMid);
    expect(r.critical).toBe(false);
    expect(r.mutations[0]).toMatchObject({ steps: 1 });
  });

  it('a failed check produces no mutations', () => {
    const r = resolveSkillAction(input({ effect: 'info', skillValue: 10, target: target({ aware: false }) }), rollHigh);
    expect(r.success).toBe(false);
    expect(r.mutations).toEqual([]);
  });
});

describe('SkillActions — self / misc effects', () => {
  it('heal with a target heals that NPC; without a target heals self', () => {
    const withT = resolveSkillAction(input({ effect: 'heal', skillId: 'medicina', hasCyberdeck: false }), rollLow);
    expect(withT.mutations).toEqual([{ kind: 'heal', targetId: 'npc1' }]);
    const self = resolveSkillAction(input({ effect: 'heal', skillId: 'medicina', hasCyberdeck: false, target: null }), rollLow);
    expect(self.mutations).toEqual([{ kind: 'heal', targetId: null }]);
  });

  it('sabotage marks the target gear', () => {
    const r = resolveSkillAction(input({ effect: 'sabotage', skillId: 'engenharia', hasCyberdeck: false }), rollLow);
    expect(r.mutations).toEqual([{ kind: 'mark_sabotage', targetId: 'npc1' }]);
  });

  it('repair / craft / appraise emit their markers; traverse & none emit nothing', () => {
    expect(resolveSkillAction(input({ effect: 'repair', skillId: 'engenharia', hasCyberdeck: false, target: null }), rollLow).mutations).toEqual([{ kind: 'repair' }]);
    expect(resolveSkillAction(input({ effect: 'craft', skillId: 'engenharia', hasCyberdeck: false, hasScrap: true, target: null }), rollLow).mutations).toEqual([{ kind: 'craft' }]);
    expect(resolveSkillAction(input({ effect: 'appraise', skillId: 'comercio', hasCyberdeck: false, target: null }), rollLow).mutations).toEqual([{ kind: 'appraise' }]);
    expect(resolveSkillAction(input({ effect: 'traverse', skillId: 'atletismo', hasCyberdeck: false, target: null }), rollLow).mutations).toEqual([]);
    expect(resolveSkillAction(input({ effect: 'none', skillId: null, hasCyberdeck: false, target: null }), rollLow).mutations).toEqual([]);
  });

  it('haggle with a target emits a haggle marker; coerce yields with steps', () => {
    expect(resolveSkillAction(input({ effect: 'haggle', skillId: 'comercio', hasCyberdeck: false, target: target({ charisma: 10 }) }), rollMid).mutations)
      .toEqual([{ kind: 'haggle', targetId: 'npc1' }]);
    const coerce = resolveSkillAction(input({ effect: 'coerce', skillId: 'intimidacao', hasCyberdeck: false, target: target({ charisma: 10 }) }), rollMid);
    expect(coerce.mutations[0]).toMatchObject({ kind: 'coerce', targetId: 'npc1', steps: 1 });
  });
});
