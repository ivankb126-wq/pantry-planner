// Recipe tools.
//   npm run add-recipe-check            validate all recipes and print their nutrition
//   npm run add-recipe-check -- thai    only show recipes whose id or title contains "thai"
//   npm run content                     build src/generated/content.json for the app
//
// Checks: JSON schema, unique ids, every ingredient exists and the unit fits,
// "quick" recipes take 30 minutes or less, vegetarian/vegan tags match the
// ingredients, and nutrition per serving looks sensible for the meal type.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parse } from 'yaml';
import {
  type IngredientInfo,
  type Recipe,
  type RecipeFacts,
  STEP_AMOUNT,
  UnitError,
  collectionOf,
  recipeFacts,
  stepText,
  stepTip,
  toIngredientUnit,
} from '../src/lib/nutrition';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPE_DIR = join(ROOT, 'recipes');

interface YamlIngredient {
  id: string;
  name: string;
  category: string;
  storage: IngredientInfo['storage'];
  unit: IngredientInfo['unit'];
  staple?: boolean;
  package?: string;
  packages?: number[];
  nutrition: IngredientInfo['nutrition'];
  diet?: IngredientInfo['diet'];
  tags?: string[];
  piece_g?: number;
  density?: number;
  shelf_life_days?: number;
  edible?: number;
}

export function loadIngredients(): Record<string, IngredientInfo> {
  const raw = parse(readFileSync(join(ROOT, 'data', 'ingredients.yml'), 'utf8')) as { ingredients: YamlIngredient[] };
  const out: Record<string, IngredientInfo> = {};
  for (const i of raw.ingredients) {
    out[i.id] = {
      id: i.id,
      name: i.name,
      category: i.category,
      storage: i.storage,
      unit: i.unit,
      staple: !!i.staple,
      packageType: i.package ?? 'pack',
      packages: i.packages ?? [],
      nutrition: i.nutrition,
      diet: i.diet ?? 'vegan',
      ...(i.tags?.length ? { tags: i.tags } : {}),
      ...(i.piece_g ? { pieceG: i.piece_g } : {}),
      ...(i.density && i.density !== 1 ? { density: i.density } : {}),
      ...(i.shelf_life_days ? { shelfLifeDays: i.shelf_life_days } : {}),
      ...(i.edible && i.edible !== 1 ? { edible: i.edible } : {}),
    };
  }
  return out;
}

interface Loaded {
  recipes: { recipe: Recipe; file: string }[];
  errors: string[];
}

export function loadRecipes(): Loaded {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(JSON.parse(readFileSync(join(RECIPE_DIR, 'schema.json'), 'utf8')));
  const errors: string[] = [];
  const recipes: Loaded['recipes'] = [];
  const files = readdirSync(RECIPE_DIR).filter((f) => f.endsWith('.json') && f !== 'schema.json').sort();
  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(RECIPE_DIR, file), 'utf8'));
    } catch (e) {
      errors.push(`${file}: not valid JSON (${(e as Error).message})`);
      continue;
    }
    if (!validate(data)) {
      // Report errors per recipe, so a long file is still readable.
      const list = Array.isArray(data) ? data : [data];
      list.forEach((r, i) => {
        if (!ajv.validate({ $ref: 'https://pantry-planner/recipe.schema.json#/definitions/recipe' }, r)) {
          const id = (r as { id?: string })?.id ?? `item ${i + 1}`;
          for (const err of ajv.errors ?? []) errors.push(`${file} ${id}: ${err.instancePath || '(recipe)'} ${err.message}`);
        }
      });
      if (!errors.some((e) => e.startsWith(file))) errors.push(`${file}: does not match the schema`);
      continue;
    }
    for (const recipe of (Array.isArray(data) ? data : [data]) as Recipe[]) recipes.push({ recipe, file });
  }
  return { recipes, errors };
}

// Sensible kcal per serving by collection; outside this range we warn.
const KCAL_RANGE: Record<ReturnType<typeof collectionOf>, [number, number]> = {
  main: [300, 1100],
  quick: [300, 1000],
  breakfast: [200, 750],
  dessert: [120, 650],
  'batch-snack': [60, 450],
};

export function checkAll() {
  const ingredients = loadIngredients();
  const { recipes, errors } = loadRecipes();
  const warnings: string[] = [];
  const facts = new Map<string, RecipeFacts>();
  const seen = new Map<string, string>();
  for (const { recipe: r, file } of recipes) {
    const where = `${file} ${r.id}`;
    if (seen.has(r.id)) errors.push(`${where}: id already used in ${seen.get(r.id)}`);
    seen.set(r.id, file);
    let ok = true;
    for (const ri of r.ingredients) {
      const ing = ingredients[ri.id];
      if (!ing) {
        errors.push(`${where}: unknown ingredient "${ri.id}" (add it to data/ingredients.yml first)`);
        ok = false;
        continue;
      }
      try {
        toIngredientUnit(ing, ri.quantity, ri.unit);
      } catch (e) {
        if (e instanceof UnitError) errors.push(`${where}: ${e.message}`);
        ok = false;
      }
    }
    r.steps.forEach((s, n) => {
      for (const part of [stepText(s), stepTip(s) ?? '']) {
        const stray = part.replace(STEP_AMOUNT, '');
        if (/[{}]/.test(stray)) errors.push(`${where}: step ${n + 1} has a "{...}" that is not an amount like {200 ml}, {2 tbsp} or {4}`);
        if (part.includes('—')) errors.push(`${where}: step ${n + 1} uses a long dash; use a comma or full stop instead`);
      }    });
    const dupes = r.ingredients.map((i) => i.id).filter((id, i, a) => a.indexOf(id) !== i);
    if (dupes.length) warnings.push(`${where}: ingredient listed twice: ${dupes.join(', ')}`);
    if (!ok) continue;
    const f = recipeFacts(r, ingredients);
    facts.set(r.id, f);
    if (r.tags.includes('quick') && f.totalMinutes > 30) errors.push(`${where}: tagged quick but takes ${f.totalMinutes} min`);
    if (r.tags.includes('vegan') && f.diet !== 'vegan') errors.push(`${where}: tagged vegan but is ${f.diet}`);
    if (r.tags.includes('vegetarian') && !['vegan', 'vegetarian'].includes(f.diet))
      errors.push(`${where}: tagged vegetarian but is ${f.diet}`);
    const [lo, hi] = KCAL_RANGE[collectionOf(r)];
    const kcal = f.perServing.kcal;
    if (kcal < lo || kcal > hi) warnings.push(`${where}: ${kcal} kcal per serving looks ${kcal < lo ? 'low' : 'high'} (expected ${lo} to ${hi})`);
    if (f.perServing.salt > 4) warnings.push(`${where}: ${f.perServing.salt} g salt per serving is a lot`);
    if (r.mealTypes.some((m) => m === 'lunch' || m === 'dinner') && f.perServing.protein < 12)
      warnings.push(`${where}: only ${f.perServing.protein} g protein for a main meal`);
  }
  return { ingredients, recipes: recipes.map((x) => x.recipe), facts, errors, warnings };
}

function pad(s: string | number, n: number, right = false) {
  const t = String(s);
  return right ? t.padStart(n) : t.padEnd(n);
}

function report(filter?: string) {
  const { recipes, facts, errors, warnings } = checkAll();
  const shown = recipes.filter((r) => !filter || r.id.includes(filter) || r.title.toLowerCase().includes(filter.toLowerCase()));
  console.log(`${pad('recipe', 34)} ${pad('kcal', 5, true)} ${pad('prot', 5, true)} ${pad('carb', 5, true)} ${pad('fat', 5, true)} ${pad('fibre', 5, true)} ${pad('salt', 5, true)} ${pad('veg', 4, true)}  diet`);
  for (const r of shown) {
    const f = facts.get(r.id);
    if (!f) continue;
    const s = f.perServing;
    console.log(
      `${pad(r.id.slice(0, 34), 34)} ${pad(s.kcal, 5, true)} ${pad(s.protein, 5, true)} ${pad(s.carbs, 5, true)} ${pad(s.fat, 5, true)} ${pad(s.fibre, 5, true)} ${pad(s.salt, 5, true)} ${pad(s.vegPortions, 4, true)}  ${f.diet}`,
    );
  }
  const counts: Record<string, number> = {};
  for (const r of recipes) counts[collectionOf(r)] = (counts[collectionOf(r)] ?? 0) + 1;
  const cuisines: Record<string, number> = {};
  for (const r of recipes) cuisines[r.cuisine] = (cuisines[r.cuisine] ?? 0) + 1;
  console.log(`\n${recipes.length} recipes: ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('Cuisines: ' + Object.entries(cuisines).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  if (warnings.length) console.log(`\n${warnings.length} warnings:\n  ` + warnings.join('\n  '));
  if (errors.length) {
    console.log(`\n${errors.length} ERRORS:\n  ` + errors.join('\n  '));
    process.exitCode = 1;
  } else {
    console.log('\nAll recipes are valid.');
  }
}

function build() {
  const { ingredients, recipes, facts, errors } = checkAll();
  if (errors.length) {
    console.error(`Recipe errors, run "npm run add-recipe-check" for details:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  const out = {
    ingredients,
    recipes: recipes.map((r) => ({ ...r, facts: facts.get(r.id) })),
  };
  const target = join(ROOT, 'src', 'generated', 'content.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(out));
  console.log(`Wrote ${recipes.length} recipes and ${Object.keys(ingredients).length} ingredients to src/generated/content.json`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') build();
else report(arg);
