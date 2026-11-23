import { describe, expect, it } from 'vitest';
import { setCooked } from './actions';
import { MAIN_MIN_KCAL } from '../planner/evaluate';
import { RECIPE_BY_ID } from './catalog';
import { cookNeeds, isLow, lowStaples, mealPortions, needsCheck, takeFromPantry, takenText } from './pantry';
import { pantryEntry } from './planning';
import { type AppData, type PantryEntry, emptyData, getData, settingsKey, update } from './state';

const entry = (ingredient: string, amount: number, expiresOn?: string): PantryEntry => ({ ...pantryEntry(ingredient, amount, '2026-11-20'), expiresOn });

describe('taking food out', () => {
  it('takes the soonest use-by first and drops items that reach zero', () => {
    const pantry = [entry('chicken-breast', 300, '2026-11-25'), entry('chicken-breast', 200, '2026-11-21'), entry('rice', 1000)];
    const res = takeFromPantry(pantry, [
      { ingredient: 'chicken-breast', amount: 250 },
      { ingredient: 'rice', amount: 150 },
      { ingredient: 'quinoa', amount: 100 },
    ]);
    expect(res.taken).toEqual([
      { ingredient: 'chicken-breast', amount: 250 },
      { ingredient: 'rice', amount: 150 },
    ]);
    const chicken = res.pantry.filter((p) => p.ingredient === 'chicken-breast');
    expect(chicken).toHaveLength(1);
    expect(chicken[0]).toMatchObject({ amount: 250, expiresOn: '2026-11-25' });
    expect(res.pantry.find((p) => p.ingredient === 'rice')?.amount).toBe(850);
    expect(pantry[0].amount).toBe(300); // input not changed
  });

  it('only takes what is there and reports items that ran out', () => {
    const res = takeFromPantry([entry('olive-oil', 30)], [{ ingredient: 'olive-oil', amount: 45 }]);
    expect(res.taken).toEqual([{ ingredient: 'olive-oil', amount: 30 }]);
    expect(res.pantry).toHaveLength(0);
    expect(res.emptied).toEqual(['olive-oil']);
  });

  it('describes what was taken in plain words', () => {
    expect(takenText([{ ingredient: 'chicken-breast', amount: 302 }, { ingredient: 'eggs', amount: 2 }])).toBe('300 g chicken breast and 2 eggs');
  });

  it('scales a recipe to the people cooked for', () => {
    const r = RECIPE_BY_ID.get('chana-masala')!;
    const one = cookNeeds(r, r.servings);
    const two = cookNeeds(r, r.servings * 2);
    expect(two[0].amount).toBeCloseTo(one[0].amount * 2);
    expect(one.length).toBe(r.ingredients.filter((i) => !i.optional).length);
  });
});

function planWith(d: AppData, recipeId: string, leftovers: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date());
  d.plan = {
    startDate: today,
    seed: 1,
    meals: [
      { day: 0, slot: 'dinner', recipeId, source: 'cook' },
      ...Array.from({ length: leftovers }, (_, i) => ({ day: i + 1, slot: 'lunch' as const, recipeId, source: 'leftover' as const, from: 0 })),
    ],
    cooked: [],
    avoid: {},
    settingsKey: settingsKey(d.settings),
    createdAt: '',
    pantryAtStart: [],
  };
}

describe('Mark cooked', () => {
  it('counts leftover meals in the portions cooked', () => {
    const d = emptyData();
    planWith(d, 'chana-masala', 1);
    // 2 adults, cooked twice, and a light dish gets bigger plates.
    const big = Math.max(1, Math.round((MAIN_MIN_KCAL / RECIPE_BY_ID.get('chana-masala')!.facts.perServing.kcal) * 20) / 20);
    expect(mealPortions(d.plan!, 0, d.settings)).toBeCloseTo(4 * big);
  });

  it('takes food out, and unmarking puts it back', () => {
    update(() => {
      const d = emptyData();
      d.pantry = [entry('chickpeas', 800), entry('onion', 4)];
      planWith(d, 'chana-masala', 0);
      return d;
    });
    const taken = setCooked(0, true);
    expect(taken.map((t) => t.ingredient).sort()).toEqual(['chickpeas', 'onion']);
    const chickpeas = getData().pantry.find((p) => p.ingredient === 'chickpeas')!.amount;
    expect(chickpeas).toBeLessThan(800);
    expect(getData().history).toHaveLength(1);
    expect(setCooked(0, true)).toEqual([]); // already taken
    setCooked(0, false);
    expect(getData().pantry.find((p) => p.ingredient === 'chickpeas')!.amount).toBeCloseTo(800);
    expect(getData().history).toHaveLength(0);
  });
});

describe('running low and checks', () => {
  it('flags staples that are nearly gone or ran out', () => {
    const d = emptyData();
    d.pantry = [entry('olive-oil', 1000), entry('salt', 1000)];
    d.pantry[0].amount = 80; // of 1 l
    d.ranOut = ['flour'];
    expect(isLow(d.pantry[0])).toBe(true);
    expect(isLow(d.pantry[1])).toBe(false);
    expect(lowStaples(d, '2026-11-20').sort()).toEqual(['flour', 'olive-oil']);
    d.lowDismissed = { flour: '2026-11-18' };
    d.extras = ['olive-oil'];
    expect(lowStaples(d, '2026-11-20')).toEqual([]);
    expect(lowStaples(d, '2026-11-26')).toEqual(['flour']);
  });

  it('asks for a pantry check once a week', () => {
    const d = emptyData();
    d.pantry = [entry('rice', 1000), entry('pasta', 500), entry('eggs', 10)];
    expect(needsCheck(d, '2026-11-20')).toBe(true);
    d.pantryCheckedOn = '2026-11-15';
    expect(needsCheck(d, '2026-11-20')).toBe(false);
    expect(needsCheck(d, '2026-11-22')).toBe(true);
  });
});
