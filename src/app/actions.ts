// Things you can do in the app. Each one changes the saved state.

import { zagrebToday } from '../lib/format';
import { addDays, wholeServings } from '../planner/evaluate';
import type { PlanResult } from '../planner/types';
import { INGREDIENTS, RECIPE_BY_ID } from './catalog';
import { cookNeeds, mealPortions, stock, useFood } from './pantry';
import { makePlan, portionsFor, swapInPlan } from './planning';
import { keepRecap } from './recap';
import type { PriceData } from './prices';
import { type Amount, type AppData, type PantryEntry, type SavedPlan, getData, update } from './state';

export function newPlan(prices: PriceData): SavedPlan | null {
  const before = getData().plan;
  const { plan } = makePlan(getData(), prices);
  update((d) => {
    keepRecap(d);
    d.plan = plan;
    d.shoppingChecked = {};
  });
  return before;
}

export function restorePlan(plan: SavedPlan | null): void {
  update((d) => {
    d.plan = plan;
  });
}

export function swap(prices: PriceData, index: number, recipeId?: string): void {
  const plan = swapInPlan(getData(), prices, index, recipeId);
  update((d) => {
    // Food already taken for the old dish stays used.
    const taken = { ...(plan.taken ?? {}) };
    delete taken[index];
    d.plan = { ...plan, cooked: plan.cooked.filter((i) => i !== index), taken };
  });
}

/**
 * Mark a meal cooked (or not). Cooking takes the recipe's food out of the
 * pantry and adds the dish to the history; unmarking puts both back.
 * Returns what was taken from the pantry.
 */
export function setCooked(index: number, cooked: boolean): Amount[] {
  let taken: Amount[] = [];
  update((d) => {
    if (!d.plan) return;
    const plan = d.plan;
    const meal = plan.meals[index];
    const set = new Set(plan.cooked);
    if (cooked) set.add(index);
    else set.delete(index);
    plan.cooked = [...set].sort((a, b) => a - b);
    if (meal.source !== 'cook') return;
    const date = addDays(plan.startDate, meal.day);
    plan.taken = plan.taken ?? {};
    if (cooked) {
      if (!d.history.some((h) => h.recipeId === meal.recipeId && h.date === date)) d.history.push({ recipeId: meal.recipeId, date });
      const r = RECIPE_BY_ID.get(meal.recipeId);
      if (r && !plan.taken[index]) {
        taken = useFood(d, cookNeeds(r, wholeServings(mealPortions(plan, index, d.settings)), meal.subs));
        plan.taken[index] = taken;
      }
    } else {
      d.history = d.history.filter((h) => !(h.recipeId === meal.recipeId && h.date === date));
      const back = plan.taken[index];
      if (back) {
        stock(d, back);
        delete plan.taken[index];
      }
    }
  });
  return taken;
}

/**
 * "I don't have X" for a planned meal: use `to` instead of `ingredient`
 * ('' leaves it out, null goes back to the recipe). Swaps go on the meal
 * that is cooked, so leftovers follow.
 */
export function setSub(index: number, ingredient: string, to: string | null): void {
  update((d) => {
    const m = d.plan?.meals[index];
    if (!m || m.source !== 'cook') return;
    const subs = { ...(m.subs ?? {}) };
    if (to === null) delete subs[ingredient];
    else subs[ingredient] = to;
    if (Object.keys(subs).length) m.subs = subs;
    else delete m.subs;
  });
}

/** Cooked a recipe that is not in the plan (from the recipe page). */
export function cookedOutsidePlan(recipeId: string): { taken: Amount[]; undo: () => void } {
  const before = getData();
  let taken: Amount[] = [];
  update((d) => {
    const date = zagrebToday();
    if (!d.history.some((h) => h.recipeId === recipeId && h.date === date)) d.history.push({ recipeId, date });
    const r = RECIPE_BY_ID.get(recipeId);
    if (r) taken = useFood(d, cookNeeds(r, portionsFor(d.settings)));
  });
  return {
    taken,
    undo: () =>
      update((d) => {
        d.pantry = before.pantry;
        d.history = before.history;
        d.ranOut = before.ranOut;
      }),
  };
}

export function saveLeftovers(result: PlanResult): void {
  update((d) => {
    if (!d.plan) return;
    stock(d, result.leftovers);
    d.plan.leftoversSaved = true;
  });
}

export function addExtra(ingredient: string): void {
  update((d) => {
    if (!d.extras.includes(ingredient)) d.extras.push(ingredient);
  });
}

export function removeExtra(ingredient: string): void {
  update((d) => {
    d.extras = d.extras.filter((x) => x !== ingredient);
  });
}

export function dismissLow(ingredient: string): void {
  update((d) => {
    d.lowDismissed[ingredient] = zagrebToday();
    d.ranOut = d.ranOut.filter((x) => x !== ingredient);
  });
}

export function removeFromPantry(id: string): PantryEntry[] {
  const before = getData().pantry;
  update((d) => {
    const e = d.pantry.find((p) => p.id === id);
    d.pantry = d.pantry.filter((p) => p.id !== id);
    if (e && INGREDIENTS[e.ingredient]?.staple && !d.pantry.some((p) => p.ingredient === e.ingredient) && !d.ranOut.includes(e.ingredient)) d.ranOut.push(e.ingredient);
  });
  return before;
}

/**
 * "I threw this away": takes the item out of the pantry and remembers it
 * (with its rough value) for the weekly recap. Returns the state to undo.
 */
export function throwAway(id: string, value: number): { pantry: PantryEntry[]; thrown: AppData['thrown'] } {
  const before = getData();
  update((d) => {
    const e = d.pantry.find((p) => p.id === id);
    if (!e) return;
    d.thrown.push({ date: zagrebToday(), ingredient: e.ingredient, amount: e.amount, value: Math.round(value * 100) / 100 });
    d.pantry = d.pantry.filter((p) => p.id !== id);
    if (INGREDIENTS[e.ingredient]?.staple && !d.pantry.some((p) => p.ingredient === e.ingredient) && !d.ranOut.includes(e.ingredient)) d.ranOut.push(e.ingredient);
  });
  return { pantry: before.pantry, thrown: before.thrown };
}

export function undoThrowAway(was: { pantry: PantryEntry[]; thrown: AppData['thrown'] }): void {
  update((d) => {
    d.pantry = was.pantry;
    d.thrown = was.thrown;
    const ids = new Set(was.pantry.map((p) => p.ingredient));
    d.ranOut = d.ranOut.filter((x) => !ids.has(x));
  });
}

export function restorePantry(pantry: PantryEntry[]): void {
  update((d) => {
    d.pantry = pantry;
    const ids = new Set(pantry.map((p) => p.ingredient));
    d.ranOut = d.ranOut.filter((x) => !ids.has(x));
  });
}

export type HideFor = 'forever' | '8weeks';

export function rate(recipeId: string, up: boolean | null, hide: HideFor = '8weeks', reasons: string[] = []): void {
  update((d) => {
    d.ratings = d.ratings.filter((r) => r.recipeId !== recipeId);
    if (up === null) return;
    d.ratings.push({
      recipeId,
      up,
      until: up ? null : hide === 'forever' ? null : addDays(zagrebToday(), 56),
      reasons: up ? undefined : reasons,
      at: new Date().toISOString(),
    });
  });
}

export function setReasons(recipeId: string, reasons: string[]): void {
  update((d) => {
    const r = d.ratings.find((x) => x.recipeId === recipeId);
    if (r) r.reasons = reasons;
  });
}

export function ratingOf(d: AppData, recipeId: string) {
  return d.ratings.find((r) => r.recipeId === recipeId) ?? null;
}

export function toggleFavourite(recipeId: string): void {
  update((d) => {
    d.favourites = d.favourites.includes(recipeId) ? d.favourites.filter((x) => x !== recipeId) : [...d.favourites, recipeId];
  });
}

export function setNote(recipeId: string, text: string): void {
  update((d) => {
    if (text.trim()) d.notes[recipeId] = text;
    else delete d.notes[recipeId];
  });
}
