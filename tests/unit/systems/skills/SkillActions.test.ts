import {
  resolveSkillAction, SkillActionInput, SkillTargetInfo, SKILL_ACTION_RADIUS, SKILL_CONTACT_RADIUS,
  reachFor,
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

  it('blocks an out-of-range target (default: 30m for IT info)', () => {
    const r = resolveSkillAction(input({ target: target({ distance: SKILL_ACTION_RADIUS + 1 }) }), rollLow);
    expect(r.blockedReason).toBe('out_of_range');
  });

  it('pickpocket (stealth steal) requires physical contact (2m), not 30m', () => {
    // Just past 2m → blocked by the tighter contact radius.
    const beyond = resolveSkillAction(input({
      effect: 'steal', skillId: 'furtividade', hasCyberdeck: false,
      target: target({ distance: SKILL_CONTACT_RADIUS + 0.5 }),
    }), rollLow);
    expect(beyond.blockedReason).toBe('out_of_range');
    // Within 2m → allowed and a thief who beats a sleeping mark steals an item.
    const close = resolveSkillAction(input({
      effect: 'steal', skillId: 'furtividade', hasCyberdeck: false,
      target: target({ distance: 1.5 }),
    }), rollLow);
    expect(close.allowed).toBe(true);
    expect(close.mutations).toEqual([{ kind: 'steal_item', targetId: 'npc1' }]);
  });

  it('IT wire-transfer steal still reaches 30m (remote)', () => {
    const r = resolveSkillAction(input({
      effect: 'steal', skillId: 'tecnologia_informacao',
      target: target({ distance: 20 }),
    }), rollLow);
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([{ kind: 'steal_credits', targetId: 'npc1' }]);
  });

  it('sabotage via Engenharia requires physical contact (2m)', () => {
    const beyond = resolveSkillAction(input({
      effect: 'sabotage', skillId: 'engenharia', hasCyberdeck: false,
      target: target({ distance: 3 }),
    }), rollLow);
    expect(beyond.blockedReason).toBe('out_of_range');
    const close = resolveSkillAction(input({
      effect: 'sabotage', skillId: 'engenharia', hasCyberdeck: false,
      target: target({ distance: 1 }),
    }), rollLow);
    expect(close.allowed).toBe(true);
  });

  it('sabotage via IT (hack) is REMOTE — reaches 30m', () => {
    const r = resolveSkillAction(input({
      effect: 'sabotage', skillId: 'tecnologia_informacao', hasCyberdeck: true,
      target: target({ distance: 10 }),
    }), rollLow);
    expect(r.allowed).toBe(true);
    const tooFar = resolveSkillAction(input({
      effect: 'sabotage', skillId: 'tecnologia_informacao', hasCyberdeck: true,
      target: target({ distance: 40 }),
    }), rollLow);
    expect(tooFar.blockedReason).toBe('out_of_range');
  });

  it('medicine_treat on another NPC requires physical contact (2m); self-treat has no target check', () => {
    const farHeal = resolveSkillAction(input({
      effect: 'medicine_treat', skillId: 'medicina', hasCyberdeck: false,
      target: target({ distance: 5 }),
    }), rollLow);
    expect(farHeal.blockedReason).toBe('out_of_range');
    const closeHeal = resolveSkillAction(input({
      effect: 'medicine_treat', skillId: 'medicina', hasCyberdeck: false,
      target: target({ distance: 1.5 }),
    }), rollLow);
    expect(closeHeal.allowed).toBe(true);
    const self = resolveSkillAction(input({
      effect: 'medicine_treat', skillId: 'medicina', hasCyberdeck: false, target: null,
    }), rollLow);
    expect(self.allowed).toBe(true);
  });

  it('reachFor returns 2m for physical-contact effects and 30m otherwise', () => {
    expect(reachFor('steal', 'furtividade')).toBe(SKILL_CONTACT_RADIUS);
    expect(reachFor('steal', 'tecnologia_informacao')).toBe(SKILL_ACTION_RADIUS); // wire = remote
    expect(reachFor('sabotage', 'engenharia')).toBe(SKILL_CONTACT_RADIUS);
    expect(reachFor('sabotage', 'tecnologia_informacao')).toBe(SKILL_ACTION_RADIUS); // hack = remote
    expect(reachFor('medicine_treat', 'medicina')).toBe(SKILL_CONTACT_RADIUS);
    expect(reachFor('info', 'tecnologia_informacao')).toBe(SKILL_ACTION_RADIUS);
    expect(reachFor('disposition', 'persuasao')).toBe(SKILL_ACTION_RADIUS);
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
    expect(r.mutations).toEqual([{ kind: 'begin_combat', targetId: 'npc1', ambush: true, remote: false }]);
  });
  it('aware target → open combat (no ambush)', () => {
    const r = resolveSkillAction(input({ effect: 'attack', skillId: 'combate_corpo_a_corpo', target: target({ aware: true }) }), rollHigh);
    expect(r.mutations).toEqual([{ kind: 'begin_combat', targetId: 'npc1', ambush: false, remote: false }]);
  });
  it('IT attack (hack) is REMOTE — flags remote=true so the scene does not lunge the player', () => {
    const r = resolveSkillAction(input({ effect: 'attack', skillId: 'tecnologia_informacao', target: target({ aware: false }) }), rollHigh);
    expect(r.mutations).toEqual([{ kind: 'begin_combat', targetId: 'npc1', ambush: true, remote: true }]);
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
    // Pickpocket needs physical contact (2m), so use a close distance here.
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'furtividade', hasCyberdeck: false, target: target({ aware: false, distance: 1.5 }) }), rollLow);
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
    const r = resolveSkillAction(input({ effect: 'steal', skillId: 'furtividade', hasCyberdeck: false, target: target({ distance: 1.5 }) }), rollLow);
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
  it('medicine_treat with a target heals that NPC; without a target heals self (generic heal mutation)', () => {
    const withT = resolveSkillAction(input({ effect: 'medicine_treat', skillId: 'medicina', hasCyberdeck: false, target: target({ distance: 1.5 }) }), rollLow);
    expect(withT.mutations).toEqual([{ kind: 'heal', targetId: 'npc1' }]);
    const self = resolveSkillAction(input({ effect: 'medicine_treat', skillId: 'medicina', hasCyberdeck: false, target: null }), rollLow);
    expect(self.mutations).toEqual([{ kind: 'heal', targetId: null }]);
  });

  it('medicine_check is a self-read: rolls a check but yields no world mutation', () => {
    const r = resolveSkillAction(input({ effect: 'medicine_check', skillId: 'medicina', hasCyberdeck: false, target: null }), rollLow);
    expect(r.allowed).toBe(true);
    expect(r.rolled).toBe(true);
    expect(r.mutations).toEqual([]);
  });

  it('sabotage marks the target gear', () => {
    const r = resolveSkillAction(input({ effect: 'sabotage', skillId: 'engenharia', hasCyberdeck: false, target: target({ distance: 1.5 }) }), rollLow);
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
