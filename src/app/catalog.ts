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
