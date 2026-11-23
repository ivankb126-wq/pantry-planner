// Developer tool: plan a week with real prices from a built data folder and print it.
//   npx tsx scripts/try-plan.ts [chain] [storeId] [budget] [seed]
// Needs public/data (built by the pipeline) and src/generated/content.json (npm run content).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import content from '../src/generated/content.json';
import type { IngredientInfo } from '../src/lib/nutrition';
import { generatePlan } from '../src/planner/planner';
import { DEFAULT_SETTINGS, type Offer, type PlannerRecipe } from '../src/planner/types';

const [chain = 'lidl', store = '104', budget = '110', seed = '1'] = process.argv.slice(2);
const prices = JSON.parse(readFileSync(join('public', 'data', 'prices', chain, `${store}.json`), 'utf8'));
const offers: Offer[] = prices.items.map((i: Offer) => ({ ...i, store: `${chain}:${store}` }));
const referenceOffers: Offer[] = JSON.parse(readFileSync(join('public', 'data', 'reference-prices.json'), 'utf8'));

const t0 = performance.now();
const res = generatePlan({
  recipes: content.recipes as unknown as PlannerRecipe[],
  ingredients: content.ingredients as unknown as Record<string, IngredientInfo>,
  offers,
  referenceOffers,
  adults: 2,
  children: 0,
  budget: Number(budget),
  days: 7,
  startDate: '2026-11-23',
  meals: ['breakfast', 'lunch', 'dinner', 'snack'],
  diet: 'none',
  dislikes: [],
  pantry: [],
  ratings: (process.env.FAV ?? '').split(',').filter(Boolean).map((recipeId) => ({ recipeId, up: true })),
  history: [],
  settings: { ...DEFAULT_SETTINGS, soup: (process.env.SOUP ?? 'off') as 'off', salad: (process.env.SALAD ?? 'off') as 'off', favourites: !!process.env.FAVWEEK },
  seed: Number(seed),
});
const ms = Math.round(performance.now() - t0);

let day = -1;
for (const v of res.views) {
  if (v.day !== day) {
    day = v.day;
    console.log(`\n${v.date}`);
  }
  console.log(`  ${v.slot.padEnd(9)} ${v.leftover ? '(leftover) ' : ''}${v.title}  ${v.minutes} min  ${v.kcal} kcal  ${v.cost.toFixed(2)} EUR`);
}
console.log(`\nCost ${res.cost} of ${res.budget} EUR, left ${res.moneyLeft}. Planned in ${ms} ms.`);
console.log('Checks:', res.checks.map((c) => `${c.ok ? 'OK' : '!!'} ${c.label} ${c.value} (${c.target})`).join(' | '));
console.log('Score:', res.score, JSON.stringify(res.breakdown));
console.log('Missing prices:', res.missingPrices.join(', ') || 'none');
console.log('Estimated prices:', res.estimatedPrices.join(', ') || 'none');
console.log('Left at home:', res.leftovers.slice(0, 12).map((l) => `${l.ingredient} ${l.amount}`).join(', '));
if (res.warnings.length) console.log('Warnings:', res.warnings);
