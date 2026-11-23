import { describe, expect, it } from 'vitest';
import type { Meal } from '../planner/types';
import { mealPortions } from './pantry';
import { soupFreezer } from './soup';
import { type SavedPlan, emptyData } from './state';

// A pot of vegetable soup (keeps 4 days, freezes well) cooked Monday and eaten all week.
const week: Meal[] = [
  { day: 0, slot: 'starter', with: 'lunch', recipeId: 'povrtna-juha', source: 'cook' },
  { day: 0, slot: 'lunch', recipeId: 'cevapi-lepinja-ajvar', source: 'cook' },
  ...[1, 2, 3, 4, 5, 6].map((day): Meal => ({ day, slot: 'starter', with: 'lunch', recipeId: 'povrtna-juha', source: 'leftover', from: 0 })),
];

describe('a pot of soup for the week', () => {
  it('freezes the bowls for the days after it stops keeping in the fridge', () => {
    expect(soupFreezer(week)).toEqual([{ cook: 0, cookDay: 0, fromDay: 4, toDay: 6 }]);
    expect(soupFreezer(week.filter((m) => m.day < 4))).toEqual([]);
  });

  it('cooks one bowl a person for each day, and a full main after soup', () => {
    const plan = { meals: week } as SavedPlan;
    const s = { ...emptyData().settings, adults: 2, children: 0 };
    expect(mealPortions(plan, 0, s)).toBe(14);
    expect(mealPortions(plan, 1, s)).toBeGreaterThanOrEqual(2);
  });
});
