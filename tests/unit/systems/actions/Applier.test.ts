import { applyMutation, applyMutations, ApplierContext } from '@systems/actions/Applier';
import { Mutation } from '@systems/actions/Mutations';

/**
 * A spy ApplierContext that records every method call. The Applier
 * dispatcher is pure — for each mutation kind we just verify it forwards
 * to the right context method with the right arguments. Real scene-side
 * implementations of these methods are exercised in 21F integration tests.
 */
function makeSpyCtx(): ApplierContext & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string) => (...args: unknown[]) => { calls.push({ method, args }); };
  return {
    calls,
    transferItem: record('transferItem'),
    transferCredits: record('transferCredits'),
    heal: record('heal'),
    damage: record('damage'),
    shiftDisposition: record('shiftDisposition'),
    alterRelationship: record('alterRelationship'),
    hostileReaction: record('hostileReaction'),
    beginCombat: record('beginCombat'),
    disarm: record('disarm'),
    markSabotage: record('markSabotage'),
    clearSabotage: record('clearSabotage'),
    addPdaEntry: record('addPdaEntry'),
    seedTamper: record('seedTamper'),
    stagePendingTrade: record('stagePendingTrade'),
    executePendingTrade: record('executePendingTrade'),
    applyHaggleDiscount: record('applyHaggleDiscount'),
    clearPendingTrade: record('clearPendingTrade'),
    stagePendingMission: record('stagePendingMission'),
    acceptPendingMission: record('acceptPendingMission'),
    declinePendingMission: record('declinePendingMission'),
    claimMissionCompletion: record('claimMissionCompletion'),
    cancelActiveMission: record('cancelActiveMission'),
    buySpice: record('buySpice'),
    sellSpice: record('sellSpice'),
    haggleSpice: record('haggleSpice'),
    reportSpice: record('reportSpice'),
    craft: record('craft'),
    repair: record('repair'),
    moveTo: record('moveTo'),
    fleeFrom: record('fleeFrom'),
    wait: record('wait'),
    talkTo: record('talkTo'),
    useItem: record('useItem'),
    examineSelf: record('examineSelf'),
    narrateTime: record('narrateTime'),
    narrateTargetAlive: record('narrateTargetAlive'),
    applySkillUse: record('applySkillUse'),
    narrate: record('narrate'),
  } as ApplierContext & { calls: { method: string; args: unknown[] }[] };
}

describe('applyMutation dispatcher (Fase 21)', () => {
  let ctx: ReturnType<typeof makeSpyCtx>;
  beforeEach(() => { ctx = makeSpyCtx(); });

  // ── Inventory / credits ──
  it('steal_item → transferItem(from,to,itemId,1)', () => {
    applyMutation(ctx, { kind: 'steal_item', from: 'npc_zara', to: 'player', itemId: 'knife' });
    expect(ctx.calls).toEqual([{ method: 'transferItem', args: ['npc_zara', 'player', 'knife', 1] }]);
  });
  it('steal_item with no itemId → transferItem(...null,1) — Applier picks most-valuable', () => {
    applyMutation(ctx, { kind: 'steal_item', from: 'npc_zara', to: 'player' });
    expect(ctx.calls[0]!.args).toEqual(['npc_zara', 'player', null, 1]);
  });
  it('transfer_credits → transferCredits(from,to,amount)', () => {
    applyMutation(ctx, { kind: 'transfer_credits', from: 'npc_zara', to: 'player', amount: 30 });
    expect(ctx.calls).toEqual([{ method: 'transferCredits', args: ['npc_zara', 'player', 30] }]);
  });

  // ── HP ──
  it('heal → heal(target, amount)', () => {
    applyMutation(ctx, { kind: 'heal', target: 'player', amount: 20 });
    expect(ctx.calls).toEqual([{ method: 'heal', args: ['player', 20] }]);
  });
  it('damage → damage(target, amount, source?)', () => {
    applyMutation(ctx, { kind: 'damage', target: 'npc_z', amount: 5, source: 'player' });
    expect(ctx.calls).toEqual([{ method: 'damage', args: ['npc_z', 5, 'player'] }]);
  });

  // ── Disposition / relationship ──
  it('shift_disposition → shiftDisposition(target,dir,steps)', () => {
    applyMutation(ctx, { kind: 'shift_disposition', target: 'npc_z', dir: 'down', steps: 1 });
    expect(ctx.calls[0]!.method).toBe('shiftDisposition');
    expect(ctx.calls[0]!.args).toEqual(['npc_z', 'down', 1]);
  });
  it('alter_relationship → alterRelationship(actor,otherId,dir,steps)', () => {
    applyMutation(ctx, { kind: 'alter_relationship', actor: 'npc_z', otherId: 'npc_m', dir: 'up', steps: 2 });
    expect(ctx.calls[0]!.args).toEqual(['npc_z', 'npc_m', 'up', 2]);
  });
  it('hostile_reaction → hostileReaction(target)', () => {
    applyMutation(ctx, { kind: 'hostile_reaction', target: 'npc_z' });
    expect(ctx.calls).toEqual([{ method: 'hostileReaction', args: ['npc_z'] }]);
  });

  // ── Combat ──
  it('begin_combat → beginCombat(attacker,defender,opts)', () => {
    applyMutation(ctx, {
      kind: 'begin_combat', attacker: 'player', defender: 'npc_m',
      ambush: true, remote: false, openingAttack: 'melee',
    });
    expect(ctx.calls).toEqual([{
      method: 'beginCombat',
      args: ['player', 'npc_m', { ambush: true, remote: false, openingAttack: 'melee' }],
    }]);
  });
  it('disarm → disarm(actor, target)', () => {
    applyMutation(ctx, { kind: 'disarm', actor: 'player', target: 'npc_m' });
    expect(ctx.calls).toEqual([{ method: 'disarm', args: ['player', 'npc_m'] }]);
  });

  // ── Sabotage ──
  it('mark_sabotage / clear_sabotage → corresponding ctx methods', () => {
    applyMutation(ctx, { kind: 'mark_sabotage', target: 'npc_z' });
    applyMutation(ctx, { kind: 'clear_sabotage', target: 'npc_z' });
    expect(ctx.calls.map((c) => c.method)).toEqual(['markSabotage', 'clearSabotage']);
  });

  // ── PDA ──
  it('add_pda → addPdaEntry(subject,source,from,lines)', () => {
    applyMutation(ctx, { kind: 'add_pda', subject: 'npc_m', source: 'asked', from: 'npc_z', lines: ['extra'] });
    expect(ctx.calls[0]!.args).toEqual(['npc_m', 'asked', 'npc_z', ['extra']]);
  });

  // ── Tamper ──
  it('seed_tamper → seedTamper(target,kind,value)', () => {
    applyMutation(ctx, { kind: 'seed_tamper', target: 'npc_z', tamperKind: 'theft', playerSkillValue: 50 });
    expect(ctx.calls).toEqual([{ method: 'seedTamper', args: ['npc_z', 'theft', 50] }]);
  });

  // ── Coerce ──
  it('coerce → shiftDisposition(target,down,steps) as the disposition side-effect', () => {
    applyMutation(ctx, { kind: 'coerce', actor: 'player', target: 'npc_m', steps: 1 });
    expect(ctx.calls[0]).toEqual({ method: 'shiftDisposition', args: ['npc_m', 'down', 1] });
  });

  // ── Commerce ──
  it('stage_pending_trade → stagePendingTrade(npc,itemId,price)', () => {
    applyMutation(ctx, { kind: 'stage_pending_trade', npc: 'npc_z', itemId: 'knife', price: 21 });
    expect(ctx.calls).toEqual([{ method: 'stagePendingTrade', args: ['npc_z', 'knife', 21] }]);
  });
  it('execute_pending_trade / apply_haggle_discount / clear_pending_trade', () => {
    applyMutation(ctx, { kind: 'execute_pending_trade', npc: 'npc_z' });
    applyMutation(ctx, { kind: 'apply_haggle_discount', npc: 'npc_z', factor: 0.85 });
    applyMutation(ctx, { kind: 'clear_pending_trade', npc: 'npc_z' });
    expect(ctx.calls.map((c) => c.method))
      .toEqual(['executePendingTrade', 'applyHaggleDiscount', 'clearPendingTrade']);
  });

  // ── Missions ──
  it('stage_pending_mission → stagePendingMission(giver,target,reward)', () => {
    applyMutation(ctx, {
      kind: 'stage_pending_mission', giver: 'npc_z', targetId: 'npc_m',
      reward: { kind: 'credits', credits: 30 },
    });
    expect(ctx.calls[0]!.args).toEqual(['npc_z', 'npc_m', { kind: 'credits', credits: 30 }]);
  });
  it('all mission lifecycle mutations route correctly', () => {
    applyMutation(ctx, { kind: 'accept_pending_mission', giver: 'npc_z' });
    applyMutation(ctx, { kind: 'decline_pending_mission', giver: 'npc_z' });
    applyMutation(ctx, { kind: 'claim_mission_completion', giver: 'npc_z', targetId: 'npc_m' });
    applyMutation(ctx, { kind: 'cancel_active_mission', giver: 'npc_z' });
    applyMutation(ctx, { kind: 'narrate_target_still_alive', targetId: 'npc_m' });
    expect(ctx.calls.map((c) => c.method)).toEqual([
      'acceptPendingMission', 'declinePendingMission', 'claimMissionCompletion',
      'cancelActiveMission', 'narrateTargetAlive',
    ]);
  });

  // ── Spice-trafficking ──
  it('buy_spice / sell_spice / haggle_spice / report_spice → corresponding ctx methods', () => {
    applyMutation(ctx, { kind: 'buy_spice', dealer: 'npc_d', qty: 5, unitPrice: 7 });
    applyMutation(ctx, { kind: 'sell_spice', buyer: 'npc_a', qty: 5, unitPrice: 104 });
    applyMutation(ctx, { kind: 'haggle_spice', buyer: 'npc_a', unitPrice: 120 });
    applyMutation(ctx, { kind: 'report_spice', dealer: 'npc_d' });
    expect(ctx.calls).toEqual([
      { method: 'buySpice', args: ['npc_d', 5, 7] },
      { method: 'sellSpice', args: ['npc_a', 5, 104] },
      { method: 'haggleSpice', args: ['npc_a', 120] },
      { method: 'reportSpice', args: ['npc_d'] },
    ]);
  });

  // ── Crafting ──
  it('craft / repair → corresponding ctx methods', () => {
    applyMutation(ctx, { kind: 'craft', actor: 'player', weaponId: 'knife', scrapCost: 2 });
    applyMutation(ctx, { kind: 'repair', actor: 'player', itemId: 'rifle' });
    expect(ctx.calls.map((c) => c.method)).toEqual(['craft', 'repair']);
    expect(ctx.calls[0]!.args).toEqual(['player', 'knife', 2]);
  });

  // ── Locomotion ──
  it('move_to / flee_from / wait / talk_to / use_item → corresponding ctx methods', () => {
    applyMutation(ctx, { kind: 'move_to', actor: 'npc_z', target: 'npc_m' });
    applyMutation(ctx, { kind: 'flee_from', actor: 'npc_z', threat: 'npc_m' });
    applyMutation(ctx, { kind: 'wait', actor: 'npc_z' });
    applyMutation(ctx, { kind: 'talk_to', actor: 'npc_z', target: 'npc_m' });
    applyMutation(ctx, { kind: 'use_item', actor: 'npc_z', itemId: 'medkit' });
    expect(ctx.calls.map((c) => c.method)).toEqual(['moveTo', 'fleeFrom', 'wait', 'talkTo', 'useItem']);
  });

  // ── Special narrations ──
  it('examine_self → examineSelf(actor,success)', () => {
    applyMutation(ctx, { kind: 'examine_self', actor: 'player', success: true });
    expect(ctx.calls).toEqual([{ method: 'examineSelf', args: ['player', true] }]);
  });
  it('narrate_time → narrateTime()', () => {
    applyMutation(ctx, { kind: 'narrate_time' });
    expect(ctx.calls).toEqual([{ method: 'narrateTime', args: [] }]);
  });

  // ── Learn-by-doing ──
  it('apply_skill_use → applySkillUse(actor,skillId)', () => {
    applyMutation(ctx, { kind: 'apply_skill_use', actor: 'player', skillId: 'persuasao' });
    expect(ctx.calls).toEqual([{ method: 'applySkillUse', args: ['player', 'persuasao'] }]);
  });

  // ── Pure narration (TTS gateway) ──
  it('narrate with a line routes through ctx.narrate (narrator voice)', () => {
    applyMutation(ctx, { kind: 'narrate', line: 'the city breathes neon.' });
    expect(ctx.calls).toEqual([{ method: 'narrate', args: ['the city breathes neon.', 'narrator'] }]);
  });
  it('narrate WITHOUT a line is a silent no-op (no TTS triggered)', () => {
    applyMutation(ctx, { kind: 'narrate' });
    expect(ctx.calls).toEqual([]);
  });
});

describe('applyMutations', () => {
  it('applies all mutations in order', () => {
    const ctx = makeSpyCtx();
    const muts: Mutation[] = [
      { kind: 'heal', target: 'player', amount: 5 },
      { kind: 'apply_skill_use', actor: 'player', skillId: 'medicina' },
      { kind: 'narrate', line: 'patched.' },
    ];
    applyMutations(ctx, muts);
    expect(ctx.calls.map((c) => c.method)).toEqual(['heal', 'applySkillUse', 'narrate']);
  });

  it('empty list → no calls', () => {
    const ctx = makeSpyCtx();
    applyMutations(ctx, []);
    expect(ctx.calls).toEqual([]);
  });
});
