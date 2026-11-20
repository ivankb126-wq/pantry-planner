// Recipe types and nutrition calculation. Nutrition is never typed by hand:
// it is calculated from data/ingredients.yml. Used by the app and by
// scripts/recipes.ts (npm run add-recipe-check). Keep this file free of
// imports so both can use it.

export type Unit = 'g' | 'ml' | 'piece';
export type RecipeUnit = Unit | 'tbsp' | 'tsp' | 'pinch';
export type Diet = 'vegan' | 'vegetarian' | 'pescatarian' | 'meat';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'dessert' | 'snack';

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fibre', 'salt'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
export type Nutrition = Record<Nutrient, number>;

export interface IngredientInfo {
  id: string;
  name: string;
  category: string;
  storage: 'fridge' | 'shelves' | 'freezer';
  unit: Unit;
  staple: boolean;
  packageType: string;
  packages: number[];
  nutrition: Nutrition;
  diet: Diet;
  tags?: string[];
  pieceG?: number;
  density?: number;
  shelfLifeDays?: number;
  edible?: number; // part you eat, 0..1 (bones, shells, peel)
}

export interface RecipeIngredient {
  id: string;
  quantity: number;
  unit: RecipeUnit;
  optional?: boolean;
  note?: string;
}

export interface RecipeStep {
  text: string;
  tip?: string;
}

export function stepText(s: string | RecipeStep): string {
  return typeof s === 'string' ? s : s.text;
}

export function stepTip(s: string | RecipeStep): string | null {
  return typeof s === 'string' ? null : (s.tip ?? null);
}

/** An amount in a step that grows with the servings: "{700 ml}", "{2 tbsp}", "{8}". */
export const STEP_AMOUNT = /\{(\d+(?:\.\d+)?)(?:\s*(g|ml|tbsp|tsp))?\}/g;

function kitchenAmount(n: number, unit: string | undefined): string {
  const num = (x: number) => x.toLocaleString('en-GB', { maximumFractionDigits: x < 10 ? 1 : 0 });
  if (unit === 'g' || unit === 'ml') {
    const r = n >= 100 ? Math.round(n / 10) * 10 : n >= 20 ? Math.round(n / 5) * 5 : Math.max(1, Math.round(n));
    return r >= 1000 ? `${num(r / 1000)} ${unit === 'g' ? 'kg' : 'l'}` : `${r} ${unit}`;
  }
  if (unit) {
    const q = Math.max(0.25, Math.round(n * 4) / 4);
    const whole = Math.floor(q);
    const frac = q - whole;
    const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
    return `${whole > 0 ? whole : ''}${f || (whole === 0 ? '0' : '')} ${unit}`;
  }
  return String(Math.max(1, Math.round(n)));
}

/** Step text for a number of servings: "{700 ml}" at half the servings reads "350 ml". */
export function scaleStep(text: string, factor = 1): string {
  return text.replace(STEP_AMOUNT, (_, n: string, unit?: string) => kitchenAmount(Number(n) * factor, unit));
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  mealTypes: MealType[];
  cuisine: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  mainProtein: string;
  ingredients: RecipeIngredient[];
  /** A step is plain text, or text with a tip ("Done when the edges are golden"). */
  steps: (string | RecipeStep)[];
  tags: string[];
  keepsDays: number;
  equipment: string[];
  illustration: string;
  photo?: string | null;
}

/** Health facts per serving that the weekly Nutrition check uses. */
export interface ServingFacts extends Nutrition {
  addedSugar: number; // g
  vegPortions: number; // 80 g portions of vegetables or fruit
}

export interface RecipeFacts {
  perServing: ServingFacts;
  diet: Diet;
  totalMinutes: number;
  redMeat: boolean;
  processedMeat: boolean;
  fish: boolean;
  legumeMain: boolean;
}

const TBSP_ML = 15;
const TSP_ML = 5;
const PINCH_G = 0.4;
const PORTION_G = 80;
const DIET_ORDER: Diet[] = ['vegan', 'vegetarian', 'pescatarian', 'meat'];

export class UnitError extends Error {}

/**
 * Convert a recipe quantity into the ingredient's own unit (g, ml or pieces).
 * tbsp/tsp are volumes; for ingredients measured in grams they use the
 * ingredient's density (g per ml, default 1).
 */
export function toIngredientUnit(ing: IngredientInfo, quantity: number, unit: RecipeUnit): number {
  const density = ing.density ?? 1;
  const ml = unit === 'tbsp' ? quantity * TBSP_ML : unit === 'tsp' ? quantity * TSP_ML : unit === 'ml' ? quantity : null;
  switch (ing.unit) {
    case 'g':
      if (unit === 'g') return quantity;
      if (unit === 'pinch') return quantity * PINCH_G;
      if (ml != null) return ml * density;
      if (unit === 'piece' && ing.pieceG) return quantity * ing.pieceG;
      break;
    case 'ml':
      if (ml != null) return ml;
      if (unit === 'g') return quantity / density;
      if (unit === 'pinch') return (quantity * PINCH_G) / density;
      break;
    case 'piece':
      if (unit === 'piece') return quantity;
      if (unit === 'g' && ing.pieceG) return quantity / ing.pieceG;
      break;
  }
  throw new UnitError(`"${unit}" does not work for ${ing.id} (measured in ${ing.unit})`);
}

/** Grams (or ml for liquids) to apply the per-100 nutrition to. */
function nutritionBase(ing: IngredientInfo, amount: number): number {
  const edible = ing.edible ?? 1;
  if (ing.unit === 'piece') return amount * (ing.pieceG ?? 0) * edible;
  return amount * edible;
}

/** Edible weight in grams (for vegetable portions and meat/fish counts). */
function weightGrams(ing: IngredientInfo, amount: number): number {
  const edible = ing.edible ?? 1;
  if (ing.unit === 'piece') return amount * (ing.pieceG ?? 0) * edible;
  if (ing.unit === 'ml') return amount * (ing.density ?? 1) * edible;
  return amount * edible;
}

export function zeroNutrition(): Nutrition {
  return { kcal: 0, protein: 0, carbs: 0, sugar: 0, fat: 0, sat_fat: 0, fibre: 0, salt: 0 };
}

/** Calculate nutrition and health facts for one serving of a recipe. */
export function recipeFacts(recipe: Recipe, ingredients: Record<string, IngredientInfo>): RecipeFacts {
  const total: ServingFacts = { ...zeroNutrition(), addedSugar: 0, vegPortions: 0 };
  let diet: Diet = 'vegan';
  let legumeG = 0;
  let redMeat = false;
  let processedMeat = false;
  let fish = false;
  for (const ri of recipe.ingredients) {
    const ing = ingredients[ri.id];
    if (!ing) throw new Error(`unknown ingredient "${ri.id}"`);
    const amount = toIngredientUnit(ing, ri.quantity, ri.unit);
    // Optional ingredients count neither for nutrition nor for diet: the app
    // leaves them out for a vegetarian plan ("bacon, optional").
    if (DIET_ORDER.indexOf(ing.diet) > DIET_ORDER.indexOf(diet) && !ri.optional) diet = ing.diet;
    if (ri.optional) continue;
    const base = nutritionBase(ing, amount) / 100;
    for (const n of NUTRIENTS) total[n] += (ing.nutrition[n] ?? 0) * base;
    const tags = ing.tags ?? [];
    if (tags.includes('added-sugar')) total.addedSugar += (ing.nutrition.sugar ?? 0) * base;
    const grams = weightGrams(ing, amount);
    if (tags.includes('veg') || tags.includes('fruit')) total.vegPortions += grams / PORTION_G;
    if (tags.includes('dried-fruit')) total.vegPortions += grams / 30; // 30 g dried fruit is one portion
    if (tags.includes('legume')) legumeG += grams;
    if (tags.includes('red-meat') && grams >= 50) redMeat = true;
    if (tags.includes('processed-meat') && grams >= 30) processedMeat = true;
    if (tags.includes('fish') && grams >= 60) fish = true;
  }
  const s = recipe.servings;
  const perServing = Object.fromEntries(
    Object.entries(total).map(([k, v]) => [k, round(v / s, k === 'kcal' ? 0 : 1)]),
  ) as unknown as ServingFacts;
  // Beans and lentils count as at most one portion a day (UK "5 a day" rule).
  perServing.vegPortions = round(perServing.vegPortions + Math.min(1, legumeG / s / PORTION_G), 1);
  return {
    perServing,
    diet,
    totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
    redMeat,
    processedMeat,
    fish,
    legumeMain: legumeG / s >= 60 && !redMeat && !processedMeat,
  };
}

export function dietAllows(chosen: Diet | 'none', recipeDiet: Diet): boolean {
  if (chosen === 'none') return true;
  return DIET_ORDER.indexOf(recipeDiet) <= DIET_ORDER.indexOf(chosen);
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Which of the spec's collections a recipe belongs to (for counting and browsing). */
export function collectionOf(recipe: Recipe): 'quick' | 'batch-snack' | 'dessert' | 'breakfast' | 'main' {
  if (recipe.mealTypes.includes('snack') && recipe.tags.includes('batch')) return 'batch-snack';
  if (recipe.mealTypes.includes('dessert')) return 'dessert';
  if (recipe.mealTypes.includes('breakfast') && !recipe.mealTypes.some((m) => m === 'lunch' || m === 'dinner'))
    return 'breakfast';
  if (recipe.tags.includes('quick')) return 'quick';
  return 'main';
}
