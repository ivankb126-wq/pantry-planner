// Meal prep Sunday: one hour on Sunday that takes work off the next three
// weekday evenings. It batches what several planned meals share (a pot of
// rice or lentils, the chopped onions and carrots) and, when one fits, cooks
// a soup, stew or pasta sauce whole. Pure: no browser APIs, so it is tested
// like the planner.

import { type IngredientInfo, type Recipe, stepText, toIngredientUnit } from '../lib/nutrition';
import type { Meal, Slot } from './types';

export interface PrepUse {
  meal: number; // index in the plan's meals
  day: number;
  slot: Slot;
  recipeId: string;
  label: string; // "Monday dinner"
}

export interface PrepTask {
  id: string;
  kind: 'dish' | 'grain' | 'chop';
  title: string; // "Cook 450 g rice"
  how: string;
  tip?: string;
  uses: PrepUse[];
  active: number; // minutes of hands-on work
  passive: number; // minutes it cooks on its own
  saves: number; // weekday minutes saved
  /** What is ready on the night, for the recipe: "the rice is cooked". */
  ready?: string;
}

export interface PrepStep {
  at: number; // minutes from the start
  text: string;
  detail?: string;
}

export interface PrepPlan {
  prepDay: number; // plan day of the Sunday (-1 = the day before the plan)
  date: string; // YYYY-MM-DD
  days: number[]; // the weekdays it prepares for
  tasks: PrepTask[];
  steps: PrepStep[];
  minutes: number; // length of the session
  saves: number;
}

export interface PrepInput {
  meals: Meal[];
  startDate: string;
  days: number;
  recipe: (id: string) => Recipe | undefined;
  ingredients: Record<string, IngredientInfo>;
  /** Portions a meal is cooked for (its eaters plus later leftover meals). */
  portions: (mealIndex: number) => number;
  /** Meals already cooked; nothing is prepared for them. */
  cooked?: number[];
}

const MAX_MINUTES = 60;
const PACK_MINUTES = 3; // plus 2 a task

interface Grain {
  id: string;
  name: string;
  /** A step that cooks it on its own (not in the dish). */
  alone: RegExp;
  /** Days cooked it keeps well in the fridge. Rice is kept short to be safe. */
  keeps: number;
  active: number;
  passive: number;
  how: (g: number) => string;
  tip: string;
}

const COOL_TIP = 'Spread it out on a plate or tray so it cools fast, and get it into the fridge within an hour.';

const GRAINS: Grain[] = [
  {
    id: 'rice',
    name: 'rice',
    alone: /\b(start|cook|boil) the rice\b|rinse the rice and put it in a pot|no leftover rice, cook it/i,
    keeps: 2,
    active: 3,
    passive: 22,
    how: (g) =>
      `Rinse ${grams(g)} rice and put it in a big pot with ${ml(g * 1.8)} water and a pinch of salt. Bring to the boil, cover and cook on the lowest heat for 12 minutes, then leave it covered off the heat for 10 minutes.`,
    tip: `${COOL_TIP} On the night skip the rice step and warm it until steaming hot, only once.`,
  },
  {
    id: 'lentils',
    name: 'lentils',
    alone: /simmer (the lentils|them) in (plenty of )?water/i,
    keeps: 3,
    active: 2,
    passive: 22,
    how: (g) => `Rinse ${grams(g)} lentils and simmer them in plenty of water for 20 minutes, until just soft. Drain.`,
    tip: `${COOL_TIP} On the night skip the lentil step.`,
  },
  {
    id: 'quinoa',
    name: 'quinoa',
    alone: /quinoa[^.]*simmer it in[^.]*water/i,
    keeps: 3,
    active: 2,
    passive: 17,
    how: (g) => `Rinse ${grams(g)} quinoa and simmer it in ${ml(g * 2)} water with a pinch of salt for 15 minutes, until the water is gone.`,
    tip: `${COOL_TIP} On the night skip the quinoa step.`,
  },
  {
    id: 'bulgur',
    name: 'bulgur',
    alone: /bulgur[^.]*boiling water|boiling water over the bulgur/i,
    keeps: 3,
    active: 3,
    passive: 15,
    how: (g) => `Put ${grams(g)} bulgur in a bowl, pour over ${ml(g * 2)} boiling water, cover and leave for 15 minutes. Drain off any water left.`,
    tip: `${COOL_TIP} On the night skip the bulgur step.`,
  },
  {
    id: 'potato',
    name: 'potatoes',
    alone: /boil (the )?(peeled )?potatoes|potatoes[^.]*boil them/i,
    keeps: 3,
    active: 8,
    passive: 18,
    how: (g) => `Peel ${grams(g)} potatoes, cut them into chunks and boil them in salted water for 15 minutes, until just soft. Drain.`,
    tip: 'Let them cool in a bowl, then box them for the fridge. On the night skip the boiling step: warm them in the pan or microwave, and mash them then if the recipe says so.',
  },
];

interface Veg {
  id: string;
  one: string;
  many: string;
  minutesEach: number;
}

const VEG: Veg[] = [
  { id: 'onion', one: 'onion', many: 'onions', minutesEach: 2 },
  { id: 'carrot', one: 'carrot', many: 'carrots', minutesEach: 1.5 },
  { id: 'bell-pepper', one: 'pepper', many: 'peppers', minutesEach: 1.5 },
  { id: 'leek', one: 'leek', many: 'leeks', minutesEach: 2 },
];
const GARLIC_CLOVE_G = 5;

const DISH_FAMILIES = new Set(['soup', 'stew', 'curry']);
const SAUCE_HINT = new Set(['passata', 'canned-tomatoes', 'minced-beef', 'minced-mixed', 'pork-mince', 'turkey-mince', 'lentils', 'red-lentils']);

/** The Sunday to prepare on and the plan days it prepares for (up to three). */
export function prepWindow(startDate: string, planDays: number): { prepDay: number; days: number[] } {
  const prepDay = sundayIndex(startDate);
  return { prepDay, days: [prepDay + 1, prepDay + 2, prepDay + 3].filter((d) => d >= 0 && d < planDays) };
}

const grainCache = new WeakMap<Recipe, Grain[]>();
function grainsOf(r: Recipe): Grain[] {
  let g = grainCache.get(r);
  if (!g) {
    g = GRAINS.filter((x) => r.ingredients.some((i) => i.id === x.id && !i.optional) && r.steps.some((s) => x.alone.test(stepText(s))));
    grainCache.set(r, g);
  }
  return g;
}

/** Whether a dish can be cooked whole (or its sauce made) on Sunday. */
function aheadKind(r: Recipe): 'whole' | 'sauce' | null {
  // Fish is best cooked on the day.
  if (r.mainProtein === 'fish' || r.mainProtein === 'seafood') return null;
  const total = r.prepMinutes + r.cookMinutes;
  if (r.prepMinutes > 25 || total > 50 || total < 25) return null;
  const kind = DISH_FAMILIES.has(r.family) ? 'whole' : r.family === 'pasta' && r.cookMinutes >= 20 && r.ingredients.some((x) => SAUCE_HINT.has(x.id)) ? 'sauce' : null;
  // Worth it only when it takes a real chunk off the evening.
  return kind && dishSaves(r, kind) >= 25 ? kind : null;
}

/** Evening minutes saved by cooking a dish ahead. Rice or potatoes on the
 * side are still cooked fresh on the night, and reheating takes a few minutes. */
function dishSaves(r: Recipe, kind: 'whole' | 'sauce'): number {
  return r.prepMinutes + r.cookMinutes - (kind === 'sauce' ? 15 : 8) - grainsOf(r).length * 15;
}

/**
 * Planner nudge when meal prep is on: meals early in the week that share a
 * pot of grains, and one soup, stew or sauce that can be made on Sunday.
 * Returned as a bonus (higher is better).
 */
export function prepBonus(meals: Meal[], startDate: string, planDays: number, recipe: (id: string) => Recipe | undefined): number {
  const { prepDay, days } = prepWindow(startDate, planDays);
  if (days.length < 2) return 0;
  const count = new Map<string, number>();
  let dish = false;
  for (const m of meals) {
    if (m.source !== 'cook' || !days.includes(m.day) || (m.slot !== 'lunch' && m.slot !== 'dinner')) continue;
    const r = recipe(m.recipeId);
    if (!r) continue;
    for (const g of grainsOf(r)) if (m.day - prepDay <= g.keeps) count.set(g.id, (count.get(g.id) ?? 0) + 1);
    if (aheadKind(r) && r.keepsDays >= m.day - prepDay) dish = true;
  }
  let bonus = dish ? 2 : 0;
  for (const n of count.values()) bonus += Math.min(n - 1, 2) * 5;
  return bonus;
}

export function mealPrep(input: PrepInput): PrepPlan | null {
  const { meals, startDate } = input;
  const { prepDay, days } = prepWindow(startDate, input.days);
  const date = addDays(startDate, prepDay);
  if (days.length < 2) return null;
  const cooked = new Set(input.cooked ?? []);
  const window = meals
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => m.source === 'cook' && days.includes(m.day) && !cooked.has(i) && (m.slot === 'lunch' || m.slot === 'dinner' || m.slot === 'starter'));
  const label = (m: Meal) => `${weekday(addDays(startDate, m.day))} ${m.slot === 'starter' ? 'soup' : m.slot}`;
  const use = ({ m, i }: { m: Meal; i: number }): PrepUse => ({ meal: i, day: m.day, slot: m.slot, recipeId: m.recipeId, label: label(m) });
  const amountOf = (i: number, r: Recipe, id: string) => {
    const ing = input.ingredients[id];
    let total = 0;
    for (const ri of r.ingredients) {
      if (ri.id !== id || ri.optional || !ing) continue;
      try {
        total += (toIngredientUnit(ing, ri.quantity, ri.unit) * input.portions(i)) / r.servings;
      } catch {
        // a unit that does not fit is caught by the recipe check
      }
    }
    return total;
  };

  const tasks: PrepTask[] = [];

  // 1. One dish cooked whole: the one that saves the most evening time.
  let dishMeal = -1;
  let best: { task: PrepTask; score: number } | null = null;
  for (const w of window) {
    const r = input.recipe(w.m.recipeId);
    if (!r) continue;
    // It has to keep until its last leftover meal is eaten.
    const lastDay = Math.max(w.m.day, ...meals.filter((x) => x.source === 'leftover' && x.from === w.i).map((x) => x.day));
    if (r.keepsDays < lastDay - prepDay) continue;
    const kind = aheadKind(r);
    if (!kind) continue;
    const whole = kind === 'whole';
    const sauce = kind === 'sauce';
    const day = weekday(addDays(startDate, w.m.day));
    const active = Math.min(r.prepMinutes, 20) + 5;
    const passive = Math.max(0, r.prepMinutes + r.cookMinutes - active - (sauce ? 10 : 0));
    // Rice or potatoes on the side are cooked fresh on the night.
    const fresh = grainsOf(r);
    const freshNames = list(fresh.map((g) => g.name));
    const saves = dishSaves(r, kind);
    const task: PrepTask = whole
      ? {
          id: `dish:${r.id}`,
          kind: 'dish',
          title: `Cook ${day}'s ${shortTitle(r.title)}`,
          how: fresh.length
            ? `Follow the recipe, but leave out the ${freshNames}. On ${day} cook the ${freshNames} fresh and warm the rest until it is steaming hot.`
            : `Follow the recipe all the way. On ${day} just warm it up until it is steaming hot.`,
          ready: fresh.length ? `the rest is made: just cook the ${freshNames} and warm it until steaming hot` : undefined,
          tip: 'Let it cool with the lid off, then keep it in the fridge in its pot or a big box.',
          uses: [use(w)],
          active,
          passive,
          saves,
        }
      : {
          id: `sauce:${r.id}`,
          kind: 'dish',
          title: `Make the sauce for ${day}'s ${shortTitle(r.title)}`,
          how: `Follow the recipe up to where the pasta goes in. On ${day} just boil the pasta and warm the sauce.`,
          tip: 'Cool the sauce, then keep it in a box in the fridge.',
          uses: [use(w)],
          active,
          passive,
          saves,
        };
    if (!best || saves > best.score) best = { task, score: saves };
  }
  if (best) {
    tasks.push(best.task);
    dishMeal = best.task.uses[0].meal;
  }
  const rest = window.filter((w) => w.i !== dishMeal);

  // 2. Grains cooked once for two or more meals.
  for (const g of GRAINS) {
    const users = rest.filter(({ m }) => {
      if (m.day - prepDay > g.keeps) return false;
      const r = input.recipe(m.recipeId);
      return !!r && grainsOf(r).includes(g);
    });
    if (users.length < 2) continue;
    const total = users.reduce((s, w) => s + amountOf(w.i, input.recipe(w.m.recipeId)!, g.id), 0);
    if (total <= 0) continue;
    tasks.push({
      id: `grain:${g.id}`,
      kind: 'grain',
      title: `Cook ${grams(total)} ${g.name}`,
      how: g.how(total),
      tip: g.tip,
      uses: users.map(use),
      active: g.active,
      passive: g.passive,
      saves: users.length * (g.passive - 5),
      ready: `the ${g.name} ${g.name.endsWith('s') ? 'are' : 'is'} ${g.id === 'potato' ? 'boiled' : 'cooked'}`,
    });
  }

  // 3. Chop the vegetables several meals share, and peel the garlic.
  const chopped: string[] = [];
  const chopUses = new Map<number, PrepUse>();
  let chopMinutes = 0;
  let pieces = 0;
  for (const v of VEG) {
    const users = rest.filter(({ m }) => input.recipe(m.recipeId)?.ingredients.some((x) => x.id === v.id && !x.optional));
    if (users.length < 2) continue;
    const g = users.reduce((s, w) => s + amountOf(w.i, input.recipe(w.m.recipeId)!, v.id), 0);
    const piece = input.ingredients[v.id]?.pieceG ?? 100;
    const n = Math.max(1, Math.round(g / piece));
    chopped.push(`${n} ${n === 1 ? v.one : v.many}`);
    chopMinutes += n * v.minutesEach;
    pieces += n;
    for (const w of users) chopUses.set(w.i, use(w));
  }
  const garlicUsers = rest.filter(({ m }) => input.recipe(m.recipeId)?.ingredients.some((x) => x.id === 'garlic' && !x.optional));
  let cloves = 0;
  if (garlicUsers.length >= 2) {
    cloves = Math.max(2, Math.round(garlicUsers.reduce((s, w) => s + amountOf(w.i, input.recipe(w.m.recipeId)!, 'garlic'), 0) / GARLIC_CLOVE_G));
    chopMinutes += cloves * 0.5;
    for (const w of garlicUsers) chopUses.set(w.i, use(w));
  }
  if (chopped.length && pieces >= 2) {
    tasks.push({
      id: 'chop',
      kind: 'chop',
      title: `Chop ${list(chopped)}${cloves ? `, peel ${cloves} garlic cloves` : ''}`,
      how: `Dice the ${list(chopped.map((c) => c.replace(/^\d+ /, '')))}${cloves ? ' and peel the garlic' : ''}. Keep each in its own box in the fridge.`,
      tip: 'A box with a lid keeps the onion smell in. Diced works for recipes that say sliced too.',
      uses: [...chopUses.values()].sort((a, b) => a.meal - b.meal),
      active: Math.max(4, Math.round(chopMinutes)),
      passive: 0,
      saves: Math.max(4, Math.round(chopMinutes)),
      ready: cloves ? 'the chopped veg and garlic are ready' : 'the veg is chopped',
    });
  }

  if (!tasks.length) return null;
  let plan = schedule(tasks);
  // Keep it to about an hour: drop the slowest task until it fits.
  while (plan.minutes > MAX_MINUTES && tasks.length > 1) {
    const slow = tasks.reduce((a, b) => (b.active + b.passive > a.active + a.passive ? b : a));
    tasks.splice(tasks.indexOf(slow), 1);
    plan = schedule(tasks);
  }
  const saves = tasks.reduce((s, t) => s + t.saves, 0);
  if (saves < 20) return null;
  return { prepDay, date, days, tasks, steps: plan.steps, minutes: plan.minutes, saves };
}

/** One cook, many pots: start what cooks longest first, chop while it simmers. */
function schedule(tasks: PrepTask[]): { steps: PrepStep[]; minutes: number } {
  const order = [...tasks].sort((a, b) => kindOrder(a) - kindOrder(b) || b.passive - a.passive);
  const steps: PrepStep[] = [];
  let cursor = 0;
  let end = 0;
  for (const t of order) {
    steps.push({ at: cursor, text: t.title, detail: t.how });
    cursor += t.active;
    const done = cursor + t.passive;
    if (t.passive > 0) steps.push({ at: done, text: doneText(t) });
    end = Math.max(end, done, cursor);
  }
  steps.push({ at: end, text: 'Box it all up', detail: 'Portion everything into boxes, write the day on each and put them in the fridge.' });
  steps.sort((a, b) => a.at - b.at);
  return { steps, minutes: end + PACK_MINUTES + 2 * tasks.length };
}

function kindOrder(t: PrepTask): number {
  return t.kind === 'dish' ? 0 : t.kind === 'grain' ? 1 : 2;
}

function doneText(t: PrepTask): string {
  const g = GRAINS.find((x) => `grain:${x.id}` === t.id);
  if (g) return `The ${g.name} ${g.name.endsWith('s') ? 'are' : 'is'} done: spread ${g.name.endsWith('s') ? 'them' : 'it'} out to cool`;
  return `${t.id.startsWith('sauce') ? 'The sauce' : 'The pot'} is done: take it off the heat to cool`;
}

/** Plan day of the Sunday to prepare on: this week's, or the one before the plan
 * when the plan starts on a Monday or Tuesday. */
export function sundayIndex(startDate: string): number {
  const dow = utc(startDate).getUTCDay(); // 0 = Sunday
  const s = (7 - dow) % 7;
  return s <= 4 ? s : s - 7;
}

function shortTitle(t: string): string {
  return t.replace(/\s*\(.*\)$/, '');
}

function list(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function grams(g: number): string {
  const r = Math.round(g / 10) * 10;
  return r >= 1000 ? `${(r / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} kg` : `${Math.max(10, r)} g`;
}

function ml(x: number): string {
  const r = Math.round(x / 50) * 50;
  return r >= 1000 ? `${(r / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} l` : `${r} ml`;
}

function utc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(iso: string, n: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(iso: string): string {
  return utc(iso).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}
