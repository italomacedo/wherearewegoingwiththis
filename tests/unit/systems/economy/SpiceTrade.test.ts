import {
  SPICE_ID, SPICE_LOT, DEALER_CHANCE, ADDICT_CHANCE, RESALE_MULTIPLIER,
  SPICE_BUY_FLOOR_FACTOR, SPICE_SELL_CEIL_FACTOR,
  rollSpiceTraits, canOfferSpice, spiceDealSide,
  spiceBuyPrice, spiceResaleBase, spiceBasePrice, spiceHaggleFactor, clampSpicePrice,
  spiceContractId, makeSpiceContract, completeSpiceReport,
} from '../../../../src/systems/economy/SpiceTrade';
import { itemValue } from '../../../../src/entities/items/ItemCatalog';

describe('SpiceTrade (pure)', () => {
  const V = itemValue(SPICE_ID); // 8

  describe('rollSpiceTraits', () => {
    it('is deterministic for the same seed', () => {
      expect(rollSpiceTraits(12345)).toEqual(rollSpiceTraits(12345));
    });

    it('produces both dealers and addicts across a seed sample, roughly at the configured rates', () => {
      let dealers = 0, addicts = 0;
      const N = 2000;
      for (let i = 0; i < N; i++) {
        const t = rollSpiceTraits(i);
        if (t.dealer) dealers++;
        if (t.addict) addicts++;
      }
      expect(dealers / N).toBeGreaterThan(DEALER_CHANCE - 0.06);
      expect(dealers / N).toBeLessThan(DEALER_CHANCE + 0.06);
      expect(addicts / N).toBeGreaterThan(ADDICT_CHANCE - 0.06);
      expect(addicts / N).toBeLessThan(ADDICT_CHANCE + 0.06);
    });

    it('draws the two traits independently', () => {
      let both = 0, mixed = 0;
      for (let i = 0; i < 2000; i++) {
        const t = rollSpiceTraits(i);
        if (t.dealer && t.addict) both++;
        if (t.dealer !== t.addict) mixed++;
      }
      expect(both).toBeGreaterThan(0);
      expect(mixed).toBeGreaterThan(0);
    });
  });

  describe('canOfferSpice', () => {
    it('only neutral/friendly dealers offer', () => {
      expect(canOfferSpice('friendly')).toBe(true);
      expect(canOfferSpice('neutral')).toBe(true);
      expect(canOfferSpice('wary')).toBe(false);
      expect(canOfferSpice('hostile')).toBe(false);
    });
  });

  describe('spiceDealSide', () => {
    it('sells to an addict when the player is holding spice', () => {
      expect(spiceDealSide(false, true, true)).toBe('sell');
      expect(spiceDealSide(true, true, true)).toBe('sell'); // both → sell when holding
    });
    it('buys from a dealer otherwise', () => {
      expect(spiceDealSide(true, false, false)).toBe('buy');
      expect(spiceDealSide(true, true, false)).toBe('buy'); // both, no spice → buy first
    });
    it('falls back to a sell for an addict-only NPC', () => {
      expect(spiceDealSide(false, true, false)).toBe('sell');
    });
    it('is null for an NPC with neither trait', () => {
      expect(spiceDealSide(false, false, true)).toBeNull();
    });
  });

  describe('base prices', () => {
    it('buy price applies the disposition discount (floored at 1)', () => {
      expect(spiceBuyPrice('wary')).toBe(V);
      expect(spiceBuyPrice('neutral')).toBe(Math.round(V * 0.85));
      expect(spiceBuyPrice('friendly')).toBe(Math.round(V * 0.7));
    });
    it('resale base is ~10× the value + an addict premium', () => {
      expect(spiceResaleBase('wary')).toBe(RESALE_MULTIPLIER * V);
      expect(spiceResaleBase('neutral')).toBe(Math.round(RESALE_MULTIPLIER * V * 1.15));
      expect(spiceResaleBase('friendly')).toBe(Math.round(RESALE_MULTIPLIER * V * 1.30));
    });
    it('spiceBasePrice routes by side', () => {
      expect(spiceBasePrice('buy', 'neutral')).toBe(spiceBuyPrice('neutral'));
      expect(spiceBasePrice('sell', 'neutral')).toBe(spiceResaleBase('neutral'));
    });
  });

  describe('spiceHaggleFactor', () => {
    it('buyer pushes the price down, seller pushes it up; failure = no change', () => {
      expect(spiceHaggleFactor('buy', true, false)).toBeCloseTo(0.85);
      expect(spiceHaggleFactor('buy', true, true)).toBeCloseTo(0.70);
      expect(spiceHaggleFactor('sell', true, false)).toBeCloseTo(1.15);
      expect(spiceHaggleFactor('sell', true, true)).toBeCloseTo(1.30);
      expect(spiceHaggleFactor('buy', false, false)).toBe(1);
      expect(spiceHaggleFactor('sell', false, false)).toBe(1);
    });
  });

  describe('clampSpicePrice', () => {
    it('clamps a buy to the floor (50% of base) and a sell to the ceiling (2× base)', () => {
      const base = 100;
      expect(clampSpicePrice('buy', 30, base)).toBe(base * SPICE_BUY_FLOOR_FACTOR); // 50
      expect(clampSpicePrice('buy', 80, base)).toBe(80);                            // within range
      expect(clampSpicePrice('sell', 500, base)).toBe(base * SPICE_SELL_CEIL_FACTOR); // 200
      expect(clampSpicePrice('sell', 150, base)).toBe(150);                          // within range
    });
    it('never goes below 1', () => {
      expect(clampSpicePrice('sell', 0, 1)).toBe(1);
    });
  });

  describe('contract helpers', () => {
    it('builds a deterministic active contract id per dealer', () => {
      expect(spiceContractId('npc_zara')).toBe('spice_npc_zara');
      expect(makeSpiceContract('npc_zara', SPICE_LOT)).toEqual({ id: 'spice_npc_zara', dealerId: 'npc_zara', qty: SPICE_LOT, status: 'active' });
    });
    it('floors a fractional/negative qty', () => {
      expect(makeSpiceContract('d', 3.9).qty).toBe(3);
      expect(makeSpiceContract('d', -2).qty).toBe(0);
    });
    it('report completes the contract without mutating the original', () => {
      const c = makeSpiceContract('d', 5);
      expect(completeSpiceReport(c).status).toBe('complete');
      expect(c.status).toBe('active');
    });
  });
});
