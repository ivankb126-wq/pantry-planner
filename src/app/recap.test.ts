import { describe, expect, it } from 'vitest';
import { saleSaving } from '../lib/deals';
import { keepRecap, lastRecap, weekRecap } from './recap';
import { type AppData, emptyData } from './state';

function week(): AppData {
  const d = emptyData();
  d.settings.budget = 90;
  d.plan = {
    startDate: '2026-11-23',
    seed: 1,
    meals: [
      { day: 0, slot: 'dinner', recipeId: 'chana-masala', source: 'cook' },
      { day: 1, slot: 'lunch', recipeId: 'chana-masala', source: 'leftover', from: 0 },
      { day: 1, slot: 'dinner', recipeId: 'sarma', source: 'cook' },
      { day: 2, slot: 'dinner', recipeId: 'chili-con-carne', source: 'cook' },
    ],
    cooked: [0, 1, 2],
    avoid: {},
    settingsKey: '',
    createdAt: 'p1',
    pantryAtStart: [],
  };
  d.history = [
    { recipeId: 'sarma', date: '2026-10-01' }, // cooked before: not new
    { recipeId: 'sarma', date: '2026-11-24' },
    { recipeId: 'chana-masala', date: '2026-11-23' },
  ];
  d.ratings = [{ recipeId: 'chana-masala', up: true, at: '2026-11-24T19:00:00Z' }];
  d.purchases = [
    { date: '2026-11-22', ingredient: 'rice', cost: 2, saved: 0 }, // the week before
    { date: '2026-11-23', ingredient: 'chickpeas', cost: 1.49, saved: 0.3 },
    { date: '2026-11-23', ingredient: 'onion', cost: 0.99, saved: 0 },
  ];
  d.thrown = [{ date: '2026-11-26', ingredient: 'yogurt', amount: 300, value: 0.84 }];
  return d;
}

describe('weekly recap', () => {
  it('adds up the week: spent, saved, cooked, thrown away, favourite new dish', () => {
    const d = week();
    expect(weekRecap(d, d.plan!)).toEqual({
      startDate: '2026-11-23',
      endDate: '2026-11-29',
      budget: 90,
      spent: 2.48,
      saved: 0.3,
      bought: 2,
      cooked: 2,
      toCook: 3,
      thrownCount: 1,
      thrownValue: 0.84,
      thrownNames: ['Plain yogurt'],
      newDishes: ['chana-masala'],
      favourite: 'chana-masala',
    });
  });

  it('keeps the recap when a new plan replaces the week, and forgets very old purchases', () => {
    const d = week();
    d.purchases.push({ date: '2026-06-01', ingredient: 'rice', cost: 2, saved: 0 });
    keepRecap(d);
    expect(d.recaps).toHaveLength(1);
    expect(d.purchases.some((p) => p.date === '2026-06-01')).toBe(false);
    d.plan = { ...d.plan!, startDate: '2026-11-30', cooked: [] };
    expect(lastRecap(d)?.startDate).toBe('2026-11-23');
  });

  it('counts what a sale saved against the usual price, never for a fake sale', () => {
    expect(saleSaving({ salePrice: 7.99, best30: 8.99 }, 7.99)).toBe(1);
    expect(saleSaving({ salePrice: 1.09, best30: null, anchor: 1.45 }, 2.18)).toBe(0.72);
    expect(saleSaving({ salePrice: 2.5, best30: 2.2, anchor: 3 }, 2.5)).toBe(0);
    expect(saleSaving({ salePrice: null, best30: 2 }, 2)).toBe(0);
  });
});
