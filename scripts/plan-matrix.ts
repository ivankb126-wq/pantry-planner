// Developer tool: plans many weeks with different households, budgets, diets and
// stores, and prints a table plus anything that looks wrong.
//   npx tsx scripts/plan-matrix.ts
// Needs public/data (prices) and src/generated/content.json (npm run content).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import content from '../src/generated/content.json';
import type { IngredientInfo } from '../src/lib/nutrition';
import { generatePlan } from '../src/planner/planner';
import { DEFAULT_SETTINGS, type Offer, type PlanInput, type PlannerRecipe, type Slot } from '../src/planner/types';

const RECIPES = content.recipes as unknown as PlannerRecipe[];
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
const ING = content.ingredients as unknown as Record<string, IngredientInfo>;
const ref: Offer[] = JSON.parse(readFileSync(join('public', 'data', 'reference-prices.json'), 'utf8'));
const STORES: Record<string, string> = { lidl: '190', kaufland: '7530', konzum: '1808', spar: '87142', plodine: '038' };
const offersFor = (chain: string) => {
  const p = JSON.parse(readFileSync(join('public', 'data', 'prices', chain, `${STORES[chain]}.json`), 'utf8'));
  return p.items.map((i: Offer) => ({ ...i, store: `${chain}:${STORES[chain]}` })) as Offer[];
};

interface Case {
  name: string;
  chain?: string;
  adults?: number;
  children?: number;
  budget: number;
  diet?: PlanInput['diet'];
  dislikes?: string[];
  meals?: Slot[];
  seed?: number;
  settings?: Partial<PlanInput['settings']>;
}
const ALL: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const cases: Case[] = [
  { name: '2 adults 50 EUR', budget: 50 },
  { name: '2 adults 70 EUR', budget: 70 },
  { name: '2 adults 90 EUR', budget: 90 },
  { name: '2 adults 110 EUR', budget: 110 },
  { name: '2 adults 150 EUR', budget: 150 },
  { name: '2 adults 250 EUR', budget: 250 },
  { name: '1 adult 30 EUR', adults: 1, budget: 30 },
  { name: '1 adult 60 EUR', adults: 1, budget: 60 },
  { name: '2+2 kids 120 EUR', children: 2, budget: 120 },
  { name: '2+2 kids 180 EUR', children: 2, budget: 180 },
  { name: '6 adults 250 EUR', adults: 6, budget: 250 },
  { name: 'vegetarian 90', budget: 90, diet: 'vegetarian' },
  { name: 'vegan 90', budget: 90, diet: 'vegan' },
  { name: 'pescatarian 90', budget: 90, diet: 'pescatarian' },
  { name: 'no mushrooms/fish 90', budget: 90, dislikes: ['mushrooms', 'hake', 'salmon', 'tuna-canned'] },
  { name: 'lunch+dinner 70', budget: 70, meals: ['lunch', 'dinner'] },
  { name: 'dinner only 40', budget: 40, meals: ['dinner'] },
  { name: 'kaufland 100', chain: 'kaufland', budget: 100 },
  { name: 'konzum 100', chain: 'konzum', budget: 100 },
  { name: 'spar 100', chain: 'spar', budget: 100 },
  { name: 'plodine 100', chain: 'plodine', budget: 100 },
  { name: 'no cook-twice 100', budget: 100, settings: { cookOnceEatTwice: false } },
  { name: 'seed 2 100', budget: 100, seed: 2 },
  { name: 'seed 3 100', budget: 100, seed: 3 },
];

const problems: string[] = [];
const rows: string[] = [];
for (const c of cases) {
  const input: PlanInput = {
    recipes: RECIPES,
    ingredients: ING,
    offers: offersFor(c.chain ?? 'lidl'),
    referenceOffers: ref,
    adults: c.adults ?? 2,
    children: c.children ?? 0,
    budget: c.budget,
    days: 7,
    startDate: '2026-11-23',
    meals: c.meals ?? ALL,
    diet: c.diet ?? 'none',
    dislikes: c.dislikes ?? [],
    pantry: [],
    ratings: [],
    history: [],
    settings: { ...DEFAULT_SETTINGS, ...c.settings },
    seed: c.seed ?? 1,
  };
  const t0 = performance.now();
  const res = generatePlan(input);
  const ms = Math.round(performance.now() - t0);
  const cooked = res.meals.filter((m) => m.source === 'cook');
  const ids = cooked.map((m) => m.recipeId);
  const repeats = ids.filter((id, i) => ids.indexOf(id) !== i);
  const fam: Record<string, number> = {};
  for (const m of cooked.filter((m) => m.slot === 'lunch' || m.slot === 'dinner')) {
    const f = BY_ID.get(m.recipeId)!.family;
    fam[f] = (fam[f] ?? 0) + 1;
  }
  const topFam = Object.entries(fam).sort((a, b) => b[1] - a[1])[0];
  const failed = res.checks.filter((x) => !x.ok).map((x) => x.label);
  const empty = input.meals.length * 7 - res.meals.length;
  const slowWeekday = cooked.filter((m) => {
    const r = BY_ID.get(m.recipeId)!;
    const dow = (m.day + 1) % 7; // 2026-11-23 is a Monday: day 0 = Mon
    return dow < 6 && dow !== 0 && (m.slot === 'lunch' || m.slot === 'dinner') && r.facts.totalMinutes > 75;
  });
  const sameDayDup: string[] = [];
  for (let d = 0; d < 7; d++) {
    const mains = res.meals.filter((m) => m.day === d && (m.slot === 'lunch' || m.slot === 'dinner'));
    if (mains.length === 2 && BY_ID.get(mains[0].recipeId)!.family === BY_ID.get(mains[1].recipeId)!.family && mains[0].recipeId !== mains[1].recipeId)
      sameDayDup.push(`${d}:${BY_ID.get(mains[0].recipeId)!.family}`);
  }
  const dietBad = c.diet ? cooked.filter((m) => {
    const d = BY_ID.get(m.recipeId)!.facts.diet;
    return c.diet === 'vegan' ? d !== 'vegan' : c.diet === 'vegetarian' ? !['vegan', 'vegetarian'].includes(d) : !['vegan', 'vegetarian', 'pescatarian'].includes(d);
  }) : [];
  const dislikeBad = (c.dislikes ?? []).length ? cooked.filter((m) => BY_ID.get(m.recipeId)!.ingredients.some((i) => c.dislikes!.includes(i.id))) : [];
  const estShare = res.shopping.length ? res.shopping.filter((s) => s.estimated).reduce((a, s) => a + s.cost, 0) / res.cost : 0;
  const withPhoto = cooked.filter((m) => BY_ID.get(m.recipeId)!.photo).length;
  rows.push(
    [
      c.name.padEnd(22),
      `${res.cost.toFixed(0).padStart(4)}/${c.budget}`.padEnd(9),
      `${res.perPersonDay.kcal.toFixed(0)}kcal`.padEnd(9),
      `${res.perPersonDay.protein.toFixed(0)}g`.padEnd(5),
      `salt ${res.perPersonDay.salt}`.padEnd(9),
      `fib ${res.perPersonDay.fibre}`.padEnd(9),
      `cook ${cooked.length} lo ${res.meals.length - cooked.length}`.padEnd(13),
      `${topFam ? topFam.join(':') : ''}`.padEnd(12),
      `est ${(estShare * 100).toFixed(0)}%`.padEnd(8),
      `photo ${withPhoto}/${cooked.length}`.padEnd(12),
      `${ms}ms`.padEnd(7),
      failed.length ? `!! ${failed.join(', ')}` : '',
    ].join(' '),
  );
  const p = (s: string) => problems.push(`${c.name}: ${s}`);
  if (res.cost > c.budget + 0.01) p(`over budget ${res.cost.toFixed(2)} > ${c.budget}`);
  if (empty) p(`${empty} empty meal slots`);
  if (repeats.length) p(`cooked twice: ${[...new Set(repeats)].join(', ')}`);
  if (slowWeekday.length) p(`slow weekday mains: ${slowWeekday.map((m) => `${m.day}/${m.recipeId}(${BY_ID.get(m.recipeId)!.facts.totalMinutes}m)`).join(', ')}`);
  if (sameDayDup.length) p(`same family lunch+dinner on day ${sameDayDup.join(', ')}`);
  if (dietBad.length) p(`diet broken: ${dietBad.map((m) => m.recipeId).join(', ')}`);
  if (dislikeBad.length) p(`dislike used: ${dislikeBad.map((m) => m.recipeId).join(', ')}`);
  if (res.missingPrices.length) p(`no price: ${res.missingPrices.join(', ')}`);
  if (res.warnings.length) p(`warnings: ${res.warnings.join(' | ')}`);
  if (ms > 2500) p(`slow: ${ms} ms`);
}
console.log(rows.join('\n'));
console.log(`\n${problems.length} things to look at:`);
console.log(problems.join('\n'));
