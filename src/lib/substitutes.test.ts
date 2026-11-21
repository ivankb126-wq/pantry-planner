import { describe, expect, it } from 'vitest';
import content from '../generated/content.json';
import { cookNeeds } from '../app/pantry';
import { scaledIngredients } from '../app/planning';
import { RECIPE_BY_ID } from '../app/catalog';
import { SUBSTITUTES, applySubs, canLeaveOut } from './substitutes';

const ING = content.ingredients as Record<string, { unit: string; category: string }>;

describe('swaps for "I don\'t have X"', () => {
  it('only names ingredients the app knows, with sensible amounts', () => {
    for (const [from, swaps] of Object.entries(SUBSTITUTES)) {
      expect(ING[from], from).toBeTruthy();
      for (const s of swaps) {
        expect(ING[s.id], `${from} -> ${s.id}`).toBeTruthy();
        expect(s.id).not.toBe(from);
        // Same kind of unit: the amount should stay in the same ballpark.
        if (ING[from].unit === ING[s.id].unit) expect(s.ratio, `${from} -> ${s.id}`).toBeGreaterThan(0.09);
      }
    }
  });

  it('replaces, scales and leaves out ingredients', () => {
    const list = [
      { id: 'sour-cream', amount: 200 },
      { id: 'lemon', amount: 1 },
      { id: 'parsley', amount: 10 },
      { id: 'greek-yogurt', amount: 50 },
    ];
    expect(applySubs(list, { 'sour-cream': 'greek-yogurt', lemon: 'lemon-juice', parsley: '' })).toEqual([
      { id: 'greek-yogurt', amount: 250 },
      { id: 'lemon-juice', amount: 40 },
    ]);
    expect(applySubs(list, undefined)).toBe(list);
  });

  it('lets you skip garnishes and spices, but not salt or the main food', () => {
    expect(canLeaveOut('parsley', 'fruit-veg', false)).toBe(true);
    expect(canLeaveOut('cumin', 'spices', false)).toBe(true);
    expect(canLeaveOut('salt', 'spices', false)).toBe(false);
    expect(canLeaveOut('chicken-breast', 'meat', false)).toBe(false);
    expect(canLeaveOut('chicken-breast', 'meat', true)).toBe(true);
  });

  it('cooks and lists the recipe with the swap', () => {
    const r = RECIPE_BY_ID.get('chana-masala')!;
    const first = r.ingredients.find((i) => SUBSTITUTES[i.id])!;
    const to = SUBSTITUTES[first.id][0].id;
    const needs = cookNeeds(r, r.servings, { [first.id]: to });
    expect(needs.some((n) => n.ingredient === first.id)).toBe(false);
    expect(needs.some((n) => n.ingredient === to)).toBe(true);
    const row = scaledIngredients(r, r.servings, { [first.id]: to }).find((i) => i.insteadOf === first.id)!;
    expect(row.id).toBe(to);
  });
});
