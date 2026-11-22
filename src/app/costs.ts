// Quick price lookups for browsing (recipe cards, recipe detail).

import { isGoodSale } from '../lib/deals';
import { toIngredientUnit } from '../lib/nutrition';
import { type Purchase, cheapestPurchase, indexOffers } from '../planner/pricing';
import type { Offer, PlannerRecipe } from '../planner/types';
import { INGREDIENTS } from './catalog';
import type { PriceData } from './prices';

export interface PriceIndex {
  best: Map<string, Offer>; // best value offer per ingredient (store or typical)
  sale: Set<string>; // ingredients on sale in my stores
  all?: Map<string, Offer[]>; // every offer per ingredient (typical price when the store has none)
}

const cache = new WeakMap<PriceData, PriceIndex>();

export function priceIndex(prices: PriceData): PriceIndex {
  const hit = cache.get(prices);
  if (hit) return hit;
  const best = new Map<string, Offer>();
  const sale = new Set<string>();
  for (const o of prices.offers) {
    const cur = best.get(o.ingredient);
    if (!cur || o.unitPrice < cur.unitPrice) best.set(o.ingredient, o);
  }
  // "On sale" only when the best value product, the one you would buy, is on
  // a genuine sale. Some product of almost every common ingredient is on sale
  // somewhere, which made the badge appear on nearly every recipe.
  for (const [id, o] of best) if (isGoodSale(o)) sale.add(id);
  for (const o of prices.reference) if (!best.has(o.ingredient)) best.set(o.ingredient, o);
  const all = indexOffers(prices.offers);
  for (const [id, list] of indexOffers(prices.reference)) if (!all.has(id)) all.set(id, list);
  const idx = { best, sale, all };
  cache.set(prices, idx);
  return idx;
}

/** Cheapest whole packages to cover `need` of one ingredient. */
export function buyFor(id: string, need: number, idx: PriceIndex): Purchase | null {
  const ing = INGREDIENTS[id];
  const offers = idx.all?.get(id);
  if (!ing || !offers?.length || !(need > 0)) return null;
  const p = cheapestPurchase(need, offers, ing.unit);
  return p.lines.length ? p : null;
}

/** Value of the food one serving uses (not whole packages). */
export function servingCost(r: PlannerRecipe, idx: PriceIndex): number | null {
  let sum = 0;
  for (const ri of r.ingredients) {
    if (ri.optional) continue;
    const ing = INGREDIENTS[ri.id];
    const o = idx.best.get(ri.id);
    if (!ing) continue;
    if (!o) {
      if (ing.category === 'spices') continue;
      return null;
    }
    let amount: number;
    try {
      amount = toIngredientUnit(ing, ri.quantity, ri.unit) / r.servings;
    } catch {
      continue;
    }
    sum += amount * (ing.unit === 'piece' ? o.unitPrice : o.unitPrice / 1000);
  }
  return sum;
}

/** A main ingredient on sale (at least 60 g a serving), if any. */
export function saleIngredient(r: PlannerRecipe, idx: PriceIndex): string | null {
  for (const ri of r.ingredients) {
    if (ri.optional || !idx.sale.has(ri.id)) continue;
    const ing = INGREDIENTS[ri.id];
    if (!ing || ['spices', 'oils', 'baking', 'sauces'].includes(ing.category)) continue;
    let amount: number;
    try {
      amount = toIngredientUnit(ing, ri.quantity, ri.unit) / r.servings;
    } catch {
      continue;
    }
    const grams = ing.unit === 'piece' ? amount * (ing.pieceG ?? 50) : amount;
    if (grams >= 60) return ing.name;
  }
  return null;
}
