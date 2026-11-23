// The planner: candidates per meal, a greedy first plan, then local search
// (replace, swap days, leftovers on/off) on the score from evaluate.ts.
// Deterministic for a given seed, so "Regenerate" = same input, new seed.

import { dietAllows } from '../lib/nutrition';
import { SEASON, monthOf } from '../lib/seasons';
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
// than the recipe keeps. A tray of snacks or a cake lasts at most 4 days, so
// the week has two of them rather than the same one every day; a make-ahead
// breakfast at most 4 days too.
const MAX_BATCH_DAYS: Record<Slot, number> = { snack: 4, dessert: 4, breakfast: 4, lunch: 2, dinner: 1, starter: 7, side: 3 };

/** A cooked meal in the same place (day, slot, the meal it goes with) as `m`. */
function cookAt(m: Meal, recipeId: string): Meal {
  return m.with ? { day: m.day, slot: m.slot, with: m.with, recipeId, source: 'cook' } : { day: m.day, slot: m.slot, recipeId, source: 'cook' };
}

const SUMMER_ONLY = new Set(['tomato', 'cucumber', 'zucchini', 'bell-pepper', 'eggplant', 'green-beans']);

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
  // A cold cucumber soup or a tomato salad is for summer: starters and
  // sides made mostly of summer vegetables are left out the rest of the year.
  const month = monthOf(ctx.dates[0] ?? input.startDate);
  const offSeason = (r: (typeof ok)[number]) =>
    r.ingredients.some((ri) => !ri.optional && SUMMER_ONLY.has(ri.id) && !(SEASON[ri.id] ?? []).includes(month));
  const cache = new Map<string, string[]>();
  const cheapCache = new Map<string, string[]>();
  const costs = new Map(ok.map((r) => [r.id, portionCost(ctx, r.id)]));
  return {
    cheap(slot, day) {
      const key = `${slot}:${day}`;
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
      const { soupWith, soupDays, saladWith } = ctx.extras;
      // Soup once a day is enough: no soup main on a day with a soup starter,
      // and no salad main next to a side salad.
      const noSoup = (slot === 'lunch' || slot === 'dinner') && soupDays[day] && soupWith != null;
      const noSalad = (slot === 'lunch' || slot === 'dinner') && saladWith.includes(slot);
      const key = `${slot}:${weekday}:${noSoup}:${noSalad}`;
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
            if ((noSoup && r.family === 'soup') || (noSalad && r.family === 'salad')) return false;
            if ((slot === 'starter' || slot === 'side') && offSeason(r)) return false;
            // Snacks: batch snacks only. Lunch/dinner: not desserts or snacks.
            if (slot === 'snack' && !r.tags.includes('batch')) return false;
            if (!weekday) return true;
            if (slot === 'breakfast') return r.facts.totalMinutes <= Math.min(max, 25);
            if (slot === 'lunch' || slot === 'dinner' || slot === 'starter' || slot === 'side') return r.facts.totalMinutes <= max;
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
  if (!b || b.source !== 'cook') return false;
  const r = ctx.recipes.get(b.recipeId)!;
  if (a.slot === 'side' || a.slot === 'starter') {
    if (b.slot !== a.slot) return false;
    const span = a.day - b.day;
    if (span < 0 || (span === 0 && (a.slot === 'starter' || j > i))) return false;
    // One pot of soup (one bowl of salad) at a time: once a new one is made,
    // the old one is finished.
    if (meals.some((x, k) => k !== j && x.slot === a.slot && x.source === 'cook' && x.recipeId !== '' && (x.day > b.day || (x.day === b.day && k > j)) && (x.day < a.day || (x.day === a.day && k < i)))) return false;
    // A bowl of cabbage salad made at lunch also does for dinner, and for
    // the next days as long as it keeps.
    if (a.slot === 'side') return span === 0 || span <= Math.min(r.keepsDays, MAX_BATCH_DAYS.side) - 1;
    // A pot of soup keeps 3 or 4 days in the fridge; a soup that freezes can
    // feed the whole week if part of it goes in the freezer on the first day.
    return span <= (r.tags.includes('freezer-friendly') ? MAX_BATCH_DAYS.starter - 1 : Math.min(r.keepsDays, 4) - 1);
  }
  if (b.day >= a.day) return false;
  if (a.slot === 'lunch') {
    // No soup for lunch on a day with a bowl of soup to start.
    if (r.family === 'soup' && ctx.extras.soupDays[a.day] && ctx.extras.soupWith != null) return false;
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
    return cookAt(m, m.recipeId);
  });
}

type Place = { day: number; slot: Slot; with?: 'lunch' | 'dinner' };

/** Every meal to plan, in the order of the day: a starter soup before its main, a side salad after it. */
function slotsFor(ctx: Context): Place[] {
  const { input } = ctx;
  const { soupWith, soupDays, saladWith } = ctx.extras;
  const out: Place[] = [];
  for (let day = 0; day < input.days; day++) {
    for (const slot of SLOT_ORDER) {
      if (!input.meals.includes(slot)) continue;
      if (slot === soupWith && soupDays[day]) out.push({ day, slot: 'starter', with: slot });
      out.push({ day, slot });
      if ((slot === 'lunch' || slot === 'dinner') && saladWith.includes(slot)) out.push({ day, slot: 'side', with: slot });
    }
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

/** A recipe for a slot; in a week of favourites, mostly one you liked. */
function pickRecipe(ctx: Context, pool: string[], slot: Slot, rnd: () => number): string {
  if (ctx.input.settings.favourites && isMain(slot) && rnd() < 0.6) {
    const liked = pool.filter((id) => ctx.liked.has(id));
    if (liked.length) return pick(liked, rnd);
  }
  return pick(pool, rnd);
}

/** Plan a week. */
export function generatePlan(input: PlanInput): PlanResult {
  const started = now();
  const budgetMs = input.timeBudgetMs ?? 1500;
  const ctx = buildContext(input);
  const pools = buildPools(ctx);
  const rnd = mulberry32(input.seed);
  const warnings: string[] = [];

  const slots = slotsFor(ctx).filter(({ slot, day }) => {
    if (pools.get(slot, day).length) return true;
    const what = slot === 'starter' ? 'starter soup' : slot === 'side' ? 'side salad' : slot;
    warnings.push(`No ${what} recipe fits your settings and store, so the ${what} is left out on some days.`);
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
  for (const { i, ...place } of order) {
    const { day, slot } = place;
    const pool = pools.get(slot, day);
    const unused = isMain(slot) ? pool.filter((id) => !cookedAsMain(filled, id, i)) : pool;
    const fresh = unused.length ? unused : pool;
    const options: Meal[] = [];
    for (let k = 0; k < Math.min(12, fresh.length); k++) options.push(cookAt(place as Meal, pickRecipe(ctx, fresh, slot, rnd)));
    // Leftover options: yesterday's dinner for lunch, or an earlier batch.
    filled.forEach((m, j) => {
      if (!m) return;
      const tmp = filled.map((x, idx) => x ?? cookAt(slots[idx] as Meal, ''));
      tmp[i] = { ...place, recipeId: m.recipeId, source: 'leftover', from: j };
      if (m.source === 'cook' && leftoverAllowed(ctx, tmp, i, j)) options.push({ ...place, recipeId: m.recipeId, source: 'leftover', from: j });
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
    const id = pickRecipe(ctx, pool, m.slot, rnd);
    if (id === m.recipeId && m.source === 'cook') return null;
    if (isMain(m.slot) && cookedAsMain(next, id, i)) return null; // no main dish twice a week
    next[i] = cookAt(m, id);
  } else if (move < 0.85) {
    // Turn leftovers on or off
    if (m.source === 'leftover') {
      const id = pickRecipe(ctx, pools.get(m.slot, m.day), m.slot, rnd);
      if (isMain(m.slot) && cookedAsMain(next, id, i)) return null;
      next[i] = cookAt(m, id);
    } else {
      const sources = next.map((_, j) => j).filter((j) => {
        const tmp = next.slice();
        tmp[i] = { ...m, source: 'leftover', from: j, recipeId: next[j].recipeId };
        return leftoverAllowed(ctx, tmp, i, j);
      });
      if (!sources.length) return null;
      const j = pick(sources, rnd);
      // Meals that ate from meal i now eat from j too (two pots of the same
      // soup become one), if j's batch can feed them.
      const deps = next.map((x, k) => ({ x, k })).filter(({ x }) => x.source === 'leftover' && x.from === i);
      next[i] = { ...cookAt(m, next[j].recipeId), source: 'leftover', from: j };
      for (const { x, k } of deps) next[k] = { ...x, from: j, recipeId: next[j].recipeId };
      if (deps.some(({ k }) => !leftoverAllowed(ctx, next, k, j))) return null;
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

/**
 * Re-score a plan after changes made outside the planner. With `saved`
 * (the plan on the phone), leftovers stay as they were planned, even if a
 * newer version of the planner would not plan them that way, so an app
 * update never changes a week mid-way; only a leftover whose cooked meal is
 * gone or changed becomes a cook.
 */
export function scorePlan(input: PlanInput, meals: Meal[], saved = false): PlanResult {
  const ctx = buildContext(input);
  if (!saved) return evaluate(ctx, repair(ctx, meals));
  const fixed = meals.map((m, i) => {
    if (m.source !== 'leftover') return m;
    const src = m.from != null ? meals[m.from] : undefined;
    const ok = src && src.source === 'cook' && src.recipeId === m.recipeId && m.from! !== i && src.day <= m.day;
    return ok ? m : cookAt(m, m.recipeId);
  });
  return evaluate(ctx, fixed);
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
    next[index] = cookAt(target, id);
    // Meals that ate this meal's leftovers keep the old dish if the new one cannot feed them.
    const fixed = next.map((m, k) =>
      m.source === 'leftover' && m.from === index && !leftoverAllowed(ctx, next, k, index)
        ? cookAt(m, meals[k].recipeId)
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
