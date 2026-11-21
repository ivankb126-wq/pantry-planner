// Croatian seasonal produce: the months (1 = January) when each fruit or
// vegetable is at its best from Croatian fields, gardens and markets
// (continental and Dalmatian together), so it is cheaper and tastes better.
// Food that is the same all year (onions, potatoes, bananas, lemons,
// mushrooms...) is left out: it is never "in season" and never penalised.

import { type IngredientInfo, type Recipe, toIngredientUnit } from './nutrition';

const SUMMER = [6, 7, 8, 9];
const AUTUMN_WINTER = [10, 11, 12, 1, 2, 3];

export const SEASON: Record<string, number[]> = {
  // Vegetables
  tomato: [6, 7, 8, 9, 10],
  cucumber: SUMMER,
  'bell-pepper': [7, 8, 9, 10],
  'chili-pepper': [7, 8, 9, 10],
  zucchini: SUMMER,
  eggplant: [7, 8, 9, 10],
  'green-beans': [6, 7, 8, 9],
  peas: [5, 6],
  broccoli: [6, 7, 8, 9, 10, 11],
  cauliflower: [9, 10, 11, 12],
  cabbage: [9, ...AUTUMN_WINTER],
  sauerkraut: AUTUMN_WINTER,
  kale: AUTUMN_WINTER,
  'brussels-sprouts': [10, 11, 12, 1, 2],
  leek: [9, ...AUTUMN_WINTER],
  pumpkin: [9, 10, 11, 12],
  'sweet-potato': [10, 11, 12],
  celeriac: [9, 10, 11, 12, 1, 2],
  parsnip: AUTUMN_WINTER,
  beetroot: [7, 8, 9, 10, 11],
  fennel: [11, 12, 1, 2, 3, 4],
  spinach: [3, 4, 5, 9, 10, 11],
  'swiss-chard': [3, 4, 5, 6, 9, 10, 11],
  lettuce: [4, 5, 6, 9, 10],
  radish: [3, 4, 5, 6, 9, 10],
  kohlrabi: [5, 6, 7, 9, 10],
  'spring-onion': [3, 4, 5, 6],
  asparagus: [3, 4, 5],
  // Fruit
  strawberries: [5, 6],
  cherries: [5, 6],
  'sour-cherries': [6, 7],
  apricots: [6, 7],
  peaches: [6, 7, 8],
  blueberries: [7, 8],
  watermelon: [7, 8],
  plums: [7, 8, 9],
  figs: [8, 9],
  grapes: [8, 9, 10],
  pear: [8, 9, 10, 11],
  apple: [8, 9, 10, 11, 12],
  pomegranate: [10, 11, 12],
  mandarin: [10, 11, 12, 1],
  orange: [12, 1, 2, 3],
  chestnuts: [10, 11, 12],
};

/** Produce in season in a month (1 to 12). */
export function inSeasonIn(month: number): string[] {
  return Object.keys(SEASON).filter((id) => SEASON[id].includes(month));
}

/** Month (1 to 12) of a YYYY-MM-DD date. */
export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** At least this much of one seasonal food per serving makes a dish "in season". */
const MIN_GRAMS = 60;
const cache = new Map<string, string[]>();

/** The in-season ingredients a dish uses in a good amount (ids), for a month. */
export function seasonalIngredients(recipe: Pick<Recipe, 'id' | 'ingredients' | 'servings'>, ingredients: Record<string, IngredientInfo>, month: number): string[] {
  const key = `${recipe.id}:${month}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: string[] = [];
  for (const ri of recipe.ingredients) {
    if (ri.optional || !SEASON[ri.id]?.includes(month)) continue;
    const ing = ingredients[ri.id];
    if (!ing) continue;
    let amount: number;
    try {
      amount = toIngredientUnit(ing, ri.quantity, ri.unit) / recipe.servings;
    } catch {
      continue;
    }
    const grams = ing.unit === 'piece' ? amount * (ing.pieceG ?? 100) : amount;
    if (grams >= MIN_GRAMS && !out.includes(ri.id)) out.push(ri.id);
  }
  cache.set(key, out);
  return out;
}
