import { describe, expect, it } from 'vitest';
import { ESTIMATE } from '../planner/evaluate';
import { lineQuantity, type ShopLine, shoppingText } from './Shopping';

const line = (over: Partial<ShopLine>): ShopLine => ({
  ingredient: 'apple',
  store: 'Lidl Zagreb',
  product: 'Jabuka zelena',
  brand: null,
  size: 1000,
  loose: true,
  packs: 1,
  amount: 600,
  cost: 1.01,
  onSale: false,
  deal: null,
  saving: 0,
  estimated: false,
  ...over,
});

describe('shared shopping list text', () => {
  it('lists items by store and aisle with quantities and products', () => {
    const text = shoppingText(
      [
        line({}),
        line({ ingredient: 'ham', product: 'Pivska šunka', brand: 'Pikok', loose: false, size: 100, packs: 3, amount: 300, cost: 1.77 }),
        line({ ingredient: 'tahini', store: ESTIMATE, product: 'Tahini', loose: false, size: 250, amount: 250, cost: 3.2, estimated: true }),
      ],
      ['Lidl Zagreb', ESTIMATE],
      '2026-11-23',
    );
    expect(text.split('\n')[0]).toBe('Shopping list, week of 23 Nov');
    expect(text).toContain('LIDL ZAGREB (about');
    expect(text).toContain('Fruit and veg:');
    expect(text).toMatch(/- Apples?, about 600 g \(Jabuka zelena\)/);
    expect(text).toMatch(/3 × 100 g \(Pivska šunka · Pikok\)/);
    expect(text).toContain('ANY STORE (TYPICAL PRICE)');
    expect(text).toMatch(/- Tahini[^,]*, 1 × 250 g$/m);
    expect(text).toMatch(/3 items, about 5,98/);
  });
});

describe('lineQuantity', () => {
  it('shows a pack of flatbread by weight, not as 1,8 pieces', () => {
    expect(lineQuantity(line({ ingredient: 'flatbread', loose: false, size: 160 / 90, packs: 1 }))).toBe('1 × 160 g');
    expect(lineQuantity(line({ ingredient: 'eggs', loose: false, size: 10, packs: 1 }))).toBe('1 × 10 pcs');
  });
});
