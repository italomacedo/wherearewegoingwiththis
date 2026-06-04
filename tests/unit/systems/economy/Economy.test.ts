import {
  discountFor, canTrade, canOfferMission, priceFor, sellableItems,
  creditBalance, payCredits, grantCredits, CURRENCY_ID,
} from '../../../../src/systems/economy/Economy';
import { Inventory } from '../../../../src/entities/Inventory';
import { itemValue } from '../../../../src/entities/items/ItemCatalog';

describe('Economy (pure)', () => {
  describe('discountFor / canTrade / canOfferMission', () => {
    it('the two highest tiers discount; wary full price; hostile no trade', () => {
      expect(discountFor('friendly')).toBe(0.30);
      expect(discountFor('neutral')).toBe(0.15);
      expect(discountFor('wary')).toBe(0);
      expect(discountFor('hostile')).toBe(0);
    });

    it('trade/mission allowed unless hostile', () => {
      expect(canTrade('wary')).toBe(true);
      expect(canTrade('neutral')).toBe(true);
      expect(canTrade('friendly')).toBe(true);
      expect(canTrade('hostile')).toBe(false);
      expect(canOfferMission('wary')).toBe(true);
      expect(canOfferMission('hostile')).toBe(false);
    });
  });

  describe('priceFor', () => {
    it('applies the disposition discount to the fixed value', () => {
      expect(priceFor('knife', 'wary')).toBe(12);                 // full price
      expect(priceFor('knife', 'neutral')).toBe(Math.round(12 * 0.85)); // 10
      expect(priceFor('knife', 'friendly')).toBe(Math.round(12 * 0.70)); // 8
    });
    it('is 0 for a value-less item', () => {
      expect(priceFor('credstick', 'friendly')).toBe(0);
    });
  });

  describe('sellableItems', () => {
    it('lists value-bearing items but never the currency', () => {
      const inv = new Inventory();
      inv.add('knife', 1);
      inv.add('credstick', 5);
      inv.add('scrap', 3);
      expect(sellableItems(inv).sort()).toEqual(['knife', 'scrap']);
      expect(sellableItems(inv)).not.toContain(CURRENCY_ID);
    });
  });

  describe('credit balance helpers', () => {
    it('creditBalance reads the credstick count', () => {
      const inv = new Inventory();
      inv.add('credstick', 7);
      expect(creditBalance(inv)).toBe(7);
    });

    it('payCredits removes credits only when affordable', () => {
      const inv = new Inventory();
      inv.add('credstick', 10);
      expect(payCredits(inv, 4)).toBe(true);
      expect(creditBalance(inv)).toBe(6);
      expect(payCredits(inv, 99)).toBe(false); // can't afford
      expect(creditBalance(inv)).toBe(6);      // unchanged
      expect(payCredits(inv, 0)).toBe(true);   // no-op
    });

    it('grantCredits adds credsticks (capacity-aware)', () => {
      const inv = new Inventory();
      expect(grantCredits(inv, 8)).toBe(8);
      expect(creditBalance(inv)).toBe(8);
      expect(grantCredits(inv, 0)).toBe(0);
    });
  });

  it('uses the same fixed valuation as the catalog', () => {
    expect(priceFor('axe', 'wary')).toBe(itemValue('axe'));
  });
});
