import { describe, expect, it } from 'vitest';
import content from '../generated/content.json';
import type { IngredientInfo } from '../lib/nutrition';
import { buildContext, evaluate } from './evaluate';
import { generatePlan, scorePlan, swapMeal } from './planner';
import { cheapestPurchase } from './pricing';
import { DEFAULT_SETTINGS, type Meal, type Offer, type PlanInput, type PlannerRecipe } from './types';

const INGREDIENTS = content.ingredients as unknown as Record<string, IngredientInfo>;
const RECIPES = content.recipes as unknown as PlannerRecipe[];

// Made-up but realistic prices: EUR per kg / l / piece by aisle.
const UNIT_PRICE: Record<string, number> = {
  meat: 9, fish: 12, dairy: 6, eggs: 0.25, 'fruit-veg': 2, grains: 2, legumes: 3, canned: 4, sauces: 6, oils: 8,
  spices: 40, baking: 4, nuts: 15, frozen: 4, sweets: 8, drinks: 2, bakery: 3,
};

function fakeOffers(ingredients = INGREDIENTS, store = 'test:1'): Offer[] {
  return Object.values(ingredients).map((ing) => {
    const size = ing.packages.length ? ing.packages[0] : 500;
    let unitPrice = UNIT_PRICE[ing.category] ?? 4;
    if (ing.unit === 'piece') unitPrice = ing.id === 'eggs' ? 0.25 : 0.4;
    if (ing.id === 'salt' || ing.id === 'sugar' || ing.id === 'flour') unitPrice = 0.8;
    if (ing.category === 'oils') unitPrice = 3;
    const price = ing.unit === 'piece' ? unitPrice * size : (unitPrice * size) / 1000;
    return { ingredient: ing.id, name: `${ing.name} ${size}`, size, price: Math.max(0.29, Math.round(price * 100) / 100), salePrice: null, unitPrice, store };
  });
}

function baseInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    offers: fakeOffers(),
    adults: 2,
    children: 0,
    budget: 150,
    days: 7,
    startDate: '2026-11-23', // a Monday
    meals: ['breakfast', 'lunch', 'dinner'],
    diet: 'none',
    dislikes: [],
    pantry: [],
    ratings: [],
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    seed: 1,
    timeBudgetMs: 300,
    ...over,
  };
}

const offer = (size: number, price: number, extra: Partial<Offer> = {}): Offer => ({
  ingredient: 'rice', name: `Rice ${size}`, size, price, salePrice: null, unitPrice: (price / size) * 1000, store: 's:1', ...extra,
});

// ------------------------------------------------------------------ package cost and leftovers
describe('package cost and leftovers', () => {
  it('buys whole packages and picks the cheapest way', () => {
    const p = cheapestPurchase(700, [offer(500, 2), offer(1000, 3)], 'g');
    expect(p.cost).toBe(3);
    expect(p.bought).toBe(1000);
  });
  it('mixes two package sizes when that is cheaper', () => {
    const p = cheapestPurchase(1400, [offer(500, 2), offer(1000, 3)], 'g');
    expect(p.cost).toBe(5);
    expect(p.bought).toBe(1500);
    expect(p.lines.map((l) => [l.offer.size, l.count])).toEqual([[1000, 1], [500, 1]]);
  });
  it('rounds loose produce up to 100 g and charges by weight', () => {
    const p = cheapestPurchase(230, [offer(1000, 2, { loose: true, unitPrice: 2 })], 'g');
    expect(p.bought).toBe(300);
    expect(p.cost).toBe(0.6);
  });
  it('reports what is left at home and uses the pantry first', () => {
    const input = baseInput({ adults: 4, pantry: [{ ingredient: 'rice', amount: 100 }] });
    const ctx = buildContext(input);
    // Red lentil dal for 4 needs 250 g rice: 100 g from the pantry, 150 g bought as a 500 g bag.
    const res = evaluate(ctx, [{ day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' }]);
    expect(res.fromPantry.find((x) => x.ingredient === 'rice')?.amount).toBe(100);
    const rice = res.shopping.find((s) => s.ingredient === 'rice')!;
    expect(rice.amount).toBe(500);
    expect(res.leftovers.find((x) => x.ingredient === 'rice')?.amount).toBe(350);
  });
});

describe('typical prices', () => {
  it('fills gaps in the store list and marks them as estimated', () => {
    const offers = fakeOffers().filter((o) => o.ingredient !== 'red-lentils');
    const reference = fakeOffers().filter((o) => o.ingredient === 'red-lentils');
    const input = baseInput({ offers, referenceOffers: reference });
    const res = evaluate(buildContext(input), [{ day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' }]);
    const line = res.shopping.find((s) => s.ingredient === 'red-lentils')!;
    expect(line.estimated).toBe(true);
    expect(res.estimatedPrices).toEqual(['red-lentils']);
    expect(res.shopping.find((s) => s.ingredient === 'rice')!.estimated).toBe(false);
    expect(res.breakdown.estimated).toBeGreaterThan(0);
  });
  it('never uses a typical price when the store has the item', () => {
    const reference = fakeOffers().map((o) => ({ ...o, price: 0.01, unitPrice: 0.01 }));
    const res = evaluate(buildContext(baseInput({ referenceOffers: reference })), [
      { day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' },
    ]);
    expect(res.estimatedPrices).toEqual([]);
  });
});

// ------------------------------------------------------------------ budget
describe('budget', () => {
  it('penalises plans over budget and reports money left', () => {
    const meals: Meal[] = [{ day: 0, slot: 'dinner', recipeId: 'pasticada', source: 'cook' }];
    const over = evaluate(buildContext(baseInput({ budget: 5 })), meals);
    expect(over.breakdown.budget).toBeGreaterThan(0);
    expect(over.warnings[0]).toMatch(/over budget/);
    const under = evaluate(buildContext(baseInput({ budget: 500 })), meals);
    expect(under.breakdown.budget).toBe(0);
    expect(under.moneyLeft).toBeCloseTo(500 - under.cost, 2);
  });
  it('stays within a tighter budget by choosing cheaper meals', () => {
    const free = generatePlan(baseInput({ budget: 10_000, seed: 5, timeBudgetMs: 5000 }));
    // With these test prices the cheapest valid week is about 10% below the free plan.
    const budget = Math.round(free.cost * 0.93);
    const tight = generatePlan(baseInput({ budget, seed: 5, timeBudgetMs: 5000 }));
    expect(tight.cost).toBeLessThan(free.cost);
    expect(tight.cost).toBeLessThanOrEqual(budget);
    expect(tight.moneyLeft).toBeGreaterThanOrEqual(0);
    expect(tight.breakdown.budget).toBe(0);
  });
});

// ------------------------------------------------------------------ nutrition
describe('nutrition aggregation', () => {
  it('averages meals per person per day', () => {
    const input = baseInput({ days: 2, meals: ['lunch', 'dinner'] });
    const ids = ['chana-masala', 'pasticada', 'fis-paprikas', 'red-lentil-dal'];
    const meals: Meal[] = ids.map((id, i) => ({ day: Math.floor(i / 2), slot: i % 2 ? 'dinner' : 'lunch', recipeId: id, source: 'cook' }));
    const res = evaluate(buildContext(input), meals);
    const facts = ids.map((id) => RECIPES.find((r) => r.id === id)!.facts.perServing);
    const kcal = facts.reduce((s, f) => s + f.kcal, 0) / 2;
    const protein = facts.reduce((s, f) => s + f.protein, 0) / 2;
    expect(res.perPersonDay.kcal).toBeCloseTo(kcal, 0);
    expect(res.perPersonDay.protein).toBeCloseTo(protein, 0);
    expect(res.checks.find((c) => c.id === 'fish')?.value).toBe(1);
    expect(res.checks.find((c) => c.id === 'plant')?.value).toBe(2);
  });
});

// ------------------------------------------------------------------ reuse
describe('real deal check in the shopping list', () => {
  it('does not count a sale dearer than the 30-day low as on sale', () => {
    const fake = fakeOffers().map((o) => (o.ingredient === 'rice' ? { ...o, salePrice: o.price, best30: o.price - 0.3 } : o));
    const res = evaluate(buildContext(baseInput({ offers: fake })), [{ day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' }]);
    const rice = res.shopping.find((s) => s.ingredient === 'rice')!;
    expect(rice.deal).toBe('not');
    expect(rice.onSale).toBe(false);
  });
  it('marks a sale below the 30-day low as a real deal', () => {
    const real = fakeOffers().map((o) => (o.ingredient === 'rice' ? { ...o, salePrice: o.price, best30: o.price + 0.5 } : o));
    const res = evaluate(buildContext(baseInput({ offers: real })), [{ day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' }]);
    const rice = res.shopping.find((s) => s.ingredient === 'rice')!;
    expect(rice.deal).toBe('real');
    expect(rice.onSale).toBe(true);
  });
});

describe('seasonal produce', () => {
  it('gives a pumpkin dish a nudge in November but not in July', () => {
    const meal: Meal[] = [{ day: 0, slot: 'dinner', recipeId: 'pumpkin-risotto', source: 'cook' }];
    const nov = evaluate(buildContext(baseInput({ days: 1, meals: ['dinner'], startDate: '2026-11-23' })), meal);
    const jul = evaluate(buildContext(baseInput({ days: 1, meals: ['dinner'], startDate: '2026-07-20' })), meal);
    expect(nov.breakdown.season).toBeLessThan(0);
    expect(jul.breakdown.season).toBeCloseTo(0);
  });
});

describe('variety within a day', () => {
  it('prefers lunch and dinner of different kinds over two pastas', () => {
    const ctx = buildContext(baseInput({ days: 1, meals: ['lunch', 'dinner'] }));
    const twoPastas = evaluate(ctx, [
      { day: 0, slot: 'lunch', recipeId: 'spaghetti-pomodoro', source: 'cook' },
      { day: 0, slot: 'dinner', recipeId: 'pasta-puttanesca', source: 'cook' },
    ]);
    const pastaAndCurry = evaluate(ctx, [
      { day: 0, slot: 'lunch', recipeId: 'spaghetti-pomodoro', source: 'cook' },
      { day: 0, slot: 'dinner', recipeId: 'red-lentil-dal', source: 'cook' },
    ]);
    expect(twoPastas.breakdown.variety).toBeGreaterThan(pastaAndCurry.breakdown.variety);
  });
});

describe('ingredient reuse', () => {
  it('prefers a second meal that uses up an opened pack', () => {
    const input = baseInput({ days: 2, meals: ['dinner'] });
    const ctx = buildContext(input);
    // Both use chicken breast; the stir-fry shares the pack with the souvlaki.
    const share: Meal[] = [
      { day: 0, slot: 'dinner', recipeId: 'chicken-souvlaki-bowls', source: 'cook' },
      { day: 1, slot: 'dinner', recipeId: 'chicken-fajita-wraps', source: 'cook' },
    ];
    const noShare: Meal[] = [
      { day: 0, slot: 'dinner', recipeId: 'chicken-souvlaki-bowls', source: 'cook' },
      { day: 1, slot: 'dinner', recipeId: 'chili-con-carne', source: 'cook' },
    ];
    const a = evaluate(ctx, share);
    const b = evaluate(ctx, noShare);
    expect(a.breakdown.reuse).toBeLessThan(0);
    expect(a.breakdown.reuse).toBeLessThan(b.breakdown.reuse);
  });
  it('lets lunch be yesterday’s dinner when cook once, eat twice is on', () => {
    // Whether a given week uses leftovers depends on the seed, so look at a few weeks.
    let total = 0;
    for (const seed of [1, 2, 3]) {
      const on = generatePlan(baseInput({ meals: ['lunch', 'dinner'], seed }));
      const leftovers = on.meals.filter((m) => m.source === 'leftover');
      total += leftovers.length;
      for (const m of leftovers) {
        const src = on.meals[m.from!];
        const r = RECIPES.find((x) => x.id === src.recipeId)!;
        const bigPot = r.keepsDays >= 3 && r.servings >= 6;
        expect(m.slot).toBe('lunch');
        expect(src.slot).toBe('dinner');
        expect(bigPot ? [m.day - 1, m.day - 2] : [m.day - 1]).toContain(src.day);
        expect(src.recipeId).toBe(m.recipeId);
        // A big pot feeds at most two lunches, anything else one.
        expect(on.meals.filter((x) => x.source === 'leftover' && x.from === m.from).length).toBeLessThanOrEqual(bigPot ? 2 : 1);
      }
    }
    expect(total).toBeGreaterThan(0);
    const off = generatePlan(baseInput({ meals: ['lunch', 'dinner'], seed: 3, settings: { ...DEFAULT_SETTINGS, cookOnceEatTwice: false } }));
    expect(off.meals.some((m) => m.source === 'leftover')).toBe(false);
  });

  it('lets a big pot of sarma feed the next two lunches', () => {
    const input = baseInput({ meals: ['lunch', 'dinner'] });
    const pot = (id: string): Meal[] => [
      { day: 4, slot: 'dinner', recipeId: id, source: 'cook' },
      { day: 5, slot: 'lunch', recipeId: id, source: 'leftover', from: 0 },
      { day: 6, slot: 'lunch', recipeId: id, source: 'leftover', from: 0 },
    ];
    expect(scorePlan(input, pot('sarma')).meals.filter((m) => m.source === 'leftover')).toHaveLength(2);
    // An ordinary dinner only stretches to tomorrow's lunch, not the day after.
    const curry: Meal[] = [
      { day: 4, slot: 'dinner', recipeId: 'thai-green-curry', source: 'cook' },
      { day: 6, slot: 'lunch', recipeId: 'thai-green-curry', source: 'leftover', from: 0 },
    ];
    expect(scorePlan(input, curry).meals.filter((m) => m.source === 'leftover')).toHaveLength(0);
  });

  it('gives dishes from the last two weeks a rest', () => {
    const meals: Meal[] = [
      { day: 0, slot: 'breakfast', recipeId: 'pura-na-mlijeko', source: 'cook' },
      { day: 0, slot: 'dinner', recipeId: 'pasta-carbonara', source: 'cook' },
    ];
    const fresh = evaluate(buildContext(baseInput()), meals);
    const seen = evaluate(buildContext(baseInput({ recent: ['pura-na-mlijeko', 'pasta-carbonara'] })), meals);
    expect(seen.breakdown.recent).toBe(8);
    expect(seen.score - fresh.score).toBe(8);
    const week = generatePlan(baseInput({ recent: fresh.meals.map((m) => m.recipeId), seed: 4 }));
    expect(week.meals.filter((m) => ['pura-na-mlijeko', 'pasta-carbonara'].includes(m.recipeId)).length).toBeLessThanOrEqual(1);
  });

  it('aims for a Croatian classic each week, a different one per seed, new ones first', () => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const c = buildContext(baseInput({ seed })).classic;
      expect(RECIPES.find((r) => r.id === c)!.cuisine).toMatch(/^croatian/);
      picks.add(c!);
    }
    expect(picks.size).toBeGreaterThan(5);
    const tried = RECIPES.filter((r) => r.cuisine.startsWith('croatian') && r.id !== 'sarma').map((r) => r.id);
    expect(buildContext(baseInput({ history: tried })).classic).toBe('sarma');
    expect(buildContext(baseInput({ settings: { ...DEFAULT_SETTINGS, weekendClassic: false } })).classic).toBeNull();
  });
});

// ------------------------------------------------------------------ swap
describe('swap', () => {
  it('replaces one meal and keeps the rest of the plan', () => {
    const plan = generatePlan(baseInput({ seed: 7 }));
    const idx = plan.meals.findIndex((m) => m.slot === 'dinner' && m.source === 'cook' && !plan.meals.some((x) => x.from === plan.meals.indexOf(m)));
    const swapped = swapMeal(baseInput({ seed: 7 }), plan.meals, idx);
    expect(swapped.meals[idx].recipeId).not.toBe(plan.meals[idx].recipeId);
    swapped.meals.forEach((m, i) => {
      if (i !== idx) expect(m.recipeId).toBe(plan.meals[i].recipeId);
    });
    expect(swapped.cost).not.toBe(0);
  });
  it('can swap to a chosen recipe and suggests different ones each time', () => {
    const input = baseInput({ seed: 7 });
    const plan = generatePlan(input);
    const idx = plan.meals.findIndex((m) => m.slot === 'breakfast');
    const chosen = swapMeal(input, plan.meals, idx, { recipeId: 'banana-oat-pancakes' });
    expect(chosen.meals[idx].recipeId).toBe('banana-oat-pancakes');
    const first = swapMeal(input, plan.meals, idx);
    const second = swapMeal(input, plan.meals, idx, { avoid: [first.meals[idx].recipeId] });
    expect(second.meals[idx].recipeId).not.toBe(first.meals[idx].recipeId);
  });
});

// ------------------------------------------------------------------ rules
describe('planner rules', () => {
  it('is deterministic for a seed and changes with a new seed', () => {
    const a = generatePlan(baseInput({ seed: 11, timeBudgetMs: 10_000 }));
    const b = generatePlan(baseInput({ seed: 11, timeBudgetMs: 10_000 }));
    expect(a.meals).toEqual(b.meals);
    const c = generatePlan(baseInput({ seed: 12 }));
    expect(c.meals.map((m) => m.recipeId)).not.toEqual(a.meals.map((m) => m.recipeId));
  });
  it('respects diet, dislikes and thumbs down', () => {
    const res = generatePlan(
      baseInput({ diet: 'vegetarian', dislikes: ['mushrooms'], ratings: [{ recipeId: 'chana-masala', up: false, until: null }] }),
    );
    for (const m of res.meals) {
      const r = RECIPES.find((x) => x.id === m.recipeId)!;
      expect(['vegan', 'vegetarian']).toContain(r.facts.diet);
      expect(r.ingredients.some((i) => i.id === 'mushrooms' && !i.optional)).toBe(false);
      expect(m.recipeId).not.toBe('chana-masala');
    }
  });
  it('keeps weekday cooking within the time limit and never repeats a main dish', () => {
    const res = generatePlan(baseInput({ settings: { ...DEFAULT_SETTINGS, weekdayMaxMinutes: 35 } }));
    const mains = res.meals.filter((m) => (m.slot === 'lunch' || m.slot === 'dinner') && m.source === 'cook');
    for (const m of mains) {
      if (m.day < 5) expect(RECIPES.find((r) => r.id === m.recipeId)!.facts.totalMinutes).toBeLessThanOrEqual(35);
    }
    expect(new Set(mains.map((m) => m.recipeId)).size).toBe(mains.length);
  });
  it('includes at least one new dish', () => {
    const history = RECIPES.slice(0, 60).map((r) => r.id);
    const res = generatePlan(baseInput({ history }));
    expect(res.views.some((v) => v.newDish && (v.slot === 'lunch' || v.slot === 'dinner'))).toBe(true);
  });
  it('plans a full week with all five meals in under 2 seconds', () => {
    const t0 = performance.now();
    const res = generatePlan(baseInput({ meals: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'], timeBudgetMs: 900 }));
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(res.meals.length).toBe(35);
  });
});

describe("I don't have X", () => {
  it('puts the swap on the shopping list instead of the original', () => {
    const input = baseInput();
    const plan = generatePlan(input);
    const i = plan.meals.findIndex((m) => m.source === 'cook' && RECIPES.find((r) => r.id === m.recipeId)!.ingredients.some((x) => x.id === 'onion' && !x.optional));
    expect(i).toBeGreaterThanOrEqual(0);
    const others = plan.meals.some((m, k) => k !== i && m.source === 'cook' && RECIPES.find((r) => r.id === m.recipeId)!.ingredients.some((x) => x.id === 'onion'));
    const meals = plan.meals.map((m, k) => (k === i ? { ...m, subs: { onion: 'leek' } } : m));
    const swapped = scorePlan(input, meals);
    expect(swapped.shopping.some((l) => l.ingredient === 'leek')).toBe(true);
    if (!others) expect(swapped.shopping.some((l) => l.ingredient === 'onion')).toBe(false);
    const left = scorePlan(input, plan.meals.map((m, k) => (k === i ? { ...m, subs: { onion: '' } } : m)));
    expect(left.cost).toBeLessThanOrEqual(scorePlan(input, plan.meals).cost);
  });
});
