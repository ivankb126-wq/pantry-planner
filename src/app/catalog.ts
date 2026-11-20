// Recipes and ingredients bundled with the app (built by `npm run content`).

import content from '../generated/content.json';
import type { IngredientInfo } from '../lib/nutrition';
import type { PlannerRecipe } from '../planner/types';

export const INGREDIENTS = content.ingredients as unknown as Record<string, IngredientInfo>;
export const RECIPES = content.recipes as unknown as PlannerRecipe[];
export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function ingName(id: string): string {
  return INGREDIENTS[id]?.name ?? id;
}

/** Ingredients sorted by name, for search lists. */
export const INGREDIENT_LIST = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name));

export const CUISINE_LABEL: Record<string, string> = {
  'croatian-dalmatian': 'Dalmatian',
  'croatian-slavonian': 'Slavonian',
  'croatian-istrian': 'Istrian',
  'croatian-continental': 'Croatian',
  mediterranean: 'Mediterranean',
  italian: 'Italian',
  greek: 'Greek',
  chinese: 'Chinese',
  thai: 'Thai',
  japanese: 'Japanese',
  korean: 'Korean',
  indian: 'Indian',
  mexican: 'Mexican',
  'middle-eastern': 'Middle Eastern',
  everyday: 'Everyday',
};

/** Kinds of dish, in the order they are shown. */
export const FAMILY_LABEL: Record<string, string> = {
  pasta: 'Pasta',
  rice: 'Rice and grains',
  noodles: 'Noodles',
  soup: 'Soups',
  stew: 'Stews and varivo',
  curry: 'Curries',
  oven: 'Oven bakes',
  'pan-grill': 'Pan and grill',
  salad: 'Salads and bowls',
  bread: 'Bread, wraps and toast',
  eggs: 'Eggs',
  pie: 'Savoury pies',
  porridge: 'Porridge and oats',
  pancakes: 'Pancakes',
  baking: 'Cakes and baking',
  pudding: 'Puddings and creams',
  fruit: 'Fruit desserts',
  snacks: 'Snacks and dips',
};

/**
 * Dishes like this one: the same kind of dish, ranked by how many main
 * ingredients they share (so you can swap to something you have the food for).
 */
export function similarRecipes(recipeId: string, max = 4): PlannerRecipe[] {
  const r = RECIPE_BY_ID.get(recipeId);
  if (!r) return [];
  const mine = new Set(r.ingredients.filter((i) => !INGREDIENTS[i.id]?.staple).map((i) => i.id));
  const meal = (x: PlannerRecipe) => x.mealTypes.some((m) => r.mealTypes.includes(m));
  return RECIPES.filter((x) => x.id !== r.id && x.family === r.family && meal(x))
    .map((x) => ({ x, shared: x.ingredients.filter((i) => mine.has(i.id)).length }))
    .sort((a, b) => b.shared - a.shared || a.x.facts.totalMinutes - b.x.facts.totalMinutes)
    .slice(0, max)
    .map(({ x }) => x);
}

export const AISLE_LABEL: Record<string, string> = {
  'fruit-veg': 'Fruit and veg',
  meat: 'Meat',
  fish: 'Fish',
  dairy: 'Dairy',
  eggs: 'Eggs',
  bakery: 'Bakery',
  grains: 'Rice, pasta and grains',
  legumes: 'Beans and lentils',
  canned: 'Cans and jars',
  sauces: 'Sauces',
  oils: 'Oil and vinegar',
  spices: 'Spices',
  baking: 'Baking',
  nuts: 'Nuts and dried fruit',
  frozen: 'Frozen',
  sweets: 'Sweets and spreads',
  drinks: 'Drinks',
};

/** A typical shop walk: fresh first, frozen last. */
export const AISLE_ORDER = [
  'fruit-veg', 'bakery', 'meat', 'fish', 'dairy', 'eggs', 'grains', 'legumes', 'canned', 'sauces', 'oils',
  'spices', 'baking', 'nuts', 'sweets', 'drinks', 'frozen',
];
