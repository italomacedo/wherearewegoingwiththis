import { parseCommerceResponse } from '../../../../src/systems/economy/Commerce';

const opts = { sellableIds: ['knife', 'medkit'], rivalIds: ['zara', 'mback'] };

describe('parseCommerceResponse (pure)', () => {
  it('parses a trade offer + player acceptance', () => {
    const raw = [
      'OFFER=trade', 'ITEM=knife', 'TARGET=none', 'REWARD_ITEM=none', 'REWARD_CREDITS=0', 'ACCEPT=yes',
    ].join('\n');
    expect(parseCommerceResponse(raw, opts)).toEqual({
      offer: 'trade', itemId: 'knife', targetId: null, rewardItemId: null, rewardCredits: 0, accept: true,
    });
  });

  it('parses a mission offer with a credit reward', () => {
    const raw = [
      'OFFER=mission', 'ITEM=none', 'TARGET=zara', 'REWARD_ITEM=none', 'REWARD_CREDITS=25', 'ACCEPT=no',
    ].join('\n');
    expect(parseCommerceResponse(raw, opts)).toMatchObject({
      offer: 'mission', targetId: 'zara', rewardCredits: 25, accept: false,
    });
  });

  it('degrades unknown / out-of-list ids to none', () => {
    const raw = [
      'OFFER=trade', 'ITEM=rocket', 'TARGET=ghost', 'REWARD_ITEM=none', 'REWARD_CREDITS=-5', 'ACCEPT=maybe',
    ].join('\n');
    const p = parseCommerceResponse(raw, opts);
    expect(p.itemId).toBeNull();     // 'rocket' not sellable
    expect(p.targetId).toBeNull();   // 'ghost' not a rival
    expect(p.rewardCredits).toBe(0); // negative clamped
    expect(p.accept).toBe(false);    // not 'yes'
  });

  it('an unparseable / empty answer is a no-op (offer none)', () => {
    expect(parseCommerceResponse('', opts).offer).toBe('none');
    expect(parseCommerceResponse('garbage', opts).offer).toBe('none');
  });

  it('keeps a reward item id for later inventory validation', () => {
    const raw = ['OFFER=mission', 'TARGET=mback', 'REWARD_ITEM=knife', 'REWARD_CREDITS=0', 'ACCEPT=yes'].join('\n');
    expect(parseCommerceResponse(raw, opts).rewardItemId).toBe('knife');
  });
});
