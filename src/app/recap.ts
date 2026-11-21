// Weekly recap: spent against the budget, money saved on sales, meals cooked,
// food thrown away and the favourite new dish. Spending counts what went
// from the shopping list into the pantry ("Add basket to my pantry").

import { addDays } from '../planner/evaluate';
import { INGREDIENTS } from './catalog';
import type { AppData, SavedPlan, WeekRecap } from './state';

const KEEP_WEEKS = 12;

export function weekRecap(d: AppData, plan: SavedPlan): WeekRecap {
  const startDate = plan.startDate;
  const endDate = addDays(startDate, 6);
  const inWeek = (date: string) => date >= startDate && date <= endDate;
  const bought = d.purchases.filter((p) => inWeek(p.date));
  const thrown = d.thrown.filter((t) => inWeek(t.date));
  const cookIdx = plan.meals.map((m, i) => ({ m, i })).filter(({ m }) => m.source === 'cook');
  const cooked = cookIdx.filter(({ i }) => plan.cooked.includes(i));
  // New: cooked this week and never before the week started.
  const newDishes = [
    ...new Set(cooked.map(({ m }) => m.recipeId).filter((id) => !d.history.some((h) => h.recipeId === id && h.date < startDate))),
  ];
  const liked = d.ratings
    .filter((r) => r.up && newDishes.includes(r.recipeId))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return {
    startDate,
    endDate,
    budget: d.settings.budget,
    spent: round2(bought.reduce((s, p) => s + p.cost, 0)),
    saved: round2(bought.reduce((s, p) => s + p.saved, 0)),
    bought: bought.length,
    cooked: cooked.length,
    toCook: cookIdx.length,
    thrownCount: thrown.length,
    thrownValue: round2(thrown.reduce((s, t) => s + t.value, 0)),
    thrownNames: [...new Set(thrown.map((t) => INGREDIENTS[t.ingredient]?.name.replace(/\s*\(.*\)$/, '') ?? t.ingredient))],
    newDishes,
    favourite: liked[0]?.recipeId ?? null,
  };
}

/**
 * Before a plan is replaced: keep its recap (once a week has something in
 * it), and forget purchases and thrown food older than twelve weeks.
 */
export function keepRecap(d: AppData): void {
  const plan = d.plan;
  if (!plan) return;
  const r = weekRecap(d, plan);
  if (r.cooked || r.bought || r.thrownCount) {
    d.recaps = [...d.recaps.filter((x) => x.startDate !== r.startDate), r].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(-KEEP_WEEKS);
  }
  const cutoff = addDays(plan.startDate, -7 * KEEP_WEEKS);
  d.purchases = d.purchases.filter((p) => p.date >= cutoff);
  d.thrown = d.thrown.filter((t) => t.date >= cutoff);
}

/** The recap of the week before the current plan, if one was kept. */
export function lastRecap(d: AppData): WeekRecap | null {
  const start = d.plan?.startDate;
  const past = d.recaps.filter((r) => !start || r.startDate < start);
  return past[past.length - 1] ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
