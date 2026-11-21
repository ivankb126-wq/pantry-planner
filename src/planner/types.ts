// Planner types. The planner is pure TypeScript with no browser APIs, so it
// runs the same in the app, in tests and (later) in a web worker.

import type { DealVerdict } from '../lib/deals';
import type { Diet, IngredientInfo, Recipe, RecipeFacts, ServingFacts } from '../lib/nutrition';

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export const SLOT_ORDER: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];

export type PlannerRecipe = Recipe & { facts: RecipeFacts };

/** One product a shop sells for an ingredient (from data/prices/<chain>/<store>.json). */
export interface Offer {
  ingredient: string;
  name: string;
  brand?: string | null;
  size: number; // in the ingredient's unit (g, ml or pieces)
  price: number; // EUR for one package (or per kg/l/piece when loose)
  salePrice: number | null;
  unitPrice: number; // EUR per kg, l or piece
  loose?: boolean; // sold by weight: you pay for what you take
  best30?: number | null;
  anchor?: number | null;
  store: string; // "lidl:104"
}

export interface PantryItem {
  ingredient: string;
  amount: number; // ingredient unit
  expiresOn?: string; // YYYY-MM-DD
}

export interface Rating {
  recipeId: string;
  up: boolean;
  until?: string | null; // thumbs down hides the recipe until this date (null = forever)
}

export interface PlanSettings {
  cookOnceEatTwice: boolean;
  newDishEachWeek: boolean;
  energyTarget: number; // kcal per adult per day
  weekdayMaxMinutes: number;
  /** Prefer one Croatian main (sarma, grah, pašticada...) each weekend, within the budget. */
  weekendClassic?: boolean;
  /** Meal prep Sunday: prefer weeks where early meals share a pot of grains. */
  mealPrep?: boolean;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  cookOnceEatTwice: true,
  newDishEachWeek: true,
  energyTarget: 2200,
  weekdayMaxMinutes: 45,
  weekendClassic: true,
};

export interface PlanInput {
  recipes: PlannerRecipe[];
  ingredients: Record<string, IngredientInfo>;
  offers: Offer[];
  /** Typical prices (data/reference-prices.json), used only for items the chosen stores do not list. */
  referenceOffers?: Offer[];
  adults: number;
  children: number;
  budget: number; // EUR for the whole plan
  days: number;
  startDate: string; // YYYY-MM-DD, the first planned day
  meals: Slot[];
  diet: Diet | 'none';
  dislikes: string[]; // ingredient ids to avoid
  pantry: PantryItem[];
  ratings: Rating[];
  history: string[]; // recipe ids cooked before
  /** Recipe ids eaten in the last two weeks; the planner gives them a rest. */
  recent?: string[];
  settings: PlanSettings;
  seed: number;
  /** Safety stop for the search in ms (the phone must stay under 2 s). */
  timeBudgetMs?: number;
  /** Search steps (default 2500). Same seed and steps give the same plan. */
  iterations?: number;
}

/** One planned meal. "leftover" meals eat food cooked at an earlier meal. */
export interface Meal {
  day: number;
  slot: Slot;
  recipeId: string;
  source: 'cook' | 'leftover';
  from?: number; // index of the cooking meal, for leftovers
  /** "I don't have X": ingredient -> what is used instead ('' = left out). */
  subs?: Record<string, string>;
}

export interface MealView {
  day: number;
  date: string;
  slot: Slot;
  recipeId: string;
  title: string;
  illustration: string;
  minutes: number;
  kcal: number;
  cost: number; // value of the ingredients this meal uses
  leftover: boolean;
  portions: number;
  newDish: boolean;
}

export interface ShoppingLine {
  ingredient: string;
  store: string;
  product: string;
  brand?: string | null; // as in the store's price list (often missing for store brands)
  size: number;
  loose: boolean;
  packs: number; // packages (or 1 for loose)
  amount: number; // bought, ingredient unit
  cost: number;
  onSale: boolean; // on sale and not a fake sale (see lib/deals.ts)
  /** Real deal check: "real", "not" (cheaper in the last 30 days) or "sale" (cannot tell); null when not on sale. */
  deal: DealVerdict | null;
  /** Euros cheaper than its usual price because of a sale (0 when not on sale). */
  saving: number;
  estimated: boolean; // the store does not list it; typical price used
}

export interface Check {
  id: string;
  label: string;
  value: number;
  target: string;
  ok: boolean;
}

export interface PlanResult {
  meals: Meal[];
  views: MealView[];
  shopping: ShoppingLine[];
  fromPantry: { ingredient: string; amount: number }[];
  leftovers: { ingredient: string; amount: number }[]; // "Left at home"
  cost: number;
  budget: number;
  moneyLeft: number;
  perPersonDay: ServingFacts;
  checks: Check[];
  score: number;
  breakdown: Record<string, number>;
  missingPrices: string[]; // ingredients with no price at all (not even a typical price)
  estimatedPrices: string[]; // ingredients priced with a typical price
  warnings: string[];
}
