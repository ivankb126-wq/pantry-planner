// The living pantry (SPEC 6b): cooking takes food out, shopping puts it in,
// fresh food has a use-by date, and staples that run low are suggested for
// the next shopping list. Pure functions, so they are easy to test.

import { daysBetween, formatAmount } from '../lib/format';
import { toIngredientUnit } from '../lib/nutrition';
import type { PlannerRecipe } from '../planner/types';
import { INGREDIENTS, ingName } from './catalog';
import { addToPantry, portionsFor } from './planning';
import type { AppData, Amount, PantryEntry, SavedPlan, Settings } from './state';

/** Below this an item counts as used up and leaves the shelf. */
function crumbs(ingredient: string): number {
  return INGREDIENTS[ingredient]?.unit === 'piece' ? 0.1 : 2;
}

/** What one cooking of a recipe uses, in each ingredient's own unit. */
export function cookNeeds(r: PlannerRecipe, portions: number): Amount[] {
  const out: Amount[] = [];
  for (const ri of r.ingredients) {
    if (ri.optional) continue;
    const ing = INGREDIENTS[ri.id];
    if (!ing) continue;
    try {
      const amount = (toIngredientUnit(ing, ri.quantity, ri.unit) * portions) / r.servings;
      if (amount > 0) out.push({ ingredient: ri.id, amount });
    } catch {
      // a unit that does not fit is caught by the recipe check
    }
  }
  return out;
}

/** Portions a planned meal is cooked for: its eaters plus later leftover meals. */
export function mealPortions(plan: SavedPlan, index: number, s: Settings): number {
  const extra = plan.meals.filter((m) => m.source === 'leftover' && m.from === index).length;
  return portionsFor(s) * (1 + extra);
}

/**
 * Take amounts out of the pantry, soonest use-by date first. Only what is
 * there can be taken. Items that reach zero leave the shelf.
 */
export function takeFromPantry(pantry: PantryEntry[], needs: Amount[]): { pantry: PantryEntry[]; taken: Amount[]; emptied: string[] } {
  const out = pantry.map((p) => ({ ...p }));
  const taken: Amount[] = [];
  const emptied: string[] = [];
  for (const need of needs) {
    let left = need.amount;
    let got = 0;
    const entries = out
      .filter((p) => p.ingredient === need.ingredient && p.amount > 0)
      .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
    for (const e of entries) {
      if (left <= 0) break;
      const t = Math.min(e.amount, left);
      e.amount -= t;
      left -= t;
      got += t;
    }
    if (got > 0) taken.push({ ingredient: need.ingredient, amount: got });
    const before = out.length;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].ingredient === need.ingredient && out[i].amount < crumbs(need.ingredient)) out.splice(i, 1);
    }
    if (got > 0 && out.length < before && !out.some((p) => p.ingredient === need.ingredient)) emptied.push(need.ingredient);
  }
  return { pantry: out, taken, emptied };
}

/** Put food into the pantry (shopping, leftovers, undo) and clear "ran out" notes. */
export function stock(d: AppData, items: Amount[]): void {
  d.pantry = addToPantry(d.pantry, items);
  const ids = new Set(items.filter((i) => i.amount > 0).map((i) => i.ingredient));
  d.ranOut = d.ranOut.filter((id) => !ids.has(id));
  d.extras = d.extras.filter((id) => !ids.has(id));
  for (const id of ids) delete d.lowDismissed[id];
}

/** Take food out for a cooking and remember staples that ran out. */
export function useFood(d: AppData, needs: Amount[]): Amount[] {
  const res = takeFromPantry(d.pantry, needs);
  d.pantry = res.pantry;
  for (const id of res.emptied) if (INGREDIENTS[id]?.staple && !d.ranOut.includes(id)) d.ranOut.push(id);
  return res.taken;
}

/** "300 g chicken breast, 150 g quinoa and 2 eggs" */
export function takenText(taken: Amount[], max = 6): string {
  const parts = taken.map((t) => {
    const unit = INGREDIENTS[t.ingredient]?.unit ?? 'g';
    const n = unit === 'piece' ? Math.round(t.amount * 2) / 2 : t.amount >= 100 ? Math.round(t.amount / 10) * 10 : Math.round(t.amount);
    const name = ingName(t.ingredient).toLowerCase();
    return unit === 'piece' ? `${n.toLocaleString('en-GB')} ${name}` : `${formatAmount(n, unit)} ${name}`;
  });
  const shown = parts.slice(0, max);
  if (parts.length > max) shown.push(`${parts.length - max} more`);
  if (shown.length < 2) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

// ---------------------------------------------------------------- use soon, running low

export function daysLeft(e: PantryEntry, today: string): number | null {
  return e.expiresOn ? daysBetween(today, e.expiresOn) : null;
}

export function isExpiring(e: PantryEntry, today: string): boolean {
  const d = daysLeft(e, today);
  return d != null && d <= 2;
}

/** Amount under which a staple is running low. */
export function lowThreshold(ingredient: string, full: number): number {
  const ing = INGREDIENTS[ingredient];
  if (!ing) return 0;
  const small = ing.unit === 'piece' ? 2 : ing.category === 'spices' ? 15 : 100;
  return Math.min(Math.max(0.2 * full, small), 0.5 * full);
}

export function isLow(e: PantryEntry): boolean {
  if (!INGREDIENTS[e.ingredient]?.staple) return e.full > 0 && e.amount / e.full < 0.15;
  return e.amount <= lowThreshold(e.ingredient, e.full);
}

/** Staples to suggest for the next shopping list. */
export function lowStaples(d: AppData, today: string): string[] {
  const out = new Set<string>();
  const total = new Map<string, { amount: number; full: number }>();
  for (const p of d.pantry) {
    if (!INGREDIENTS[p.ingredient]?.staple) continue;
    const t = total.get(p.ingredient) ?? { amount: 0, full: 0 };
    total.set(p.ingredient, { amount: t.amount + p.amount, full: Math.max(t.full, p.full) });
  }
  for (const [id, t] of total) if (t.amount <= lowThreshold(id, t.full)) out.add(id);
  for (const id of d.ranOut) if (!total.has(id)) out.add(id);
  return [...out].filter((id) => {
    const dismissed = d.lowDismissed[id];
    return !d.extras.includes(id) && !(dismissed && daysBetween(dismissed, today) < 7);
  });
}

export function needsCheck(d: AppData, today: string): boolean {
  if (d.pantry.length < 3) return false;
  return !d.pantryCheckedOn || daysBetween(d.pantryCheckedOn, today) >= 7;
}
