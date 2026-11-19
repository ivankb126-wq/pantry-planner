// Scores a plan. Lower is better. The score is in euros plus penalties, so
// a 1 EUR saving and a 1 point nutrition improvement weigh about the same.

import { type IngredientInfo, type ServingFacts, toIngredientUnit, zeroNutrition } from '../lib/nutrition';
import { type Purchase, cheapestPurchase, indexOffers } from './pricing';
import type { Check, Meal, MealView, Offer, PlanInput, PlanResult, PlannerRecipe, ShoppingLine, Slot } from './types';

/** Share of a day's food each meal stands for (targets shrink when fewer meals are planned). */
export const MEAL_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.33, dinner: 0.32, snack: 0.05, dessert: 0.05 };
export const CHILD_PORTION = 0.6;
/** Store name used for typical (estimated) prices. */
export const ESTIMATE = 'estimate';

const PERISHABLE = new Set(['meat', 'fish', 'fruit-veg', 'dairy', 'eggs', 'bakery']);
const VARIETY_PROTEINS = new Set(['chicken', 'turkey', 'beef', 'pork', 'lamb', 'veal', 'fish', 'seafood', 'mixed-meat']);

export interface Context {
  input: PlanInput;
  portions: number;
  recipes: Map<string, PlannerRecipe>;
  /** Ingredient amounts for one portion of each recipe (optional ones left out). */
  perPortion: Map<string, { id: string; amount: number }[]>;
  offers: Map<string, Offer[]>;
  pantry: Map<string, number>;
  useSoon: Set<string>;
  dates: string[];
  weekday: boolean[];
  share: number; // total meal share planned per day
  history: Set<string>;
  historyCuisines: Set<string>;
  liked: Set<string>;
  hidden: Set<string>;
  purchaseCache: Map<string, Purchase>;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function isWeekday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd >= 1 && wd <= 5;
}

export function buildContext(input: PlanInput): Context {
  const portions = Math.max(1, input.adults + CHILD_PORTION * input.children);
  const recipes = new Map(input.recipes.map((r) => [r.id, r]));
  const perPortion = new Map<string, { id: string; amount: number }[]>();
  for (const r of input.recipes) {
    const list: { id: string; amount: number }[] = [];
    for (const ri of r.ingredients) {
      const ing = input.ingredients[ri.id];
      if (!ing || ri.optional) continue;
      list.push({ id: ri.id, amount: toIngredientUnit(ing, ri.quantity, ri.unit) / r.servings });
    }
    perPortion.set(r.id, list);
  }
  const today = input.startDate;
  const pantry = new Map<string, number>();
  const useSoon = new Set<string>();
  for (const p of input.pantry) {
    pantry.set(p.ingredient, (pantry.get(p.ingredient) ?? 0) + p.amount);
    if (p.expiresOn && p.expiresOn <= addDays(today, 3)) useSoon.add(p.ingredient);
  }
  const dates = Array.from({ length: input.days }, (_, i) => addDays(input.startDate, i));
  // Store prices first; typical prices only fill the gaps.
  const offers = indexOffers(input.offers);
  const estimates = indexOffers((input.referenceOffers ?? []).map((o) => ({ ...o, store: ESTIMATE })));
  for (const [id, list] of estimates) if (!offers.has(id)) offers.set(id, list);
  const hidden = new Set(
    input.ratings.filter((r) => !r.up && (!r.until || r.until >= today)).map((r) => r.recipeId),
  );
  return {
    input,
    portions,
    recipes,
    perPortion,
    offers,
    pantry,
    useSoon,
    dates,
    weekday: dates.map(isWeekday),
    share: input.meals.reduce((s, m) => s + MEAL_SHARE[m], 0),
    history: new Set(input.history),
    historyCuisines: new Set(input.history.map((id) => recipes.get(id)?.cuisine).filter((c): c is string => !!c)),
    liked: new Set(input.ratings.filter((r) => r.up).map((r) => r.recipeId)),
    hidden,
    purchaseCache: new Map(),
  };
}

function purchase(ctx: Context, ing: IngredientInfo, need: number): Purchase {
  const key = `${ing.id}:${Math.round(need * 10)}`;
  let p = ctx.purchaseCache.get(key);
  if (!p) {
    p = cheapestPurchase(need, ctx.offers.get(ing.id) ?? [], ing.unit);
    ctx.purchaseCache.set(key, p);
  }
  return p;
}

/** Portions each cooking meal makes, and the meals that eat from it. */
function cookingPlan(ctx: Context, meals: Meal[]): { cookedFor: number[]; eaters: number[][] } {
  const eaters = meals.map((m, i) => (m.source === 'cook' ? [i] : []));
  meals.forEach((m, i) => {
    if (m.source === 'leftover' && m.from != null && eaters[m.from]) eaters[m.from].push(i);
  });
  const cookedFor = meals.map((m, i) => {
    if (m.source !== 'cook') return 0;
    const need = ctx.portions * eaters[i].length;
    const r = ctx.recipes.get(m.recipeId)!;
    // Snacks and desserts are made as a whole batch (a tray of muffins, a cake).
    return m.slot === 'snack' || m.slot === 'dessert' ? Math.max(r.servings, need) : need;
  });
  return { cookedFor, eaters };
}

export function evaluate(ctx: Context, meals: Meal[]): PlanResult {
  const { input } = ctx;
  const { cookedFor, eaters } = cookingPlan(ctx, meals);

  // ---------------------------------------------------------------- ingredients and cost
  const need = new Map<string, number>();
  const usedBy = new Map<string, Set<number>>();
  meals.forEach((m, i) => {
    if (m.source !== 'cook') return;
    for (const { id, amount } of ctx.perPortion.get(m.recipeId) ?? []) {
      need.set(id, (need.get(id) ?? 0) + amount * cookedFor[i]);
      if (!usedBy.has(id)) usedBy.set(id, new Set());
      usedBy.get(id)!.add(i);
    }
  });

  const shopping: ShoppingLine[] = [];
  const fromPantry: { ingredient: string; amount: number }[] = [];
  const leftovers: { ingredient: string; amount: number }[] = [];
  const unitCost = new Map<string, number>();
  const missingPrices: string[] = [];
  const estimatedPrices: string[] = [];
  const onSale = new Set<string>();
  const stores = new Set<string>();
  let cost = 0;
  let waste = 0;
  for (const [id, total] of need) {
    const ing = input.ingredients[id];
    const have = Math.min(total, ctx.pantry.get(id) ?? 0);
    if (have > 0) fromPantry.push({ ingredient: id, amount: round1(have) });
    const net = total - have;
    if (net <= 1e-6) continue;
    const p = purchase(ctx, ing, net);
    if (!p.lines.length) {
      missingPrices.push(id);
      continue;
    }
    cost += p.cost;
    unitCost.set(id, p.cost / p.bought);
    const estimated = p.lines.some((l) => l.offer.store === ESTIMATE);
    if (estimated) estimatedPrices.push(id);
    for (const l of p.lines) {
      if (l.offer.store !== ESTIMATE) stores.add(l.offer.store);
      const sale = l.offer.salePrice != null;
      if (sale) onSale.add(id);
      shopping.push({
        ingredient: id,
        store: l.offer.store,
        product: l.offer.name,
        size: l.offer.size,
        loose: !!l.offer.loose,
        packs: l.count,
        amount: round1(l.amount),
        cost: l.cost,
        onSale: sale,
        estimated: l.offer.store === ESTIMATE,
      });
    }
    const left = p.bought - net;
    if (left > 0.01 * Math.max(1, p.bought)) {
      leftovers.push({ ingredient: id, amount: round1(left) });
      if (PERISHABLE.has(ing.category) || (ing.shelfLifeDays ?? 99) <= 7) waste += left * (p.cost / p.bought);
    }
  }
  cost = round2(cost);

  // ---------------------------------------------------------------- per meal views
  const recipeCost = meals.map((m, i) => {
    if (m.source !== 'cook') return 0;
    let c = 0;
    for (const { id, amount } of ctx.perPortion.get(m.recipeId) ?? []) {
      const total = need.get(id) ?? 0;
      const paidShare = total > 0 ? Math.max(0, total - (ctx.pantry.get(id) ?? 0)) / total : 0;
      c += amount * cookedFor[i] * paidShare * (unitCost.get(id) ?? 0);
    }
    return c;
  });
  const views: MealView[] = meals.map((m, i) => {
    const r = ctx.recipes.get(m.recipeId)!;
    const cookIdx = m.source === 'cook' ? i : (m.from ?? i);
    const share = recipeCost[cookIdx] / Math.max(1, eaters[cookIdx]?.length ?? 1);
    return {
      day: m.day,
      date: ctx.dates[m.day],
      slot: m.slot,
      recipeId: m.recipeId,
      title: r.title,
      illustration: r.illustration,
      minutes: m.source === 'leftover' ? 5 : r.facts.totalMinutes,
      kcal: r.facts.perServing.kcal,
      cost: round2(share),
      leftover: m.source === 'leftover',
      portions: round1(ctx.portions),
      newDish: m.source === 'cook' && !ctx.history.has(m.recipeId),
    };
  });

  // ---------------------------------------------------------------- nutrition per person per day
  const days = input.days;
  const sum: ServingFacts = { ...zeroNutrition(), addedSugar: 0, vegPortions: 0 };
  for (const m of meals) {
    const f = ctx.recipes.get(m.recipeId)!.facts.perServing;
    for (const k of Object.keys(sum) as (keyof ServingFacts)[]) sum[k] += f[k];
  }
  const perPersonDay = Object.fromEntries(
    Object.entries(sum).map(([k, v]) => [k, round1(v / days)]),
  ) as unknown as ServingFacts;

  const mains = meals.filter((m) => m.slot === 'lunch' || m.slot === 'dinner');
  const fishMeals = mains.filter((m) => ctx.recipes.get(m.recipeId)!.facts.fish).length;
  const redMeals = mains.filter((m) => {
    const f = ctx.recipes.get(m.recipeId)!.facts;
    return f.redMeat || f.processedMeat;
  }).length;
  const plantMains = mains.filter((m) => {
    const f = ctx.recipes.get(m.recipeId)!.facts;
    return f.legumeMain || f.diet === 'vegan' || f.diet === 'vegetarian';
  }).length;

  const s = ctx.share;
  const T = input.settings.energyTarget * s;
  const weeks = days / 7;
  const hasMains = mains.length > 0;
  const checks: Check[] = [
    check('energy', 'Energy', perPersonDay.kcal, `${Math.round(T * 0.9)} to ${Math.round(T * 1.1)} kcal`, Math.abs(perPersonDay.kcal - T) <= 0.1 * T),
    check('protein', 'Protein', perPersonDay.protein, `at least ${Math.round(60 * s)} g`, perPersonDay.protein >= 60 * s),
    check('fibre', 'Fibre', perPersonDay.fibre, `at least ${Math.round(25 * s)} g`, perPersonDay.fibre >= 25 * s),
    check('veg', 'Vegetables and fruit', perPersonDay.vegPortions, `at least ${round1(3 * s)} portions`, perPersonDay.vegPortions >= 3 * s),
    check('sugar', 'Added sugar', perPersonDay.addedSugar, `at most ${Math.round(30 * s)} g`, perPersonDay.addedSugar <= 30 * s),
    check('salt', 'Salt', perPersonDay.salt, `at most ${round1(6 * s)} g`, perPersonDay.salt <= 6 * s),
  ];
  if (hasMains) {
    checks.push(
      check('fish', 'Fish or seafood', fishMeals, `at least ${Math.ceil(weeks)} a week`, fishMeals >= Math.ceil(weeks)),
      check('red-meat', 'Red or processed meat', redMeals, `at most ${Math.round(3 * weeks)} a week`, redMeals <= Math.round(3 * weeks)),
      check('plant', 'Bean or vegetarian mains', plantMains, `at least ${Math.ceil(2 * weeks)} a week`, plantMains >= Math.ceil(2 * weeks)),
    );
  }

  // ---------------------------------------------------------------- penalties and bonuses
  const b: Record<string, number> = { cost };
  const over = cost - input.budget;
  b.budget = over > 0 ? 25 + 40 * over : 0;
  const eDev = Math.abs(perPersonDay.kcal - T) / Math.max(1, T);
  b.energy = eDev > 0.1 ? (eDev - 0.1) * 60 : 0;
  b.protein = shortfall(perPersonDay.protein, 60 * s) * 25;
  b.fibre = shortfall(perPersonDay.fibre, 25 * s) * 15;
  b.veg = shortfall(perPersonDay.vegPortions, 3 * s) * 20;
  b.sugar = excess(perPersonDay.addedSugar, 30 * s) * 10;
  b.salt = excess(perPersonDay.salt, 6 * s) * 12;
  if (hasMains) {
    b.fish = Math.max(0, Math.ceil(weeks) - fishMeals) * 8;
    b.redMeat = Math.max(0, redMeals - Math.round(3 * weeks)) * 5;
    b.plant = Math.max(0, Math.ceil(2 * weeks) - plantMains) * 5;
  }

  // Variety
  let variety = 0;
  const cookedMains = new Map<string, number>();
  const cookedOther = new Map<string, number>();
  const proteinByDay: Set<string>[] = Array.from({ length: days }, () => new Set());
  const cuisineCount = new Map<string, number>();
  meals.forEach((m) => {
    if (m.source !== 'cook') return;
    const r = ctx.recipes.get(m.recipeId)!;
    if (m.slot === 'lunch' || m.slot === 'dinner') {
      cookedMains.set(m.recipeId, (cookedMains.get(m.recipeId) ?? 0) + 1);
      if (VARIETY_PROTEINS.has(r.mainProtein)) proteinByDay[m.day].add(r.mainProtein);
      cuisineCount.set(r.cuisine, (cuisineCount.get(r.cuisine) ?? 0) + 1);
    } else {
      cookedOther.set(`${m.slot}:${m.recipeId}`, (cookedOther.get(`${m.slot}:${m.recipeId}`) ?? 0) + 1);
    }
  });
  for (const n of cookedMains.values()) variety += Math.max(0, n - 1) * 40;
  for (const [key, n] of cookedOther) variety += Math.max(0, n - (key.startsWith('breakfast') ? 2 : 1)) * 4;
  for (let d = 1; d < days; d++) {
    for (const p of proteinByDay[d]) if (proteinByDay[d - 1].has(p)) variety += 6;
  }
  const mainCount = [...cookedMains.values()].reduce((a, n) => a + n, 0);
  for (const n of cuisineCount.values()) variety += Math.max(0, n - Math.max(2, Math.ceil(mainCount / 3))) * 2;
  b.variety = variety;

  // Ingredient reuse: an opened pack of fresh food shared by two or three
  // meals (a 500 g chicken pack over two dinners). Meat, fish and dairy
  // count most; other fresh food a little. Waste is penalised separately.
  let reuse = 0;
  for (const [id, set] of usedBy) {
    const ing = input.ingredients[id];
    if (set.size < 2 || !(PERISHABLE.has(ing.category) || (ing.shelfLifeDays ?? 99) <= 7)) continue;
    const weight = ing.category === 'meat' || ing.category === 'fish' ? 1.5 : ing.category === 'dairy' ? 0.5 : 0.2;
    reuse += Math.min(set.size - 1, 2) * weight;
  }
  b.reuse = -reuse;
  b.waste = waste * 0.6;

  // Ratings, sales, new dishes, pantry
  let liked = 0;
  let sale = 0;
  let newMains = 0;
  let rareNew = false;
  meals.forEach((m, i) => {
    if (m.source !== 'cook') return;
    if (ctx.liked.has(m.recipeId)) liked += 2.5;
    // Main ingredients = the two that cost the most in this meal
    const main = (ctx.perPortion.get(m.recipeId) ?? [])
      .map(({ id, amount }) => ({ id, value: amount * cookedFor[i] * (unitCost.get(id) ?? 0) }))
      .sort((a, b2) => b2.value - a.value)
      .slice(0, 2);
    if (main.some((x) => onSale.has(x.id))) sale += 0.8;
    if ((m.slot === 'lunch' || m.slot === 'dinner') && !ctx.history.has(m.recipeId)) {
      newMains++;
      if (!ctx.historyCuisines.has(ctx.recipes.get(m.recipeId)!.cuisine)) rareNew = true;
    }
  });
  b.liked = -liked;
  b.sale = -sale;
  b.newDish = input.settings.newDishEachWeek && hasMains ? (newMains === 0 ? 6 : rareNew ? -1.5 : 0) : 0;
  b.useSoon = [...ctx.useSoon].filter((id) => !need.has(id)).length * 2;
  b.stores = Math.max(0, stores.size - 1) * 1.5;
  // Prefer what the chosen store actually lists (spices barely matter).
  b.estimated = estimatedPrices.filter((id) => input.ingredients[id].category !== 'spices').length * 0.7;

  const score = round2(Object.values(b).reduce((a, v) => a + v, 0));
  const warnings: string[] = [];
  if (over > 0) warnings.push(`This plan is ${round2(over).toFixed(2)} EUR over budget.`);

  return {
    meals,
    views,
    shopping: shopping.sort((a, x) => a.store.localeCompare(x.store) || a.ingredient.localeCompare(x.ingredient)),
    fromPantry,
    leftovers,
    cost,
    budget: input.budget,
    moneyLeft: round2(input.budget - cost),
    perPersonDay,
    checks,
    score,
    breakdown: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round2(v)])),
    missingPrices,
    estimatedPrices,
    warnings,
  };
}

function check(id: string, label: string, value: number, target: string, ok: boolean): Check {
  return { id, label, value: round1(value), target, ok };
}

function shortfall(v: number, target: number): number {
  return target > 0 && v < target ? (target - v) / target : 0;
}

function excess(v: number, limit: number): number {
  return limit > 0 && v > limit ? (v - limit) / limit : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
