/**
 * Commerce classifier parsing (Phase 16) — pure, mirrors `parseIntent`.
 *
 * Turns the 6-line structured output of `buildCommerceClassifierPrompt` into a
 * validated `CommerceParse`. Unknown / out-of-list ids degrade to none so a stray
 * model answer can never name a non-existent item or target.
 */

export interface CommerceParse {
  offer: 'trade' | 'mission' | 'none';
  itemId: string | null;       // trade item (∈ sellableIds)
  targetId: string | null;     // mission target (∈ rivalIds)
  rewardItemId: string | null; // mission reward item
  rewardCredits: number;       // mission reward credits (≥0)
  accept: boolean;             // player agreed in their message
}

const NONE: CommerceParse = {
  offer: 'none', itemId: null, targetId: null, rewardItemId: null, rewardCredits: 0, accept: false,
};

function field(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}=(.*)$`, 'im'));
  return (m?.[1] ?? '').trim();
}

/** Parse the classifier output, validating ids against the allowed lists. */
export function parseCommerceResponse(
  raw: string,
  opts: { sellableIds: readonly string[]; rivalIds: readonly string[] },
): CommerceParse {
  if (!raw) return { ...NONE };
  const offerRaw = field(raw, 'OFFER').toLowerCase();
  const offer: CommerceParse['offer'] = offerRaw === 'trade' || offerRaw === 'mission' ? offerRaw : 'none';

  const pick = (v: string, allowed: readonly string[]): string | null =>
    v && v !== 'none' && allowed.includes(v) ? v : null;

  const itemId = pick(field(raw, 'ITEM'), opts.sellableIds);
  const targetId = pick(field(raw, 'TARGET'), opts.rivalIds);
  // Reward item can be any id the NPC names (validated later against its inventory).
  const rewardRaw = field(raw, 'REWARD_ITEM');
  const rewardItemId = rewardRaw && rewardRaw !== 'none' ? rewardRaw : null;
  const rewardCredits = Math.max(0, Math.floor(Number(field(raw, 'REWARD_CREDITS')) || 0));
  const accept = field(raw, 'ACCEPT').toLowerCase() === 'yes';

  return { offer, itemId, targetId, rewardItemId, rewardCredits, accept };
}
