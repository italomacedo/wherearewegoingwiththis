import {
  validateMissionOffer, completeMission, missionId, Mission, MissionGiver, RewardOffer,
} from '../../../../src/systems/economy/Missions';
import { Inventory } from '../../../../src/entities/Inventory';
import type { NPCDisposition } from '../../../../src/entities/NPCAgent';

/** Minimal MissionGiver stub backed by a real Inventory. */
function makeGiver(opts: {
  antagonists?: string[];
  items?: Array<{ id: string; qty: number }>;
}): MissionGiver & { disposition: NPCDisposition; inv: Inventory } {
  const inv = new Inventory();
  for (const s of opts.items ?? []) inv.add(s.id, s.qty);
  const antagonists = new Set(opts.antagonists ?? []);
  const giver = {
    disposition: 'neutral' as NPCDisposition,
    inv,
    isAntagonisticToward: (id: string) => antagonists.has(id),
    getInventory: () => inv,
    improveDisposition(): NPCDisposition { giver.disposition = 'friendly'; return giver.disposition; },
  };
  return giver;
}

describe('Missions (pure)', () => {
  const present = ['mback', 'zara', 'rook'];

  it('missionId is deterministic per giver→target pair', () => {
    expect(missionId('mback', 'zara')).toBe('mission_mback_zara');
  });

  describe('validateMissionOffer', () => {
    it('accepts a contract against a present antagonist with a held item reward', () => {
      const giver = makeGiver({ antagonists: ['zara'], items: [{ id: 'knife', qty: 1 }] });
      const m = validateMissionOffer(giver, 'mback', 'zara', { kind: 'item', itemId: 'knife' }, present);
      expect(m).toEqual({
        id: 'mission_mback_zara', giverId: 'mback', targetId: 'zara',
        rewardKind: 'item', rewardItemId: 'knife', status: 'active',
      });
    });

    it('clamps a credit reward to the giver balance', () => {
      const giver = makeGiver({ antagonists: ['zara'], items: [{ id: 'credstick', qty: 5 }] });
      const m = validateMissionOffer(giver, 'mback', 'zara', { kind: 'credits', credits: 999 }, present);
      expect(m?.rewardKind).toBe('credits');
      expect(m?.rewardCredits).toBe(5);
    });

    it('rejects: target absent, not antagonistic, self, ungrounded reward, no credits', () => {
      const giver = makeGiver({ antagonists: ['zara'], items: [] });
      // not present
      expect(validateMissionOffer(giver, 'mback', 'ghost', { kind: 'credits', credits: 1 }, present)).toBeNull();
      // present but not antagonistic
      expect(validateMissionOffer(giver, 'mback', 'rook', { kind: 'credits', credits: 1 }, present)).toBeNull();
      // self
      expect(validateMissionOffer(giver, 'mback', 'mback', { kind: 'item', itemId: 'knife' }, present)).toBeNull();
      // item not held
      expect(validateMissionOffer(giver, 'mback', 'zara', { kind: 'item', itemId: 'knife' }, present)).toBeNull();
      // credits but zero balance
      expect(validateMissionOffer(giver, 'mback', 'zara', { kind: 'credits', credits: 10 }, present)).toBeNull();
    });
  });

  describe('completeMission', () => {
    it('transfers an item reward to the player and improves the giver disposition', () => {
      const giver = makeGiver({ items: [{ id: 'knife', qty: 1 }] });
      const player = new Inventory();
      const mission: Mission = {
        id: 'm', giverId: 'mback', targetId: 'zara', rewardKind: 'item', rewardItemId: 'knife', status: 'active',
      };
      const { mission: done, granted } = completeMission(mission, player, giver);
      expect(granted).toBe(1);
      expect(player.has('knife')).toBe(true);
      expect(giver.getInventory().has('knife')).toBe(false);
      expect(done.status).toBe('complete');
      expect(giver.disposition).toBe('friendly');
    });

    it('transfers a credit reward', () => {
      const giver = makeGiver({ items: [{ id: 'credstick', qty: 20 }] });
      const player = new Inventory();
      const mission: Mission = {
        id: 'm', giverId: 'mback', targetId: 'zara', rewardKind: 'credits', rewardCredits: 8, status: 'active',
      };
      const { granted } = completeMission(mission, player, giver);
      expect(granted).toBe(8);
      expect(player.count('credstick')).toBe(8);
      expect(giver.getInventory().count('credstick')).toBe(12);
    });
  });
});
