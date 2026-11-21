import { describe, expect, it } from 'vitest';
import { dealSaving, dealVerdict, isGoodSale } from './deals';

describe('real deal check', () => {
  it('calls a sale below the 30-day low a real deal', () => {
    expect(dealVerdict({ salePrice: 15.99, best30: 17.99 })).toBe('real');
    expect(dealSaving({ salePrice: 15, best30: 20 })).toBeCloseTo(0.25);
  });
  it('flags a sale dearer than the 30-day low', () => {
    expect(dealVerdict({ salePrice: 2.49, best30: 1.99 })).toBe('not');
    expect(isGoodSale({ salePrice: 2.49, best30: 1.99 })).toBe(false);
    expect(dealSaving({ salePrice: 2.49, best30: 1.99 })).toBe(0);
  });
  it('says just "on sale" when it matches the low or the shop gives no 30-day price', () => {
    expect(dealVerdict({ salePrice: 1.99, best30: 1.99 })).toBe('sale');
    expect(dealVerdict({ salePrice: 1.59, best30: null })).toBe('sale');
    expect(isGoodSale({ salePrice: 1.59, best30: null })).toBe(true);
  });
  it('has no verdict when nothing is on sale', () => {
    expect(dealVerdict({ salePrice: null, best30: 3 })).toBeNull();
  });
});
