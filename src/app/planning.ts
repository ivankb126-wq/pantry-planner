// Glue between the saved app state and the planner engine.

import { zagrebToday } from '../lib/format';
import { toIngredientUnit } from '../lib/nutrition';
import { CHILD_PORTION, addDays } from '../planner/evaluate';
import { generatePlan, scorePlan, swapMeal } from '../planner/planner';
import type { PantryItem, PlanInput, PlanResult, PlannerRecipe } from '../planner/types';
import { INGREDIENTS, RECIPES } from './catalog';
import type { PriceData } from './prices';
import { type AppData, type PantryEntry, type SavedPlan, type Settings, settingsKey } from './state';

export function livePantry(d: AppData): PantryItem[] {
  return d.pantry.map((p) => ({ ingredient: p.ingredient, amount: p.amount, expiresOn: p.expiresOn }));
}

export function planInput(d: AppData, prices: PriceData, seed: number, startDate: string, pantry: PantryItem[]): PlanInput {
  const s = d.settings;
  const today = zagrebToday();
  return {
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    offers: prices.offers,
    referenceOffers: prices.reference,
    adults: s.adults,
    children: s.children,
    budget: s.budget,
    days: 7,
    startDate,
    meals: s.meals,
    diet: s.diet,
    dislikes: s.dislikes,
    pantry,
    ratings: [
      ...d.ratings.filter((r) => r.up || r.until == null || r.until > today),
      ...d.favourites.filter((id) => !d.ratings.some((r) => r.recipeId === id)).map((recipeId) => ({ recipeId, up: true })),
    ],
    history: [...new Set(d.history.map((h) => h.recipeId))],
    settings: {
      cookOnceEatTwice: s.cookOnceEatTwice,
      newDishEachWeek: s.newDishEachWeek,
      weekendClassic: s.weekendClassic,
      energyTarget: s.energyTarget,
      weekdayMaxMinutes: s.weekdayMaxMinutes,
    },
    seed,
  };
}

export function makePlan(d: AppData, prices: PriceData, seed = Math.floor(Math.random() * 1e9)): { plan: SavedPlan; result: PlanResult } {
  const startDate = zagrebToday();
  const pantry = livePantry(d);
  const result = generatePlan(planInput(d, prices, seed, startDate, pantry));
  return {
    plan: {
      startDate,
      seed,
      meals: result.meals,
      cooked: [],
      avoid: {},
      settingsKey: settingsKey(d.settings),
      createdAt: new Date().toISOString(),
      pantryAtStart: pantry,
    },
    result,
  };
}

let memo: { key: string; prices: PriceData; result: PlanResult } | null = null;

/** Costs, shopping list and nutrition of the saved plan (re-scored with today's prices). */
export function planResult(d: AppData, prices: PriceData): PlanResult | null {
  if (!d.plan) return null;
  const key = JSON.stringify([d.plan.meals, d.plan.startDate, d.plan.pantryAtStart, settingsKey(d.settings)]);
  if (memo && memo.key === key && memo.prices === prices) return memo.result;
  const result = scorePlan(planInput(d, prices, d.plan.seed, d.plan.startDate, d.plan.pantryAtStart), d.plan.meals);
  memo = { key, prices, result };
  return result;
}

export function swapInPlan(d: AppData, prices: PriceData, index: number, recipeId?: string): SavedPlan {
  const plan = d.plan!;
  const tried = [...(plan.avoid[index] ?? []), plan.meals[index].recipeId];
  const res = swapMeal(planInput(d, prices, plan.seed, plan.startDate, plan.pantryAtStart), plan.meals, index, {
    recipeId,
    avoid: recipeId ? [] : tried,
    seed: plan.seed + tried.length,
  });
  return { ...plan, meals: res.meals, avoid: { ...plan.avoid, [index]: tried } };
}

/** Index of the plan's day for today (0..6), or outside that range. */
export function todayIndex(plan: SavedPlan): number {
  const [y1, m1, d1] = plan.startDate.split('-').map(Number);
  const [y2, m2, d2] = zagrebToday().split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function planDate(plan: SavedPlan, day: number): string {
  return addDays(plan.startDate, day);
}

/** Why the saved plan should be replaced, if it should. */
export function planProblem(d: AppData): 'none' | 'settings' | 'over' | null {
  if (!d.plan) return 'none';
  if (todayIndex(d.plan) >= 7) return 'over';
  if (d.plan.settingsKey !== settingsKey(d.settings)) return 'settings';
  return null;
}

/** People eating, as portions (children eat about 60 percent). */
export function portionsFor(s: Settings): number {
  return s.adults + s.children * CHILD_PORTION;
}

export interface ScaledIngredient {
  id: string;
  name: string;
  amount: number; // ingredient unit
  unit: 'g' | 'ml' | 'piece';
  display: string; // "300 g", "2 tbsp"
  optional: boolean;
  note?: string;
}

const num = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: n < 10 ? 1 : 0 });

/** Round to amounts people use in a kitchen. */
function friendly(n: number, unit: string): string {
  if (unit === 'g' || unit === 'ml') {
    const r = n >= 100 ? Math.round(n / 10) * 10 : n >= 20 ? Math.round(n / 5) * 5 : Math.round(n);
    if (r >= 1000) return `${num(r / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
    return `${r} ${unit}`;
  }
  const q = Math.round(n * 4) / 4;
  const txt = q === 0.25 ? '¼' : q === 0.5 ? '½' : q === 0.75 ? '¾' : num(q);
  if (unit === 'piece') return txt;
  if (unit === 'pinch') return `${txt} ${q > 1 ? 'pinches' : 'pinch'}`;
  return `${txt} ${unit}`;
}

/** A recipe's ingredients scaled to the number of portions. */
export function scaledIngredients(r: PlannerRecipe, portions: number): ScaledIngredient[] {
  const f = portions / r.servings;
  return r.ingredients.map((ri) => {
    const ing = INGREDIENTS[ri.id];
    const qty = ri.quantity * f;
    let amount: number;
    try {
      amount = toIngredientUnit(ing, qty, ri.unit);
    } catch {
      amount = 0;
    }
    return {
      id: ri.id,
      name: ing?.name ?? ri.id,
      amount,
      unit: ing?.unit ?? 'g',
      display: friendly(qty, ri.unit),
      optional: !!ri.optional,
      note: ri.note,
    };
  });
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A pantry entry for an ingredient, with a default shelf life. */
export function pantryEntry(ingredient: string, amount: number, today = zagrebToday()): PantryEntry {
  const ing = INGREDIENTS[ingredient];
  const life = ing?.shelfLifeDays;
  return {
    id: newId(),
    ingredient,
    amount,
    full: amount,
    storage: ing?.storage ?? 'shelves',
    addedOn: today,
    expiresOn: life ? addDays(today, life) : undefined,
  };
}

/** Add amounts to the pantry, merging with an item of the same ingredient. */
export function addToPantry(pantry: PantryEntry[], items: { ingredient: string; amount: number }[]): PantryEntry[] {
  const out = [...pantry];
  for (const it of items) {
    if (!(it.amount > 0)) continue;
    const i = out.findIndex((p) => p.ingredient === it.ingredient);
    if (i >= 0) {
      const p = out[i];
      out[i] = { ...p, amount: p.amount + it.amount, full: Math.max(p.full, p.amount + it.amount) };
    } else out.push(pantryEntry(it.ingredient, it.amount));
  }
  return out;
}
