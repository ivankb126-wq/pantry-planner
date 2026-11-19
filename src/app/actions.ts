// Things you can do in the app. Each one changes the saved state.

import { zagrebToday } from '../lib/format';
import { addDays } from '../planner/evaluate';
import type { PlanResult } from '../planner/types';
import { addToPantry, makePlan, swapInPlan } from './planning';
import type { PriceData } from './prices';
import { type AppData, type SavedPlan, getData, update } from './state';

export function newPlan(prices: PriceData): SavedPlan | null {
  const before = getData().plan;
  const { plan } = makePlan(getData(), prices);
  update((d) => {
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
    d.plan = { ...plan, cooked: plan.cooked.filter((i) => i !== index) };
  });
}

/** Mark a meal cooked (or not). Cooked meals go into the history. */
export function setCooked(index: number, cooked: boolean): void {
  update((d) => {
    if (!d.plan) return;
    const meal = d.plan.meals[index];
    const set = new Set(d.plan.cooked);
    if (cooked) set.add(index);
    else set.delete(index);
    d.plan.cooked = [...set].sort((a, b) => a - b);
    const date = addDays(d.plan.startDate, meal.day);
    if (meal.source !== 'cook') return;
    if (cooked && !d.history.some((h) => h.recipeId === meal.recipeId && h.date === date)) d.history.push({ recipeId: meal.recipeId, date });
    if (!cooked) d.history = d.history.filter((h) => !(h.recipeId === meal.recipeId && h.date === date));
  });
}

export function saveLeftovers(result: PlanResult): void {
  update((d) => {
    if (!d.plan) return;
    d.pantry = addToPantry(d.pantry, result.leftovers);
    d.plan.leftoversSaved = true;
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
