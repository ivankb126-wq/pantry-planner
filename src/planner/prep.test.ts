import { describe, expect, it } from 'vitest';
import content from '../generated/content.json';
import type { IngredientInfo } from '../lib/nutrition';
import { mealPrep, prepBonus, sundayIndex } from './prep';
import type { Meal, PlannerRecipe, Slot } from './types';

const INGREDIENTS = content.ingredients as unknown as Record<string, IngredientInfo>;
const RECIPES = content.recipes as unknown as PlannerRecipe[];
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
const recipe = (id: string) => BY_ID.get(id);

const cook = (day: number, slot: Slot, recipeId: string): Meal => ({ day, slot, recipeId, source: 'cook' });
const prep = (meals: Meal[], startDate = '2026-11-22') =>
  mealPrep({ meals, startDate, days: 7, recipe, ingredients: INGREDIENTS, portions: () => 2 });

describe('meal prep Sunday', () => {
  it('picks this week\'s Sunday, or the one just before a plan that starts on Monday', () => {
    expect(sundayIndex('2026-11-22')).toBe(0); // Sunday
    expect(sundayIndex('2026-11-23')).toBe(-1); // Monday
    expect(sundayIndex('2026-11-26')).toBe(3); // Thursday
  });

  it('cooks the rice once for two meals', () => {
    const p = prep([cook(1, 'lunch', 'tomato-egg-stir-fry'), cook(2, 'lunch', 'raznjici-s-rizom')]);
    const rice = p?.tasks.find((t) => t.id === 'grain:rice');
    expect(rice?.uses.map((u) => u.label)).toEqual(['Monday lunch', 'Tuesday lunch']);
    expect(rice?.title).toMatch(/^Cook \d+ g rice$/);
  });

  it('keeps rice to two days, never cooks fish ahead and fits in about an hour', () => {
    const p = prep([
      cook(1, 'lunch', 'tomato-egg-stir-fry'),
      cook(1, 'dinner', 'chana-masala'),
      cook(2, 'lunch', 'oslic-na-bijelo'),
      cook(2, 'dinner', 'turkish-lentil-soup'),
      cook(3, 'dinner', 'chicken-korma'),
    ])!;
    expect(p.date).toBe('2026-11-22');
    expect(p.days).toEqual([1, 2, 3]);
    const dish = p.tasks.find((t) => t.kind === 'dish');
    expect(dish).toBeTruthy();
    expect(dish!.uses[0].recipeId).not.toBe('oslic-na-bijelo');
    const rice = p.tasks.find((t) => t.id === 'grain:rice');
    expect(rice?.uses.some((u) => u.day === 3) ?? false).toBe(false);
    expect(p.minutes).toBeLessThanOrEqual(60);
    expect(p.steps[0].at).toBe(0);
    expect(p.steps.map((s) => s.at)).toEqual([...p.steps.map((s) => s.at)].sort((a, b) => a - b));
    expect(p.steps[p.steps.length - 1].text).toBe('Box it all up');
  });

  it('has nothing to suggest when nothing is shared', () => {
    expect(prep([cook(1, 'dinner', 'oslic-na-bijelo')])).toBeNull();
  });

  it('nudges the planner towards meals that share a pot of rice', () => {
    const shared = [cook(1, 'lunch', 'tomato-egg-stir-fry'), cook(2, 'lunch', 'raznjici-s-rizom')];
    const apart = [cook(1, 'lunch', 'tomato-egg-stir-fry'), cook(5, 'lunch', 'raznjici-s-rizom')];
    expect(prepBonus(shared, '2026-11-22', 7, recipe)).toBeGreaterThan(prepBonus(apart, '2026-11-22', 7, recipe));
  });
});
