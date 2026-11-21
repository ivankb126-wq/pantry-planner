// Meal prep Sunday for the saved plan (see src/planner/prep.ts).

import { type PrepPlan, mealPrep } from '../planner/prep';
import { INGREDIENTS, RECIPE_BY_ID } from './catalog';
import { mealPortions } from './pantry';
import type { AppData } from './state';

let memo: { key: string; plan: PrepPlan | null } | null = null;

/** The Sunday prep for this week's plan, when meal prep is switched on. */
export function prepFor(d: AppData): PrepPlan | null {
  const plan = d.plan;
  if (!d.settings.mealPrep || !plan) return null;
  const key = JSON.stringify([plan.meals, plan.startDate, d.settings.adults, d.settings.children]);
  if (memo?.key === key) return memo.plan;
  // Cooked meals stay in: the prep stays the same all week.
  const result = mealPrep({
    meals: plan.meals,
    startDate: plan.startDate,
    days: 7,
    recipe: (id) => RECIPE_BY_ID.get(id),
    ingredients: INGREDIENTS,
    portions: (i) => mealPortions(plan, i, d.settings),
  });
  memo = { key, plan: result };
  return result;
}

/** What Sunday's prep has ready for one planned meal, as a sentence. */
export function prepNote(d: AppData, mealIndex: number): string | null {
  const p = prepFor(d);
  if (!p) return null;
  const tasks = p.tasks.filter((t) => t.uses.some((u) => u.meal === mealIndex));
  if (!tasks.length) return null;
  const dish = tasks.find((t) => t.kind === 'dish');
  if (dish) {
    if (dish.ready) return `If you did Sunday's prep, ${dish.ready}.`;
    return dish.id.startsWith('sauce')
      ? "If you did Sunday's prep, the sauce is made: just cook the pasta and warm the sauce."
      : "If you did Sunday's prep, this is made: just warm it up until it is steaming hot.";
  }
  const ready = tasks.map((t) => t.ready).filter((x): x is string => !!x);
  if (!ready.length) return null;
  const list = ready.length === 1 ? ready[0] : `${ready.slice(0, -1).join(', ')} and ${ready[ready.length - 1]}`;
  return `If you did Sunday's prep, ${list}: skip those steps.`;
}

/** Where the ticks on the prep timeline are kept, per plan. */
export function prepTicksKey(d: AppData): string {
  return `prep-done:${d.plan?.createdAt ?? ''}`;
}
