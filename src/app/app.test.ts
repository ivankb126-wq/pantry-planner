import { describe, expect, it } from 'vitest';
import { stepMinutes } from '../screens/Cooking';
import { RECIPE_BY_ID } from './catalog';
import { addToPantry, planProblem, recentDishes, scaledIngredients } from './planning';
import { parseHash } from './router';
import { emptyData, exportBackup, getData, importBackup, migrate, settingsKey, update } from './state';

describe('router', () => {
  it('reads screen, id and query from the address', () => {
    expect(parseHash('')).toMatchObject({ name: 'plan', param: undefined });
    const r = parseHash('#/recipe/chana-masala?meal=4');
    expect(r.name).toBe('recipe');
    expect(r.param).toBe('chana-masala');
    expect(r.query.get('meal')).toBe('4');
  });
});

describe('backup', () => {
  it('exports and restores everything', () => {
    update((d) => {
      d.settings.budget = 95;
      d.favourites = ['chana-masala'];
      d.notes['chana-masala'] = 'more ginger';
    });
    const file = exportBackup();
    update(() => emptyData());
    expect(getData().settings.budget).toBe(80);
    importBackup(file);
    expect(getData().settings.budget).toBe(95);
    expect(getData().favourites).toEqual(['chana-masala']);
    expect(getData().notes['chana-masala']).toBe('more ginger');
  });

  it('refuses files that are not backups', () => {
    expect(() => importBackup('hello')).toThrow('not a Pantry Planner backup');
    expect(() => importBackup(JSON.stringify({ app: 'other', data: {} }))).toThrow('not a Pantry Planner backup');
  });

  it('fills in settings added in newer versions', () => {
    const old = emptyData() as unknown as { settings: Record<string, unknown> };
    delete old.settings.cookOnceEatTwice;
    const d = migrate(old as never);
    expect(d.settings.cookOnceEatTwice).toBe(true);
  });
});

describe('plan state', () => {
  it('asks for a new plan when there is none, settings change, or the week is over', () => {
    const d = emptyData();
    expect(planProblem(d)).toBe('none');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb' }).format(new Date());
    d.plan = { startDate: today, seed: 1, meals: [], cooked: [], avoid: {}, settingsKey: settingsKey(d.settings), createdAt: '', pantryAtStart: [] };
    expect(planProblem(d)).toBeNull();
    d.settings.budget += 10;
    expect(planProblem(d)).toBe('settings');
    d.plan.startDate = '2020-01-01';
    expect(planProblem(d)).toBe('over');
  });

  it('remembers the last two weeks of dishes for the next plan', () => {
    const d = emptyData();
    d.history = [
      { recipeId: 'sarma', date: '2026-11-10' },
      { recipeId: 'grah-varivo', date: '2026-11-25' },
    ];
    d.plan = {
      startDate: '2026-11-21', seed: 1, cooked: [], avoid: {}, settingsKey: '', createdAt: '', pantryAtStart: [],
      meals: [
        { day: 0, slot: 'dinner', recipeId: 'chana-masala', source: 'cook' },
        { day: 1, slot: 'lunch', recipeId: 'chana-masala', source: 'leftover', from: 0 },
        { day: 6, slot: 'dinner', recipeId: 'lasagne', source: 'cook' },
      ],
    };
    // Sarma is older than two weeks; lasagne was planned for a day not reached yet.
    expect(recentDishes(d, '2026-11-26').sort()).toEqual(['chana-masala', 'grah-varivo']);
  });
});

describe('recipe helpers', () => {
  it('scales ingredients to the number of servings in kitchen amounts', () => {
    const r = RECIPE_BY_ID.get('chana-masala')!;
    const two = scaledIngredients(r, r.servings);
    const four = scaledIngredients(r, r.servings * 2);
    const i = two.findIndex((x) => x.id === 'chickpeas');
    expect(four[i].amount).toBeCloseTo(two[i].amount * 2);
    expect(two.every((x) => x.display.length > 0)).toBe(true);
  });

  it('finds timers in step text', () => {
    expect(stepMinutes('Simmer for 20 to 25 minutes.')).toBe(20);
    expect(stepMinutes('Bake 1 hour until golden')).toBe(60);
    expect(stepMinutes('Stir in the spinach')).toBeNull();
    expect(stepMinutes('Add 200 ml water and simmer 15 min')).toBe(15);
  });
});

describe('pantry', () => {
  it('adds to an existing item instead of making a second one', () => {
    let p = addToPantry([], [{ ingredient: 'rice', amount: 1000 }]);
    p = addToPantry(p, [{ ingredient: 'rice', amount: 500 }, { ingredient: 'eggs', amount: 10 }]);
    expect(p).toHaveLength(2);
    expect(p.find((x) => x.ingredient === 'rice')).toMatchObject({ amount: 1500, full: 1500, storage: 'shelves' });
    expect(p.find((x) => x.ingredient === 'eggs')?.storage).toBe('fridge');
  });
});
