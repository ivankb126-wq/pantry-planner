// The planner: candidates per meal, a greedy first plan, then local search
// (replace, swap days, leftovers on/off) on the score from evaluate.ts.
// Deterministic for a given seed, so "Regenerate" = same input, new seed.

import { dietAllows } from '../lib/nutrition';
import { type Context, buildContext, evaluate } from './evaluate';
import { type Meal, type PlanInput, type PlanResult, SLOT_ORDER, type Slot } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// Days one batch may cover (the cooking day included), and never longer
// than the recipe keeps. Snacks and desserts (brownies, granola bars) can
// last the week; a make-ahead breakfast at most 4 days, for variety.
const MAX_BATCH_DAYS: Record<Slot, number> = { snack: 7, dessert: 7, breakfast: 4, lunch: 2, dinner: 1 };

interface Pools {
  /** Recipe ids that may be cooked for a slot on a given day. */
  get(slot: Slot, day: number): string[];
  /** The cheapest third of those (by ingredient cost per portion). */
  cheap(slot: Slot, day: number): string[];
}

/** Ingredient cost of one portion at the best unit price (ignores package sizes). */
function portionCost(ctx: Context, recipeId: string): number {
  let c = 0;
  for (const { id, amount } of ctx.perPortion.get(recipeId) ?? []) {
    const o = ctx.offers.get(id)?.[0];
    if (!o) continue;
    const per = ctx.input.ingredients[id].unit === 'piece' ? 1 : 1000;
    c += (amount / per) * o.unitPrice;
  }
  return c;
}

export function buildPools(ctx: Context): Pools {
  const { input } = ctx;
  const dislikes = new Set(input.dislikes);
  const ok = input.recipes.filter((r) => {
    if (ctx.hidden.has(r.id)) return false;
    if (!dietAllows(input.diet, r.facts.diet)) return false;
    for (const ri of r.ingredients) {
      if (ri.optional) continue;
      if (dislikes.has(ri.id)) return false;
      const ing = input.ingredients[ri.id];
      const priced = ctx.offers.has(ri.id) || (ctx.pantry.get(ri.id) ?? 0) > 0;
      // Tiny amounts of spices may be missing from a store; everything else must have a price.
      if (!priced && ing?.category !== 'spices') return false;
    }
    return true;
  });
  const cache = new Map<string, string[]>();
  const cheapCache = new Map<string, string[]>();
  const costs = new Map(ok.map((r) => [r.id, portionCost(ctx, r.id)]));
  return {
    cheap(slot, day) {
      const key = `${slot}:${ctx.weekday[day]}`;
      let list = cheapCache.get(key);
      if (!list) {
        const all = this.get(slot, day).slice().sort((a, b) => costs.get(a)! - costs.get(b)!);
        list = all.slice(0, Math.max(3, Math.ceil(all.length / 3)));
        cheapCache.set(key, list);
      }
      return list;
    },
    get(slot, day) {
      const weekday = ctx.weekday[day];
      const key = `${slot}:${weekday}`;
      let list = cache.get(key);
      if (!list) {
        const max = input.settings.weekdayMaxMinutes;
        list = ok
          .filter((r) => {
            const fits =
              slot === 'lunch' || slot === 'dinner'
                ? r.mealTypes.includes('lunch') || r.mealTypes.includes('dinner')
                : r.mealTypes.includes(slot);
            if (!fits) return false;
            // Snacks: batch snacks only. Lunch/dinner: not desserts or snacks.
            if (slot === 'snack' && !r.tags.includes('batch')) return false;
            if (!weekday) return true;
            if (slot === 'breakfast') return r.facts.totalMinutes <= Math.min(max, 25);
            if (slot === 'lunch' || slot === 'dinner') return r.facts.totalMinutes <= max;
            return true;
          })
          .map((r) => r.id);
        cache.set(key, list);
      }
      return list;
    },
  };
}

function canCookOnce(ctx: Context, recipeId: string): boolean {
  const r = ctx.recipes.get(recipeId)!;
  return r.tags.includes('cook-once-eat-twice') || r.keepsDays >= 2;
}

/** A pot meant to be eaten over days: sarma, grah, goulash (serves 6 or more and keeps 3 days). */
function isBigPot(ctx: Context, recipeId: string): boolean {
  const r = ctx.recipes.get(recipeId)!;
  return r.keepsDays >= 3 && r.servings >= 6;
}

/** Can meal i eat leftovers from meal j? */
function leftoverAllowed(ctx: Context, meals: Meal[], i: number, j: number): boolean {
  const a = meals[i];
  const b = meals[j];
  if (!b || b.source !== 'cook' || b.day >= a.day) return false;
  const r = ctx.recipes.get(b.recipeId)!;
  if (a.slot === 'lunch') {
    // A big pot (a stew that keeps 3 days or more) feeds the next two lunches;
    // anything else that keeps feeds tomorrow's lunch.
    const bigPot = isBigPot(ctx, b.recipeId);
    const others = meals.filter((m, k) => k !== i && m.source === 'leftover' && m.from === j).length;
    return (
      ctx.input.settings.cookOnceEatTwice &&
      b.slot === 'dinner' &&
      (b.day === a.day - 1 || (bigPot && b.day === a.day - 2)) &&
      canCookOnce(ctx, b.recipeId) &&
      others < (bigPot ? 2 : 1)
    );
  }
  if (a.slot === b.slot && (a.slot === 'snack' || a.slot === 'dessert' || a.slot === 'breakfast')) {
    const span = a.day - b.day;
    const batchy = a.slot !== 'breakfast' || r.tags.includes('batch') || r.tags.includes('make-ahead');
    return batchy && span <= Math.min(r.keepsDays, MAX_BATCH_DAYS[a.slot] - 1);
  }
  return false;
}

/** Make leftovers consistent after a change: same recipe as their source, still allowed. */
function repair(ctx: Context, meals: Meal[]): Meal[] {
  return meals.map((m, i) => {
    if (m.source !== 'leftover') return m;
    const src = m.from != null ? meals[m.from] : undefined;
    if (src && src.source === 'cook' && leftoverAllowed(ctx, meals, i, m.from!)) return { ...m, recipeId: src.recipeId };
    return { day: m.day, slot: m.slot, recipeId: m.recipeId, source: 'cook' };
  });
}

function slotsFor(input: PlanInput): { day: number; slot: Slot }[] {
  const out: { day: number; slot: Slot }[] = [];
  for (let day = 0; day < input.days; day++) {
    for (const slot of SLOT_ORDER) if (input.meals.includes(slot)) out.push({ day, slot });
  }
  return out;
}

function isMain(slot: Slot): boolean {
  return slot === 'lunch' || slot === 'dinner';
}

/** Is this recipe already cooked as a lunch or dinner somewhere else in the plan? */
function cookedAsMain(meals: (Meal | null)[], recipeId: string, except: number): boolean {
  return meals.some((m, k) => k !== except && m != null && m.source === 'cook' && isMain(m.slot) && m.recipeId === recipeId);
}

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)];
}

/** Plan a week. */
export function generatePlan(input: PlanInput): PlanResult {
  const started = now();
  const budgetMs = input.timeBudgetMs ?? 1500;
  const ctx = buildContext(input);
  const pools = buildPools(ctx);
  const rnd = mulberry32(input.seed);
  const warnings: string[] = [];

  const slots = slotsFor(input).filter(({ slot, day }) => {
    if (pools.get(slot, day).length) return true;
    warnings.push(`No ${slot} recipe fits your settings and store, so ${slot} is left out.`);
    return false;
  });
  const uniq = [...new Set(warnings)];
  if (!slots.length) {
    const empty = evaluate(ctx, []);
    return { ...empty, warnings: [...uniq, 'Nothing could be planned. Check the store and diet settings.'] };
  }

  // ---------------------------------------------------------------- greedy first plan
  // Fill lunch/dinner first (they matter most), then the rest, in day order.
  const order = slots
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => Number(a.slot !== 'lunch' && a.slot !== 'dinner') - Number(b.slot !== 'lunch' && b.slot !== 'dinner') || a.i - b.i);
  const filled: (Meal | null)[] = slots.map(() => null);
  for (const { day, slot, i } of order) {
    const pool = pools.get(slot, day);
    const unused = isMain(slot) ? pool.filter((id) => !cookedAsMain(filled, id, i)) : pool;
    const fresh = unused.length ? unused : pool;
    const options: Meal[] = [];
    for (let k = 0; k < Math.min(12, fresh.length); k++) options.push({ day, slot, recipeId: pick(fresh, rnd), source: 'cook' });
    // Leftover options: yesterday's dinner for lunch, or an earlier batch.
    filled.forEach((m, j) => {
      if (!m) return;
      const tmp = filled.map((x, idx) => x ?? { day: slots[idx].day, slot: slots[idx].slot, recipeId: '', source: 'cook' as const });
      tmp[i] = { day, slot, recipeId: m.recipeId, source: 'leftover', from: j };
      if (m.source === 'cook' && leftoverAllowed(ctx, tmp, i, j)) options.push({ day, slot, recipeId: m.recipeId, source: 'leftover', from: j });
    });
    let best: Meal | null = null;
    let bestScore = Infinity;
    const share = (filled.filter(Boolean).length + 1) / filled.length;
    for (const opt of options) {
      filled[i] = opt;
      const partial = evaluate(ctx, compact(filled).meals);
      // Keep spending on track: the part of the budget for the meals planned so far.
      const overPace = Math.max(0, partial.cost - input.budget * share);
      const s = partial.score + overPace * 3 + rnd() * 0.5;
      if (s < bestScore) {
        bestScore = s;
        best = opt;
      }
    }
    filled[i] = best;
  }
  const meals = filled as Meal[];

  // ---------------------------------------------------------------- local search
  let current = evaluate(ctx, meals);
  let best = current;
  let iter = 0;
  // A fixed number of steps keeps results identical on fast and slow phones;
  // the time budget is only a safety stop.
  const maxIter = input.iterations ?? 2500;
  while (iter < maxIter && now() - started < budgetMs) {
    iter++;
    const temp = 2 * (1 - iter / maxIter) + 0.05;
    const next = mutate(ctx, pools, current.meals, rnd, current.cost > input.budget);
    if (!next) continue;
    const res = evaluate(ctx, next);
    const delta = res.score - current.score;
    if (delta < 0 || rnd() < Math.exp(-delta / temp)) {
      current = res;
      if (res.score < best.score) best = res;
    }
  }
  return { ...best, warnings: [...uniq, ...best.warnings] };
}

/** Drop empty slots and remap leftover links (used for partial plans while building). */
function compact(filled: (Meal | null)[]): { meals: Meal[] } {
  const map = new Map<number, number>();
  const meals: Meal[] = [];
  filled.forEach((m, i) => {
    if (!m) return;
    map.set(i, meals.length);
    meals.push(m);
  });
  return {
    meals: meals.map((m) => (m.source === 'leftover' ? { ...m, from: map.get(m.from!) } : m)),
  };
}

function mutate(ctx: Context, pools: Pools, meals: Meal[], rnd: () => number, overBudget = false): Meal[] | null {
  const next = meals.slice();
  const i = Math.floor(rnd() * next.length);
  const m = next[i];
  const move = rnd();
  if (move < 0.6) {
    // Replace with another recipe (a cheap one half the time when over budget)
    const pool = overBudget && rnd() < 0.5 ? pools.cheap(m.slot, m.day) : pools.get(m.slot, m.day);
    const id = pick(pool, rnd);
    if (id === m.recipeId && m.source === 'cook') return null;
    if (isMain(m.slot) && cookedAsMain(next, id, i)) return null; // no main dish twice a week
    next[i] = { day: m.day, slot: m.slot, recipeId: id, source: 'cook' };
  } else if (move < 0.85) {
    // Turn leftovers on or off
    if (m.source === 'leftover') {
      const id = pick(pools.get(m.slot, m.day), rnd);
      if (isMain(m.slot) && cookedAsMain(next, id, i)) return null;
      next[i] = { day: m.day, slot: m.slot, recipeId: id, source: 'cook' };
    } else {
      const sources = next.map((_, j) => j).filter((j) => {
        const tmp = next.slice();
        tmp[i] = { ...m, source: 'leftover', from: j, recipeId: next[j].recipeId };
        return leftoverAllowed(ctx, tmp, i, j);
      });
      if (!sources.length) return null;
      const j = pick(sources, rnd);
      // Nothing may depend on meal i any more once it eats leftovers.
      if (next.some((x) => x.source === 'leftover' && x.from === i)) return null;
      next[i] = { day: m.day, slot: m.slot, recipeId: next[j].recipeId, source: 'leftover', from: j };
    }
  } else {
    // Swap two cooked meals of the same slot on different days
    const others = next.map((_, j) => j).filter((j) => j !== i && next[j].slot === m.slot && next[j].source === 'cook');
    if (!others.length || m.source !== 'cook') return null;
    const j = pick(others, rnd);
    const a = next[i];
    const b = next[j];
    if (!pools.get(a.slot, b.day).includes(a.recipeId) || !pools.get(b.slot, a.day).includes(b.recipeId)) return null;
    next[i] = { ...a, recipeId: b.recipeId };
    next[j] = { ...b, recipeId: a.recipeId };
  }
  return repair(ctx, next);
}

/** Re-score a plan after changes made outside the planner. */
export function scorePlan(input: PlanInput, meals: Meal[]): PlanResult {
  const ctx = buildContext(input);
  return evaluate(ctx, repair(ctx, meals));
}

/**
 * Swap one meal for another recipe, keeping the rest of the plan.
 * Without recipeId the best alternative is chosen; pass the recipes already
 * swapped out in `avoid` to get a different suggestion each time.
 */
export function swapMeal(
  input: PlanInput,
  meals: Meal[],
  index: number,
  opts: { recipeId?: string; avoid?: string[]; seed?: number } = {},
): PlanResult {
  const ctx = buildContext(input);
  const pools = buildPools(ctx);
  const target = meals[index];
  const avoid = new Set([...(opts.avoid ?? []), target.recipeId]);
  const cookedMains = new Set(
    meals.filter((m, k) => k !== index && m.source === 'cook' && (m.slot === 'lunch' || m.slot === 'dinner')).map((m) => m.recipeId),
  );
  const isMain = target.slot === 'lunch' || target.slot === 'dinner';
  const options = opts.recipeId
    ? [opts.recipeId]
    : pools.get(target.slot, target.day).filter((id) => !avoid.has(id) && !(isMain && cookedMains.has(id)));
  const rnd = mulberry32(opts.seed ?? input.seed);
  const scored: { res: PlanResult; s: number }[] = [];
  for (const id of options) {
    const next = meals.map((m) => ({ ...m }));
    next[index] = { day: target.day, slot: target.slot, recipeId: id, source: 'cook' };
    // Meals that ate this meal's leftovers keep the old dish if the new one cannot feed them.
    const fixed = next.map((m, k) =>
      m.source === 'leftover' && m.from === index && !leftoverAllowed(ctx, next, k, index)
        ? { day: m.day, slot: m.slot, recipeId: meals[k].recipeId, source: 'cook' as const }
        : m.source === 'leftover' && m.from === index
          ? { ...m, recipeId: id }
          : m,
    );
    const res = evaluate(ctx, repair(ctx, fixed));
    scored.push({ res, s: res.score });
  }
  if (!scored.length) return evaluate(ctx, meals);
  scored.sort((a, b) => a.s - b.s);
  // A little randomness among the top 3 so repeated swaps feel fresh.
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(rnd() * top.length)].res;
}
