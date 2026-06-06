import { Mutation, mutationKind, mutationsOfKind } from '@systems/actions/Mutations';

describe('Mutations helpers', () => {
  const sample: Mutation[] = [
    { kind: 'steal_item', from: 'npc_mback', to: 'player', itemId: 'knife' },
    { kind: 'transfer_credits', from: 'npc_zara', to: 'player', amount: 30 },
    { kind: 'shift_disposition', target: 'npc_mback', dir: 'down', steps: 1 },
    { kind: 'heal', target: 'player', amount: 20 },
    { kind: 'heal', target: 'npc_zara', amount: 10 },
    { kind: 'begin_combat', attacker: 'player', defender: 'npc_mback', ambush: true, remote: false },
    { kind: 'narrate' },
  ];

  describe('mutationKind', () => {
    it('returns the discriminator string', () => {
      expect(mutationKind({ kind: 'narrate' } as Mutation)).toBe('narrate');
      expect(mutationKind(sample[0]!)).toBe('steal_item');
    });
  });

  describe('mutationsOfKind', () => {
    it('extracts mutations matching a single kind (type-narrowed)', () => {
      const heals = mutationsOfKind(sample, 'heal');
      expect(heals).toHaveLength(2);
      // Type narrowing: each entry should have a .target string
      expect(heals[0]!.target).toBe('player');
      expect(heals[0]!.amount).toBe(20);
      expect(heals[1]!.target).toBe('npc_zara');
    });

    it('returns an empty list when no mutation matches', () => {
      expect(mutationsOfKind(sample, 'craft')).toEqual([]);
      expect(mutationsOfKind(sample, 'use_item')).toEqual([]);
    });

    it('preserves the original order', () => {
      const all = mutationsOfKind(sample, 'heal');
      expect(all.map((m) => m.target)).toEqual(['player', 'npc_zara']);
    });
  });

  describe('discriminated-union exhaustiveness (compile-time, sampled at runtime)', () => {
    // This isn't a behavioural test — it asserts every kind we promise in the
    // plan exists in the union. If any are missing/renamed, this file fails to
    // compile, catching regressions at the type level. The runtime check just
    // pings a representative payload per kind.
    const ALL_KINDS: Mutation['kind'][] = [
      'steal_item', 'transfer_credits', 'heal', 'damage', 'shift_disposition',
      'alter_relationship', 'mark_sabotage', 'clear_sabotage', 'begin_combat',
      'disarm', 'stage_pending_trade', 'execute_pending_trade',
      'apply_haggle_discount', 'clear_pending_trade', 'stage_pending_mission',
      'accept_pending_mission', 'decline_pending_mission',
      'claim_mission_completion', 'cancel_active_mission',
      'narrate_target_still_alive', 'add_pda', 'craft', 'repair',
      'seed_tamper', 'hostile_reaction', 'coerce', 'move_to', 'flee_from',
      'wait', 'talk_to', 'use_item', 'examine_self', 'narrate_time',
      'apply_skill_use', 'narrate',
    ];

    it('has every expected kind in the discriminator union', () => {
      // Each entry in ALL_KINDS must be assignable to Mutation['kind'].
      ALL_KINDS.forEach((k) => {
        expect(typeof k).toBe('string');
      });
    });

    it('count matches the plan (35 distinct kinds)', () => {
      expect(new Set(ALL_KINDS).size).toBe(35);
    });
  });
});
