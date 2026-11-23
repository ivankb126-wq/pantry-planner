// A pot of starter soup can feed the whole week: it keeps 3 or 4 days in
// the fridge, so the bowls for the days after that go in the freezer on the
// day it is cooked and come out the evening before.

import type { Meal } from '../planner/types';
import { RECIPE_BY_ID } from './catalog';

export interface SoupFreeze {
  /** Index of the meal that cooks the pot. */
  cook: number;
  cookDay: number;
  /** First and last day eaten from the freezer. */
  fromDay: number;
  toDay: number;
}

/** Days a cooked soup keeps in the fridge (never more than 4). */
export function fridgeDays(recipeId: string): number {
  return Math.max(1, Math.min(RECIPE_BY_ID.get(recipeId)?.keepsDays ?? 3, 4));
}

/** Soup pots in the plan that need part of the pot frozen. */
export function soupFreezer(meals: Meal[]): SoupFreeze[] {
  const out: SoupFreeze[] = [];
  meals.forEach((m, i) => {
    if (m.slot !== 'starter' || m.source !== 'cook') return;
    const keep = fridgeDays(m.recipeId);
    const frozen = meals.filter((x) => x.source === 'leftover' && x.from === i && x.day - m.day >= keep).map((x) => x.day);
    if (frozen.length) out.push({ cook: i, cookDay: m.day, fromDay: Math.min(...frozen), toDay: Math.max(...frozen) });
  });
  return out;
}
