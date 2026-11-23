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
  const key = JSON.stringify([plan.meals, plan.startDate, d.settings.adults, d.settings.children, d.settings.mealPrepBig]);
  if (memo?.key === key) return memo.plan;
  // Cooked meals stay in: the prep stays the same all week.
  const result = mealPrep({
    meals: plan.meals,
    startDate: plan.startDate,
    days: 7,
    recipe: (id) => RECIPE_BY_ID.get(id),
    ingredients: INGREDIENTS,
    portions: (i) => mealPortions(plan, i, d.settings),
    big: d.settings.mealPrepBig,
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
  const fromFreezer = tasks.some((t) => t.frozen?.includes(mealIndex));
  const thaw = fromFreezer ? ' It is in the freezer: move it to the fridge the evening before.' : '';
  const note = prepNoteText(tasks);
  return note ? note + thaw : null;
}

function prepNoteText(tasks: PrepPlan['tasks']): string | null {
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

/** "Tonight: move Thursday's rice from the freezer to the fridge." for the evening before. */
export function prepThawNotes(d: AppData, day: number): string[] {
  const p = prepFor(d);
  const plan = d.plan;
  if (!p || !plan) return [];
  const out: string[] = [];
  for (const t of p.tasks)
    for (const i of t.frozen ?? []) {
      if (plan.meals[i]?.day !== day + 1) continue;
      const what = t.kind === 'grain' ? `the ${t.id.slice('grain:'.length).replace('potato', 'potatoes')}` : t.id.startsWith('sauce') ? 'the sauce' : 'the dish';
      out.push(`Tonight: move ${what} for tomorrow's ${plan.meals[i].slot} from the freezer to the fridge.`);
    }
  return [...new Set(out)];
}

/** Where the ticks on the prep timeline are kept, per plan. */
export function prepTicksKey(d: AppData): string {
  return `prep-done:${d.plan?.createdAt ?? ''}`;
}
