import { Vector3 } from '@babylonjs/core';
import {
  resolveAction, applyHaggleFactor, pickMissionTargetId,
  HAGGLE_FLOOR_FACTOR, HAGGLE_SUCCESS_FACTOR, HAGGLE_CRIT_FACTOR,
  DEFAULT_MISSION_REWARD,
} from '@systems/actions/Resolver';
import { PlayerActor, NpcActor } from '@systems/actions/Actor';
import { Inventory } from '@entities/Inventory';
import { Health } from '@entities/Health';
import { createDefaultStats } from '@entities/CharacterStats';
import { NPCAgent, NPCDefinition } from '@entities/NPCAgent';

function makePlayer(opts?: { stats?: ReturnType<typeof createDefaultStats>; inv?: Inventory; hp?: number; pos?: { x: number; z: number } }) {
  const stats = opts?.stats ?? createDefaultStats();
  const inv = opts?.inv ?? new Inventory();
  const hp = opts?.hp ?? 100;
  const pos = opts?.pos ?? { x: 0, z: 0 };
  const health = new Health(hp, 100);
  const ctrl = {
    getHealth: () => health,
    getPosition: () => new Vector3(pos.x, 0, pos.z),
  };
  return new PlayerActor({ controller: ctrl as never, inventory: inv, stats, displayName: 'V' });
}

const ZARA_DEF: NPCDefinition = {
  id: 'npc_zara',
  name: 'Zara',
  role: 'fixer',
  location: 'Stall 7',
  personalityPrompt: 'Wary.',
  defaultMood: 'neutral',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [1, 0, 0],
};

function makeNpc(id: string, pos: [number, number, number] = [1, 0, 0]): NpcActor {
  const agent = new NPCAgent({ ...ZARA_DEF, id, position: pos });
  return new NpcActor(agent, createDefaultStats());
}

// SkillCheck.rng returns [0, 1); multiplied by 100 gives the d100 face.
const rollLow = () => 0.30;  // 30 — succeeds against any P > 30%
const rollHigh = () => 0.95; // 95 — fails against any P < 95%
const rollCrit = () => 0.02; // 2 — guaranteed success + critical (< SKILL_CRITICAL_ROLL=5)

describe('Resolver — narrative + dispatch', () => {
  it('narrative verb is a pure no-op (decision #3)', () => {
    const r = resolveAction(makePlayer(), 'narrative');
    expect(r.allowed).toBe(true);
    expect(r.rolled).toBe(false);
    expect(r.mutations).toEqual([]);
  });

  it('unknown verb degrades to narrative no-op (defensive)', () => {
    const r = resolveAction(makePlayer(), 'not_a_verb' as never);
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([]);
  });
});

describe('Resolver — verbal: job_*', () => {
  const zara = makeNpc('npc_zara');

  it('job_request stages a pending mission against the first rival, default reward', () => {
    const r = resolveAction(makePlayer(), 'job_request', zara, {
      rivalIds: ['npc_mback', 'npc_other'],
      presentNpcIds: ['npc_mback'],
      giverCreditBalance: 50,
    });
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([{
      kind: 'stage_pending_mission',
      giver: 'npc_zara',
      targetId: 'npc_mback', // present, picked first
      reward: { kind: 'credits', credits: DEFAULT_MISSION_REWARD },
    }]);
  });

  it('job_request clamps reward to giver credit balance', () => {
    const r = resolveAction(makePlayer(), 'job_request', zara, {
      rivalIds: ['npc_mback'],
      presentNpcIds: ['npc_mback'],
      giverCreditBalance: 12,
    });
    expect(r.mutations[0]).toMatchObject({ reward: { credits: 12 } });
  });

  it('job_request blocks when giver has no rivals', () => {
    const r = resolveAction(makePlayer(), 'job_request', zara, { rivalIds: [], giverCreditBalance: 50 });
    expect(r.blockedReason).toBe('no_rivals');
  });

  it('job_request blocks when giver cannot pay', () => {
    const r = resolveAction(makePlayer(), 'job_request', zara, {
      rivalIds: ['npc_mback'], giverCreditBalance: 0,
    });
    expect(r.blockedReason).toBe('no_credits_to_pay');
  });

  it('job_accept emits accept mutation when a pending exists', () => {
    const r = resolveAction(makePlayer(), 'job_accept', zara, {
      pendingMission: { targetId: 'npc_mback', reward: { kind: 'credits', credits: 30 } },
    });
    expect(r.mutations).toEqual([{ kind: 'accept_pending_mission', giver: 'npc_zara' }]);
  });

  it('job_accept blocks when no pending offer', () => {
    expect(resolveAction(makePlayer(), 'job_accept', zara, {}).blockedReason).toBe('no_pending_mission');
  });

  it('job_decline emits decline mutation when a pending exists', () => {
    const r = resolveAction(makePlayer(), 'job_decline', zara, {
      pendingMission: { targetId: 'npc_mback', reward: { kind: 'credits', credits: 30 } },
    });
    expect(r.mutations).toEqual([{ kind: 'decline_pending_mission', giver: 'npc_zara' }]);
  });

  it('job_cancel cancels an active mission and worsens disposition (decision #14)', () => {
    const r = resolveAction(makePlayer(), 'job_cancel', zara, {
      activeMissions: [{ giverId: 'npc_zara', targetId: 'npc_mback' }],
    });
    expect(r.mutations).toEqual([
      { kind: 'cancel_active_mission', giver: 'npc_zara' },
      { kind: 'shift_disposition', target: 'npc_zara', dir: 'down', steps: 1 },
    ]);
  });

  it('job_cancel blocks when no active mission with this giver', () => {
    expect(resolveAction(makePlayer(), 'job_cancel', zara, { activeMissions: [] }).blockedReason)
      .toBe('no_active_mission');
  });

  it('job_claim pays out when the target is defeated', () => {
    const r = resolveAction(makePlayer(), 'job_claim', zara, {
      activeMissions: [{ giverId: 'npc_zara', targetId: 'npc_mback' }],
      defeatedNpcIds: ['npc_mback'],
    });
    expect(r.mutations).toEqual([
      { kind: 'claim_mission_completion', giver: 'npc_zara', targetId: 'npc_mback' },
    ]);
  });

  it('job_claim narrates "target still alive" when the kill is not done yet', () => {
    const r = resolveAction(makePlayer(), 'job_claim', zara, {
      activeMissions: [{ giverId: 'npc_zara', targetId: 'npc_mback' }],
      defeatedNpcIds: [],
    });
    expect(r.mutations).toEqual([{ kind: 'narrate_target_still_alive', targetId: 'npc_mback' }]);
  });
});

describe('Resolver — verbal: commerce_*', () => {
  const zara = makeNpc('npc_zara');

  it('commerce_discovery is a no-mutation acknowledge (NPC reply lists sellable)', () => {
    const r = resolveAction(makePlayer(), 'commerce_discovery', zara, {});
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([]);
  });

  it('commerce_pricing stages a pending_trade at the disposition-adjusted price', () => {
    const r = resolveAction(makePlayer(), 'commerce_pricing', zara, {
      itemId: 'knife',
      npcSellableIds: ['knife'],
      priceFor: () => 21,
    });
    expect(r.mutations).toEqual([{ kind: 'stage_pending_trade', npc: 'npc_zara', itemId: 'knife', price: 21 }]);
  });

  it('commerce_pricing rejects unknown items', () => {
    const r = resolveAction(makePlayer(), 'commerce_pricing', zara, {
      itemId: 'cyberdeck', npcSellableIds: ['knife'],
    });
    expect(r.blockedReason).toBe('unknown_item');
  });

  it('commerce_haggle success applies 0.85 factor (15% off)', () => {
    const stats = createDefaultStats();
    stats.skills.comercio = 80;
    const r = resolveAction(makePlayer({ stats }), 'commerce_haggle', zara, {
      pendingTrade: { itemId: 'knife', price: 21 },
    }, rollLow);
    expect(r.success).toBe(true);
    expect(r.mutations).toContainEqual({ kind: 'apply_haggle_discount', npc: 'npc_zara', factor: HAGGLE_SUCCESS_FACTOR });
  });

  it('commerce_haggle critical applies 0.7 factor (30% off)', () => {
    const stats = createDefaultStats();
    stats.skills.comercio = 80;
    const r = resolveAction(makePlayer({ stats }), 'commerce_haggle', zara, {
      pendingTrade: { itemId: 'knife', price: 21 },
    }, rollCrit);
    expect(r.critical).toBe(true);
    expect(r.mutations).toContainEqual({ kind: 'apply_haggle_discount', npc: 'npc_zara', factor: HAGGLE_CRIT_FACTOR });
  });

  it('commerce_haggle failure emits NO discount (just XP)', () => {
    const stats = createDefaultStats();
    stats.skills.comercio = 5;
    const r = resolveAction(makePlayer({ stats }), 'commerce_haggle', zara, {
      pendingTrade: { itemId: 'knife', price: 21 },
    }, rollHigh);
    expect(r.success).toBe(false);
    expect(r.mutations.some((m) => m.kind === 'apply_haggle_discount')).toBe(false);
    // Learn-by-doing fires even on failure (decision #12).
    expect(r.mutations).toContainEqual({ kind: 'apply_skill_use', actor: 'player', skillId: 'comercio' });
  });

  it('commerce_haggle WITHOUT pendingTrade falls through to discovery (decision #10)', () => {
    const r = resolveAction(makePlayer(), 'commerce_haggle', zara, { pendingTrade: null });
    expect(r.allowed).toBe(true);
    expect(r.rolled).toBe(false);
    expect(r.mutations).toEqual([]); // discovery semantics — Applier lists sellable
  });

  it('commerce_buy executes the pending trade', () => {
    const r = resolveAction(makePlayer(), 'commerce_buy', zara, {
      pendingTrade: { itemId: 'knife', price: 18 },
    });
    expect(r.mutations).toEqual([{ kind: 'execute_pending_trade', npc: 'npc_zara' }]);
  });

  it('commerce_buy blocks when nothing is on the table', () => {
    expect(resolveAction(makePlayer(), 'commerce_buy', zara, {}).blockedReason)
      .toBe('no_pending_trade');
  });

  it('commerce_sell is a reserved no-op (deferred)', () => {
    const r = resolveAction(makePlayer(), 'commerce_sell', zara, {});
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([]);
  });
});

describe('Resolver — verbal: social (persuade, intimidate, manipulate, info)', () => {
  const zara = makeNpc('npc_zara');

  it('persuade success → disposition UP; failure → NO penalty (asymmetry)', () => {
    const strong = createDefaultStats();
    strong.skills.persuasao = 99;
    const win = resolveAction(makePlayer({ stats: strong }), 'persuade', zara, {}, rollLow);
    expect(win.success).toBe(true);
    expect(win.mutations).toContainEqual({ kind: 'shift_disposition', target: 'npc_zara', dir: 'up', steps: 1 });

    const weak = createDefaultStats();
    weak.skills.persuasao = 1;
    const lose = resolveAction(makePlayer({ stats: weak }), 'persuade', zara, {}, rollHigh);
    expect(lose.success).toBe(false);
    expect(lose.mutations.some((m) => m.kind === 'shift_disposition')).toBe(false);
    expect(lose.mutations).toContainEqual({ kind: 'apply_skill_use', actor: 'player', skillId: 'persuasao' });
  });

  it('intimidate success → disposition UP (compliance); failure → -1 + hostile_reaction (asymmetry)', () => {
    const strong = createDefaultStats();
    strong.skills.intimidacao = 99;
    const win = resolveAction(makePlayer({ stats: strong }), 'intimidate', zara, {}, rollLow);
    expect(win.success).toBe(true);
    expect(win.mutations).toContainEqual({ kind: 'shift_disposition', target: 'npc_zara', dir: 'up', steps: 1 });

    const weak = createDefaultStats();
    weak.skills.intimidacao = 1;
    const lose = resolveAction(makePlayer({ stats: weak }), 'intimidate', zara, {}, rollHigh);
    expect(lose.success).toBe(false);
    expect(lose.mutations).toContainEqual({ kind: 'shift_disposition', target: 'npc_zara', dir: 'down', steps: 1 });
    expect(lose.mutations).toContainEqual({ kind: 'hostile_reaction', target: 'npc_zara' });
  });

  it('manipulate alters the listener\'s ledger against a 3rd party', () => {
    const strong = createDefaultStats();
    strong.skills.persuasao = 99;
    const r = resolveAction(makePlayer({ stats: strong }), 'manipulate', zara, {
      otherTargetId: 'npc_mback',
      dir: 'down',
    }, rollLow);
    expect(r.success).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: 'alter_relationship', actor: 'npc_zara', otherId: 'npc_mback', dir: 'down', steps: 1,
    });
  });

  it('manipulate critical → 2 steps', () => {
    const strong = createDefaultStats();
    strong.skills.persuasao = 99;
    const r = resolveAction(makePlayer({ stats: strong }), 'manipulate', zara, {
      otherTargetId: 'npc_mback',
    }, rollCrit);
    expect(r.critical).toBe(true);
    const ledger = r.mutations.find((m) => m.kind === 'alter_relationship');
    expect(ledger).toMatchObject({ steps: 2 });
  });

  it('manipulate blocks when otherTargetId is missing', () => {
    expect(resolveAction(makePlayer(), 'manipulate', zara, {}).blockedReason).toBe('no_target');
  });

  it('info (verbal) → PDA entry with source=asked on success', () => {
    const strong = createDefaultStats();
    strong.skills.persuasao = 99;
    const r = resolveAction(makePlayer({ stats: strong }), 'info', zara, {
      otherTargetId: 'npc_mback',
    }, rollLow);
    expect(r.success).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: 'add_pda', subject: 'npc_mback', source: 'asked', from: 'npc_zara',
    });
  });
});

describe('Resolver — emote dispatch (delegates to SkillActions)', () => {
  const zara = makeNpc('npc_zara');

  it('attack emote → begin_combat (ambush=false when target is aware)', () => {
    const r = resolveAction(makePlayer(), 'attack', zara, {}, rollLow, 'emote');
    expect(r.allowed).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: 'begin_combat', attacker: 'player', defender: 'npc_zara', ambush: false, remote: false,
    });
  });

  it('heal self emote heals the actor', () => {
    const stats = createDefaultStats();
    stats.skills.medicina = 80;
    const r = resolveAction(makePlayer({ stats }), 'heal', null, { skillId: 'medicina' }, rollLow, 'emote');
    expect(r.success).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'heal')).toMatchObject({ target: 'player' });
  });

  it('examine_self always emits an examine_self mutation + skill use', () => {
    const r = resolveAction(makePlayer(), 'examine_self', null, {}, rollLow, 'emote');
    expect(r.allowed).toBe(true);
    expect(r.rolled).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'examine_self')).toBeDefined();
    expect(r.mutations).toContainEqual({ kind: 'apply_skill_use', actor: 'player', skillId: 'medicina' });
  });

  it('narrate_time emits a narrate_time mutation, no check rolled', () => {
    const r = resolveAction(makePlayer(), 'narrate_time', null, {}, rollLow, 'emote');
    expect(r.rolled).toBe(false);
    expect(r.mutations).toEqual([{ kind: 'narrate_time' }]);
  });
});

describe('Resolver — autonomy (NPC-only locomotion + use_item)', () => {
  const mback = makeNpc('npc_mback');
  const npcSpeaker = makeNpc('npc_speaker');

  it('wait emits a wait mutation', () => {
    const r = resolveAction(npcSpeaker, 'wait', null, {}, rollLow, 'autonomy');
    expect(r.mutations).toEqual([{ kind: 'wait', actor: 'npc_speaker' }]);
  });

  it('move_to with a target', () => {
    const r = resolveAction(npcSpeaker, 'move_to', mback, {}, rollLow, 'autonomy');
    expect(r.mutations).toEqual([{ kind: 'move_to', actor: 'npc_speaker', target: 'npc_mback', coord: undefined }]);
  });

  it('move_to with coord (no target)', () => {
    const r = resolveAction(npcSpeaker, 'move_to', null, { coord: { x: 5, z: 7 } }, rollLow, 'autonomy');
    expect(r.mutations).toEqual([{ kind: 'move_to', actor: 'npc_speaker', target: undefined, coord: { x: 5, z: 7 } }]);
  });

  it('move_to blocks when neither target nor coord provided', () => {
    expect(resolveAction(npcSpeaker, 'move_to', null, {}, rollLow, 'autonomy').blockedReason).toBe('no_target');
  });

  it('flee_from a threat', () => {
    const r = resolveAction(npcSpeaker, 'flee_from', mback, {}, rollLow, 'autonomy');
    expect(r.mutations).toEqual([{ kind: 'flee_from', actor: 'npc_speaker', threat: 'npc_mback' }]);
  });

  it('talk_to a live target', () => {
    const r = resolveAction(npcSpeaker, 'talk_to', mback, {}, rollLow, 'autonomy');
    expect(r.mutations).toEqual([{ kind: 'talk_to', actor: 'npc_speaker', target: 'npc_mback' }]);
  });

  it('talk_to blocks when target is defeated', () => {
    const corpse = makeNpc('npc_corpse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((corpse as unknown) as { agent: NPCAgent }).agent.markDefeated();
    expect(resolveAction(npcSpeaker, 'talk_to', corpse, {}, rollLow, 'autonomy').blockedReason).toBe('dead_target');
  });

  it('use_item blocks without itemId', () => {
    expect(resolveAction(npcSpeaker, 'use_item', null, {}, rollLow, 'autonomy').blockedReason).toBe('unknown_item');
  });

  it('use_item blocks when actor does not have the item', () => {
    expect(resolveAction(npcSpeaker, 'use_item', null, { useItemId: 'medkit' }, rollLow, 'autonomy').blockedReason).toBe('no_tool');
  });

  it('use_item succeeds when the actor has the item', () => {
    const inv = new Inventory();
    inv.add('medkit', 1);
    const stats = createDefaultStats();
    const health = new Health(50, 100);
    const ctrl = { getHealth: () => health, getPosition: () => new Vector3(0, 0, 0) };
    const userActor = new PlayerActor({ controller: ctrl as never, inventory: inv, stats, displayName: 'V' });
    const r = resolveAction(userActor, 'use_item', null, { useItemId: 'medkit' }, rollLow, 'autonomy');
    expect(r.allowed).toBe(true);
    expect(r.mutations).toEqual([{ kind: 'use_item', actor: 'player', itemId: 'medkit' }]);
  });
});

describe('Resolver — emote dispatch lifts (coverage of all SkillMutation kinds)', () => {
  const zara = makeNpc('npc_zara');

  it('steal (Furtividade) → lifts to actor-explicit steal_item', () => {
    const stats = createDefaultStats();
    stats.skills.furtividade = 99;
    const r = resolveAction(makePlayer({ stats }), 'steal', zara, { skillId: 'furtividade' }, rollLow, 'emote');
    expect(r.success).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'steal_item')).toEqual({
      kind: 'steal_item', from: 'npc_zara', to: 'player',
    });
  });

  it('steal (IT wire) → lifts to transfer_credits', () => {
    const inv = new Inventory();
    inv.add('cyberdeck', 1);
    const stats = createDefaultStats();
    stats.skills.tecnologia_informacao = 99;
    const r = resolveAction(makePlayer({ stats, inv }), 'steal', zara, {
      skillId: 'tecnologia_informacao',
    }, rollLow, 'emote');
    const transfer = r.mutations.find((m) => m.kind === 'transfer_credits');
    expect(transfer).toMatchObject({ from: 'npc_zara', to: 'player' });
  });

  it('info (emote) → lifts to add_pda with source=scanned', () => {
    const inv = new Inventory();
    inv.add('cyberdeck', 1);
    const stats = createDefaultStats();
    stats.skills.tecnologia_informacao = 99;
    const r = resolveAction(makePlayer({ stats, inv }), 'info', zara, {
      skillId: 'tecnologia_informacao',
    }, rollLow, 'emote');
    expect(r.success).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'add_pda')).toMatchObject({
      subject: 'npc_zara', source: 'scanned',
    });
  });

  it('sabotage (Engenharia melee) → mark_sabotage', () => {
    const stats = createDefaultStats();
    stats.skills.engenharia = 99;
    const closeNpc = makeNpc('npc_close', [0.5, 0, 0]);
    const r = resolveAction(makePlayer({ stats }), 'sabotage', closeNpc, { skillId: 'engenharia' }, rollLow, 'emote');
    expect(r.success).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'mark_sabotage')).toMatchObject({ target: 'npc_close' });
  });

  it('craft → lifts to craft mutation (Applier fills weaponId from ctx)', () => {
    const inv = new Inventory();
    inv.add('scrap', 5);
    const stats = createDefaultStats();
    stats.skills.engenharia = 99;
    const r = resolveAction(makePlayer({ stats, inv }), 'craft', null, { skillId: 'engenharia' }, rollLow, 'emote');
    expect(r.mutations.find((m) => m.kind === 'craft')).toEqual({
      kind: 'craft', actor: 'player', weaponId: '', scrapCost: 0,
    });
  });

  it('repair → lifts to repair mutation', () => {
    const stats = createDefaultStats();
    stats.skills.engenharia = 99;
    const r = resolveAction(makePlayer({ stats }), 'repair', null, { skillId: 'engenharia' }, rollLow, 'emote');
    expect(r.mutations.find((m) => m.kind === 'repair')).toEqual({ kind: 'repair', actor: 'player' });
  });

  it('coerce (Intimidação) → lifts to actor-explicit coerce', () => {
    const stats = createDefaultStats();
    stats.skills.intimidacao = 99;
    const close = makeNpc('npc_close', [0.5, 0, 0]);
    const r = resolveAction(makePlayer({ stats }), 'coerce', close, { skillId: 'intimidacao' }, rollLow, 'emote');
    const coerce = r.mutations.find((m) => m.kind === 'coerce');
    expect(coerce).toMatchObject({ actor: 'player', target: 'npc_close' });
  });

  it('emote dispatch reports blocked reason when SkillActions blocks (e.g. out of range)', () => {
    const stats = createDefaultStats();
    stats.skills.furtividade = 99;
    const farNpc = makeNpc('npc_far', [100, 0, 100]);
    const r = resolveAction(makePlayer({ stats }), 'steal', farNpc, { skillId: 'furtividade' }, rollLow, 'emote');
    expect(r.allowed).toBe(false);
    expect(r.blockedReason).toBe('out_of_range');
  });

  it('unknown verb on a channel returns narrative no-op', () => {
    expect(resolveAction(makePlayer(), 'move_to' as never, null, {}, rollLow, 'verbal').mutations).toEqual([]);
    expect(resolveAction(makePlayer(), 'job_request' as never, null, {}, rollLow, 'emote').mutations).toEqual([]);
  });

  it('every verbal target-required verb blocks no_target when no NPC is addressed', () => {
    const verbs = [
      'job_request', 'job_claim', 'job_accept', 'job_decline', 'job_cancel',
      'commerce_discovery', 'commerce_pricing', 'commerce_haggle', 'commerce_buy',
      'manipulate', 'persuade', 'intimidate', 'info',
    ] as const;
    verbs.forEach((v) => {
      const r = resolveAction(makePlayer(), v, null, {}, rollLow, 'verbal');
      expect(r.allowed).toBe(false);
      expect(r.blockedReason).toBe('no_target');
    });
  });

  it('job_claim blocks no_active_mission when player has no contract with this giver', () => {
    const zara = makeNpc('npc_zara');
    expect(resolveAction(makePlayer(), 'job_claim', zara, { activeMissions: [] }, rollLow, 'verbal').blockedReason)
      .toBe('no_active_mission');
  });

  it('commerce_pricing blocks unknown_item when no itemId is provided', () => {
    const zara = makeNpc('npc_zara');
    expect(resolveAction(makePlayer(), 'commerce_pricing', zara, {}, rollLow, 'verbal').blockedReason)
      .toBe('unknown_item');
  });

  it('info (verbal) blocks no_target when otherTargetId is missing', () => {
    const zara = makeNpc('npc_zara');
    expect(resolveAction(makePlayer(), 'info', zara, {}, rollLow, 'verbal').blockedReason).toBe('no_target');
  });

  it('job_request blocks dead_target when the addressed NPC is defeated', () => {
    const zara = makeNpc('npc_zara');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((zara as unknown) as { agent: NPCAgent }).agent.markDefeated();
    expect(resolveAction(makePlayer(), 'job_request', zara, {
      rivalIds: ['npc_mback'], giverCreditBalance: 50,
    }, rollLow, 'verbal').blockedReason).toBe('dead_target');
  });

  it('heal with explicit target NPC lifts to heal of THAT target (line 222 branch)', () => {
    const stats = createDefaultStats();
    stats.skills.medicina = 99;
    const close = makeNpc('npc_close', [0.5, 0, 0]);
    const r = resolveAction(makePlayer({ stats }), 'heal', close, { skillId: 'medicina' }, rollLow, 'emote');
    expect(r.success).toBe(true);
    expect(r.mutations.find((m) => m.kind === 'heal')).toMatchObject({ target: 'npc_close' });
  });

  it('blocked SkillAction surfaces blockedReason on the lifted result', () => {
    // craft requires hasScrap. Player has no scrap → blocked('no_tool').
    const stats = createDefaultStats();
    stats.skills.engenharia = 99;
    const r = resolveAction(makePlayer({ stats }), 'craft', null, {
      skillId: 'engenharia', hasScrap: false,
    }, rollLow, 'emote');
    expect(r.allowed).toBe(false);
    expect(r.blockedReason).toBe('no_tool');
  });
});

describe('applyHaggleFactor (haggle floor)', () => {
  it('applies the success factor (15% off rounded)', () => {
    expect(applyHaggleFactor(20, HAGGLE_SUCCESS_FACTOR, 30)).toBe(17);
  });

  it('applies the crit factor (30% off rounded)', () => {
    expect(applyHaggleFactor(21, HAGGLE_CRIT_FACTOR, 30)).toBe(15);
  });

  it('clamps to floor (50% of base neutral price)', () => {
    // Base 30 → floor = 15; aggressive chain crit would push below.
    expect(applyHaggleFactor(10, 0.5, 30)).toBe(15);
    // Floor of 1 cr minimum (rounded items priced < 2 don't go below 1).
    expect(applyHaggleFactor(1, 0.1, 1)).toBe(1);
  });

  it('floor factor is exactly 0.5', () => {
    expect(HAGGLE_FLOOR_FACTOR).toBe(0.5);
  });
});

describe('pickMissionTargetId', () => {
  it('prefers a rival physically present in the scene', () => {
    expect(pickMissionTargetId(['npc_mback', 'npc_other'], ['npc_other'])).toBe('npc_other');
  });

  it('falls back to the first rival when no rival is present', () => {
    expect(pickMissionTargetId(['npc_mback', 'npc_other'], [])).toBe('npc_mback');
  });

  it('falls back when presence list contains unrelated NPCs', () => {
    expect(pickMissionTargetId(['npc_mback'], ['npc_zara', 'npc_other'])).toBe('npc_mback');
  });
});
