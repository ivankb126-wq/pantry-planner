# Pantry Planner

A personal meal-planning web app for Croatia. It plans a week of meals for a
number of people and a weekly budget, using real daily prices from Lidl,
Kaufland, Konzum, Spar and Plodine. The full plan is in [SPEC.md](SPEC.md).

Status: **milestone 6** (price pipeline, 262 ingredients, 405 recipes, planner
engine, the app screens, the living pantry, works offline and installs on
the iPhone home screen).

Open it: **https://ivankb126-wq.github.io/pantry-planner/**

## Put it on the iPhone home screen

1. Open the link above in **Safari** on the iPhone.
2. Tap the **Share** button (the square with an arrow, at the bottom).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Pantry** from the home screen. It opens full screen and works
   without internet, using the prices saved the last time it was online.

The home screen app keeps its own data, separate from Safari. To move your
plan, ratings and pantry: in Safari open Settings, **Back up my data**, then
in the home screen app open Settings, **Restore a backup** and pick the file.

## Asking for new recipes and features

Changes are made by asking Claude in a Claude Code session on this
repository. Plain sentences work. Some examples:

- **A new recipe:** "Add a recipe for stuffed peppers (punjene paprike),
  dinner, serves 4, about 60 minutes." Paste a recipe from a book or website
  if you have one. Claude writes it in `recipes/`, runs the recipe check
  (format, ingredients, nutrition) and uploads it. Missing ingredients are
  added to `data/ingredients.yml` with their nutrition and shop search words.
- **A wrong price or product:** "Eggs at Konzum show the wrong product" with a
  screenshot. Claude adjusts the search words for that ingredient.
- **A change to the app:** "Make the shopping list text bigger" or "Add a
  dessert every Sunday". Describe what you see and what you would like
  instead; a screenshot helps.
- **Something broken:** say what you tapped, what you expected and what
  happened, with a screenshot.

Every change is checked automatically on GitHub (tests, recipe check) before
the site updates, and the site updates itself within a few minutes.

## App

[src/app/](src/app) holds the app's state (saved in the browser's IndexedDB on
the phone, with a backup file you can export and restore), the hash router
(`#/plan`, `#/recipes`, `#/recipe/<id>`, `#/cook/<id>`, `#/shopping`,
`#/pantry`, `#/settings`, `#/data`) and the glue to the planner.
[src/screens/](src/screens) has one file per screen and [src/ui/](src/ui) the
shared pieces (icons, sheets, steppers, switches) in the Sunset Night style.
A plan remembers what was in the pantry when it was made, so adding shopping
or cooking during the week does not change that week's list.
[src/app/pantry.ts](src/app/pantry.ts) has the living pantry rules: what a
cooked meal takes (scaled to the people and any leftover meals), soonest
use-by first, items that reach zero leave the shelf, and staples below a
threshold (or used up) are suggested as "Running low".

**Offline.** [src/service-worker.js](src/service-worker.js) is published as
`sw.js` by a small plugin in [vite.config.ts](vite.config.ts), which fills in
the build's file list. App files are saved on install; price data is fetched
fresh when online and the saved copy is used offline (or after 4 seconds on a
slow connection). App icons are drawn by `npm run icons`
([scripts/make-icons.ts](scripts/make-icons.ts)) into `public/icons/`.

## Planner

[src/planner/](src/planner) plans a week from the recipes, one store's prices
and your settings. It buys whole packages (or loose produce by weight), uses
the pantry first, lets lunch be yesterday's dinner (a big pot such as sarma
or grah feeds two lunches), keeps to the budget and a healthy-eating check,
avoids repeats, and prefers liked dishes, sale items and at least one new
dish. Dishes from the last two weeks get a rest, so cheap favourites take
turns. Long dishes get a nudge at weekends, and with "Croatian classic at
weekends" on each plan aims for one Croatian main, new ones first, as long as
the budget allows. Items a store does not list get a
typical price from `data/reference-prices.json`, marked as an estimate.
Same seed, same plan; a new seed is "Regenerate". To try it on real data:

```bash
npx tsx scripts/try-plan.ts lidl 104 110 1   # chain, store, budget, seed
```

## Recipes

Recipes live in [recipes/](recipes) as JSON (one recipe or a list per file),
checked against [recipes/schema.json](recipes/schema.json). Nutrition is never
typed in: it is calculated from [data/ingredients.yml](data/ingredients.yml).
Every recipe has a `family`, the kind of dish (pasta, rice, soup, stew,
curry, oven, pan-grill, salad, bread, eggs, pie, porridge, pancakes, baking,
pudding, fruit, snacks). It drives the type filter, "Similar dishes" and
variety in plans, and makes variations easy: copy a dish of the same family
and change what makes it different. Recipes written from a cookbook or blog
are in our own words and say so in the description ("Inspired by ...").
After adding or changing recipes, run:

```bash
npm run add-recipe-check
```

It checks the format, that every ingredient exists and its unit fits, the
quick/vegetarian/vegan labels, and prints nutrition per serving with warnings
for unusual values.

A step is plain text, or `{ "text": "...", "tip": "..." }` when it helps to
say how to tell it is done ("Done when the onion is soft and golden").
Cooking mode shows the tip under the step. Amounts in a step that should
grow or shrink with the number of people go in braces: `{700 ml}`,
`{2 tbsp}`, `{8}` (for 8 eggs). For 2 people a 4-serving recipe then reads
"350 ml". The cooking timer uses the longest time a step mentions, so write
the main wait as the longest. A recipe can have a free photo:
`"photo"` (a file in `public/photos/`), `"photoCredit"` (author and licence)
and `"photoSource"` (the photo's page). Only use photos whose licence allows
reuse (public domain, CC0, CC BY, CC BY-SA). A photo you take in the app
replaces it on your phone.

## How it works

- **Prices.** Croatian shops publish their price lists every working day. A
  GitHub Actions workflow ([update-prices.yml](.github/workflows/update-prices.yml))
  runs twice a day, downloads the daily archive from
  [cijene.dev](https://cijene.dev), matches products to the ingredients in
  [data/ingredients.yml](data/ingredients.yml) and publishes small JSON files
  with the site. If a chain is missing it tries the shop's own website, and
  if that fails it keeps the last good prices and shows their date.
- **App.** A static web app (Vite, TypeScript, Preact) hosted on GitHub Pages
  and installed on the iPhone home screen. No accounts: your data stays on
  your phone.
- **Prices are orientation prices.** Loyalty-card and app-only discounts may
  not be in the files.

## Folders

| Folder | What is in it |
|---|---|
| `src/` | The web app (`app/` state, `screens/`, `ui/`, `planner/`, `lib/`) |
| `pipeline/` | Python price pipeline and its tests |
| `data/ingredients.yml` | Master ingredient list: nutrition, package sizes, Croatian search words |
| `.github/workflows/` | Checks on every change, and the twice-daily price update and deploy |

## For developers

```bash
npm install
npm run dev          # app on http://localhost:5173 (needs data in public/data)
npm run check        # lint, type check, tests

python -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
PYTHONPATH=pipeline python -m pantry_pipeline build --out public/data --no-crawler
PYTHONPATH=pipeline python -m pantry_pipeline inspect --chain spar --ingredient eggs
python -m pytest pipeline
```

## Data and credits

Dish photos come from [Wikimedia Commons](https://commons.wikimedia.org) and
from Flickr (found through [Openverse](https://openverse.org)), and are public
domain, CC0, CC BY or CC BY-SA. Each one is credited on its recipe page
(author and licence, linked to the photo's own page), and
the recipe file holds the same in `photoCredit` and `photoSource`. The
photos in `public/photos/` are smaller copies (720 px wide) of the originals.

Price data comes from the shops' official price lists, collected by
[cijene.dev](https://github.com/senko/cijene-api) (free for non-commercial
use). This is a personal, non-commercial project. Price data is never
committed to this repository; it is built into the published site.
