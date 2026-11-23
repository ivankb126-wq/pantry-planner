// Developer tool: what a starter soup and a side salad add to a week, per chain.
//   npx tsx scripts/extras-cost.ts
// Needs public/data (prices) and src/generated/content.json (npm run content).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import content from '../src/generated/content.json';
import type { IngredientInfo } from '../src/lib/nutrition';
import { generatePlan } from '../src/planner/planner';
import { DEFAULT_SETTINGS, type Offer, type PlanInput, type PlannerRecipe } from '../src/planner/types';

const STORES: Record<string, string> = { lidl: '190', kaufland: '7530', konzum: '1808', spar: '87142', plodine: '038' };
const ref: Offer[] = JSON.parse(readFileSync(join('public', 'data', 'reference-prices.json'), 'utf8'));

for (const [soup, salad] of [['off', 'off'], ['weekend', 'main'], ['daily', 'main'], ['daily', 'both']] as const) {
  console.log(`\nSoup ${soup}, salad ${salad} (2 adults, 100 EUR, 4 seeds per chain)`);
  for (const chain of Object.keys(STORES)) {
    const p = JSON.parse(readFileSync(join('public', 'data', 'prices', chain, `${STORES[chain]}.json`), 'utf8'));
    const offers = p.items.map((i: Offer) => ({ ...i, store: `${chain}:${STORES[chain]}` })) as Offer[];
    let extras = 0;
    let total = 0;
    let pots = 0;
    let salt = 0;
    const seeds = [1, 2, 3, 4];
    for (const seed of seeds) {
      const input: PlanInput = {
        recipes: content.recipes as unknown as PlannerRecipe[],
        ingredients: content.ingredients as unknown as Record<string, IngredientInfo>,
        offers,
        referenceOffers: ref,
        adults: 2,
        children: 0,
        budget: 100,
        days: 7,
        startDate: '2026-11-23',
        meals: ['breakfast', 'lunch', 'dinner', 'snack'],
        diet: 'none',
        dislikes: [],
        pantry: [],
        ratings: [],
        history: [],
        settings: { ...DEFAULT_SETTINGS, soup, salad },
        seed,
      };
      const res = generatePlan(input);
      res.views.forEach((v, i) => {
        if ((v.slot === 'starter' || v.slot === 'side') && !v.leftover) extras += v.cost;
        if (v.slot === 'starter' && res.meals[i].source === 'cook') pots++;
      });
      total += res.cost;
      salt += res.perPersonDay.salt;
    }
    const n = seeds.length;
    console.log(
      `  ${chain.padEnd(9)} soup and salad ${(extras / n).toFixed(2)} EUR a week, whole plan ${(total / n).toFixed(2)} EUR, ${(pots / n).toFixed(1)} soup pots, salt ${(salt / n).toFixed(1)} g`,
    );
  }
}
