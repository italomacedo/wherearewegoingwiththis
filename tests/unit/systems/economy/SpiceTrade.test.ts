import {
  SPICE_ID, SPICE_LOT, DEALER_CHANCE, ADDICT_CHANCE, RESALE_MULTIPLIER,
  rollSpiceTraits, canOfferSpice, spiceBuyPrice, spiceResaleUnit,
  spiceContractId, makeSpiceContract, completeSpiceReport,
} from '../../../../src/systems/economy/SpiceTrade';
import { itemValue } from '../../../../src/entities/items/ItemCatalog';

describe('SpiceTrade (pure)', () => {
  const V = itemValue(SPICE_ID); // 8

  describe('rollSpiceTraits', () => {
    it('is deterministic for the same seed', () => {
      expect(rollSpiceTraits(12345)).toEqual(rollSpiceTraits(12345));
      expect(rollSpiceTraits(999)).toEqual(rollSpiceTraits(999));
    });

    it('produces both dealers and addicts across a seed sample', () => {
      let dealers = 0, addicts = 0;
      const N = 2000;
      for (let i = 0; i < N; i++) {
        const t = rollSpiceTraits(i);
        if (t.dealer) dealers++;
        if (t.addict) addicts++;
      }
      // Rates land roughly near the configured chances (independent draws).
      expect(dealers / N).toBeGreaterThan(DEALER_CHANCE - 0.06);
      expect(dealers / N).toBeLessThan(DEALER_CHANCE + 0.06);
      expect(addicts / N).toBeGreaterThan(ADDICT_CHANCE - 0.06);
      expect(addicts / N).toBeLessThan(ADDICT_CHANCE + 0.06);
    });

    it('draws the two traits independently (not perfectly correlated)', () => {
      let bothTrue = 0, mixed = 0;
      for (let i = 0; i < 2000; i++) {
        const t = rollSpiceTraits(i);
        if (t.dealer && t.addict) bothTrue++;
        if (t.dealer !== t.addict) mixed++;
      }
      expect(bothTrue).toBeGreaterThan(0);
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

  describe('spiceBuyPrice', () => {
    it('applies the disposition discount (floored at 1)', () => {
      expect(spiceBuyPrice('wary')).toBe(V); // full price
      expect(spiceBuyPrice('neutral')).toBe(Math.round(V * 0.85));
      expect(spiceBuyPrice('friendly')).toBe(Math.round(V * 0.7));
    });
  });

  describe('spiceResaleUnit', () => {
    const base = RESALE_MULTIPLIER * V; // 80
    const rollCrit = () => 0.02;  // d100 = 2  → success + critical
    const rollWin = () => 0.30;   // d100 = 30 → success (high skill gap)
    const rollLose = () => 0.99;  // d100 = 99 → failure

    it('base resale is ~10× the item value before modifiers', () => {
      expect(base).toBe(80);
    });

    it('failure = no penalty (base + addict premium only)', () => {
      const r = spiceResaleUnit('wary', 90, 10, rollLose);
      expect(r.success).toBe(false);
      expect(r.critical).toBe(false);
      expect(r.unit).toBe(Math.round(base * 1)); // wary premium 0, no haggle bonus
    });

    it('success adds the haggle bonus + the addict disposition premium', () => {
      const r = spiceResaleUnit('neutral', 90, 10, rollWin);
      expect(r.success).toBe(true);
      expect(r.critical).toBe(false);
      expect(r.unit).toBe(Math.round(base * (1 + 0.15 + 0.15)));
    });

    it('critical success applies the larger bonus', () => {
      const r = spiceResaleUnit('neutral', 90, 10, rollCrit);
      expect(r.critical).toBe(true);
      expect(r.unit).toBe(Math.round(base * (1 + 0.3 + 0.15)));
    });

    it('a friendlier addict pays a bigger premium', () => {
      const wary = spiceResaleUnit('wary', 90, 10, rollWin).unit;
      const friendly = spiceResaleUnit('friendly', 90, 10, rollWin).unit;
      expect(friendly).toBeGreaterThan(wary);
    });

    it('uses the default RNG when none is injected', () => {
      const r = spiceResaleUnit('neutral', 50, 50);
      expect(r.unit).toBeGreaterThan(0);
      expect(Number.isFinite(r.unit)).toBe(true);
    });
  });

  describe('contract helpers', () => {
    it('builds a deterministic active contract id per dealer', () => {
      expect(spiceContractId('npc_zara')).toBe('spice_npc_zara');
      const c = makeSpiceContract('npc_zara', SPICE_LOT);
      expect(c).toEqual({ id: 'spice_npc_zara', dealerId: 'npc_zara', qty: SPICE_LOT, status: 'active' });
    });

    it('floors a fractional/negative qty to a sane integer', () => {
      expect(makeSpiceContract('d', 3.9).qty).toBe(3);
      expect(makeSpiceContract('d', -2).qty).toBe(0);
    });

    it('report completes the contract without mutating the original', () => {
      const c = makeSpiceContract('d', 5);
      const done = completeSpiceReport(c);
      expect(done.status).toBe('complete');
      expect(c.status).toBe('active'); // immutable
    });
  });
});
