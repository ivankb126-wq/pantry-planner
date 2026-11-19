# Pantry Planner: build spec for Claude Code

You are building a personal meal-planning web app for Ivan (Croatia, iPhone, English UI). It plans breakfast, lunch, dinner, dessert and snacks for a week, for a given number of people and a weekly budget, using real daily prices from Croatian supermarkets: **Lidl, Kaufland, Konzum, Spar, Plodine**. It is inspired by the Croatian app "Špajza", but it must have its own design and must not copy its branding, texts or images.

Work in milestones (section 10). After each milestone, stop, summarise what works, and wait for Ivan's go-ahead. Ivan is not a developer: explain anything he must click or configure in plain, step-by-step language. Never use em dashes in text written for Ivan or in the app UI.

---

## 1. Platform and hosting

- **Progressive Web App** (PWA), installed on the iPhone home screen from Safari (Share, then Add to Home Screen). Mobile-first, iOS safe areas, works offline after first load (service worker caches app and latest data).
- **Static site, no backend, no accounts.** All personal data (settings, ratings, pantry, plans, history) is stored on the device (IndexedDB). Add **Export backup / Import backup** (JSON file) in Settings, because iOS can clear website storage.
- **Hosting: GitHub Pages**, deployed by a GitHub Actions workflow (`actions/deploy-pages`). The repo is public (free Pages). No personal data ever goes into the repo.
- **Stack:** Vite + TypeScript + Preact (or React), plain CSS or a small utility setup. Python 3.12 for the data pipeline. Keep dependencies small.

## 2. Price data: what we verified (19 Nov 2026)

Croatian retailers must publish machine-readable price lists every working day by 8:00 (CSV/XML), one file per store. Official index pages:

| Chain | Official price list index | Format notes |
|---|---|---|
| Lidl | https://www.lidl.hr/c/cijene/s10073252 | One CSV per store, comma separated, same price nationwide. The same product code can appear many times in one file (variants), so dedupe by barcode + name. |
| Kaufland | https://www.kaufland.hr/akcije-novosti/popis-mpc.html (file list comes from a JSON asset referenced on that page) | Tab separated, prices with comma decimals and padding spaces. |
| Konzum | https://www.konzum.hr/cjenici | One CSV per store via `/cjenici/download?title=...`, paginated index (50 stores per page). Can publish more than one version per store per day. |
| Spar | https://www.spar.hr/datoteke_cjenici/CjenikYYYYMMDD.json (JSON index of CSV URLs) | Semicolon separated, comma decimals. On sale items the regular price column is empty and the sale price is in "MPC za vrijeme posebnog oblika prodaje". |
| Plodine | https://www.plodine.hr/info-o-cijenama (daily ZIP of CSVs) | Often published late. On 19 Nov at 17:20 the newest ZIP was still 18 Nov. |

**Aggregated source: cijene.dev** (open source, https://github.com/senko/cijene-api, free for non-commercial use). Daily ZIP archives: `https://api.cijene.dev/v0/list` lists them, `https://api.cijene.dev/v0/archive/YYYY-MM-DD.zip` (about 200 MB). Each ZIP has `<chain>/stores.csv`, `<chain>/products.csv`, `<chain>/prices.csv`. prices.csv columns: `store_id,product_id,price,unit_price,best_price_30,anchor_price,special_price,available,special_sale_type,anchor_price_date`.

We compared cijene.dev against the official files for one store per chain:

- Spar (Interspar Zagreb Jankomir): 32,388 products, identical prices and identical 3,395 sale items.
- Lidl (Jastrebarsko): 19,601 rows, identical.
- Kaufland (Zagreb, Antuna Šoljana): 23,556 products, identical total.
- Konzum (Ivanić-Grad, Žitna): 26,299 products, identical except 6 non-food items (cijene.dev used a slightly different version of that day's file).
- When an item is on sale, cijene.dev puts the sale price in both `price` and `special_price`. Treat `special_price` present as "on sale".

**Known gaps:** in the 10 days before 19 Nov, a chain was missing from the cijene.dev archive on 4 days (15 Nov Kaufland, 16 Nov Konzum, 18 Nov Lidl and Kaufland, 19 Nov Plodine). The pipeline must never break or show empty prices because of this.

**Not covered by the files:** loyalty-card and app-only discounts (Lidl Plus, Kaufland Card, Moj Spar, Multiplus) may not appear. Label prices in the app as "orientation prices".

**Catalogues (leaflets) are not needed.** Sale prices already appear in the daily price lists, so we do not scrape PDF leaflets.

## 3. Data pipeline (GitHub Actions)

Workflow `update-prices.yml`, runs at about 09:30 and 15:30 Europe/Zagreb every day, plus manual trigger.

1. Download the newest cijene.dev archive. For each of the 5 chains:
   - if the chain is present, use it;
   - if missing, try the official site directly using the cijene-api crawler (`pip install` it from GitHub in the workflow, run only that chain; do not copy its AGPL code into this repo);
   - if that also fails, keep the previous good data for that chain and record its date.
2. **Ingredient matching.** `data/ingredients.yml` is the master list of ingredients used by recipes (about 250 to 350 entries). Each entry: id, English name, Croatian search keywords (include and exclude words), category, nutrition per 100 g, typical package sizes, unit (g, ml, piece), whether it is a pantry staple. The matcher finds, per chain and per store, the products that fit each ingredient and keeps the best value options (price per kg/l, preferring sensible package sizes). Write unit tests with real product names (for example "PILEĆI FILE 500 g" matches chicken breast, "MAJONEZA OD SVJ. JAJA" does not match eggs).
3. **Outputs** (built into the Pages artifact, not committed to git):
   - `data/stores/<chain>.json`: store id, city, address (for the store picker).
   - `data/prices/<chain>/<store_id>.json`: only matched ingredient products: ingredient id, product name, brand, package size, price, sale price, unit price.
   - `data/deals/<chain>/<store_id>.json`: food items on sale today that match an ingredient.
   - `data/meta.json`: data date per chain, so the app can show "Prices from Lidl, 19 Nov".
   - Keep the previous deployment's data as fallback (download it from the live site at the start of the job).
4. Fail loudly in the Action log, never silently, and open a GitHub issue if a chain has been stale for 3+ days.

## 4. Recipe library

- Recipes live in `recipes/*.json`, validated by a JSON schema in CI.
- Start with **at least 150 recipes**, written by you, original wording:
  - 60 lunches/dinners, 30 breakfasts, 20 desserts, 20 batch snacks (granola bars, energy balls, muffins, hummus, overnight oats jars), 20 quick meals (under 30 min).
  - Cuisines: Croatian (Dalmatian, Slavonian, Istrian, continental), Mediterranean, Italian, Asian (Chinese, Thai, Japanese, Korean, Indian), Mexican, Middle Eastern, plus everyday basics.
- Schema per recipe: id, title, description, meal types, cuisine, servings, prep and cook minutes, difficulty, ingredients (ingredient id from `ingredients.yml`, quantity, unit, optional), steps, tags (vegetarian, vegan, high-protein, freezer-friendly, keeps N days, cook-once-eat-twice, kid-friendly), equipment, and an illustration key (emoji or SVG icon, no photos for now).
- Nutrition per serving (kcal, protein, carbs, sugar, fat, saturated fat, fibre, salt) is **calculated** from `ingredients.yml`, never typed by hand.
- Add a script `npm run add-recipe-check` that validates new recipes, checks every ingredient exists, and reports nutrition. When Ivan asks you to "add recipes like X" or "more Thai dishes", you add JSON files and run the check.

## 5. Planner

Inputs: number of people (adults and children), weekly budget in EUR, which meals to plan (breakfast, lunch, dinner, dessert, snack), number of days (default 7), store mode (one chosen store, or "cheapest across my stores" which splits the shopping list by store), dislikes and excluded ingredients, diet (none, vegetarian, pescatarian, vegan), max cooking time on weekdays, pantry contents, ratings history.

Rules:
- **Cost** is what you actually pay: whole packages. Leftover package amounts are tracked and shown as "Left at home", and can be saved to the pantry so the next plan uses them first.
- **Budget:** total must be at or below the budget. Show money left.
- **Ingredient reuse:** strong bonus for recipes that use leftovers from earlier in the week (for example a 500 g chicken pack split across two meals).
- **Cook once, eat twice:** lunch can be the previous dinner's leftovers when the recipe allows it (setting, default on).
- **Healthy week** (general healthy-eating guidance, not medical advice), per person per day averaged over the week: energy near a sensible target (default 2,000 to 2,500 kcal per adult, adjustable), protein at least 60 g, fibre at least 25 g, at least 3 portions of vegetables or fruit, added sugar limited, salt limited. Per week: fish or seafood at least once, red and processed meat at most 3 times, at least 2 legume or vegetarian mains. Show a simple weekly "Nutrition check" with green/amber marks, not scary numbers.
- **Variety:** no same main protein on consecutive days, no repeated recipe in a week, mix of cuisines.
- **Something new:** setting "At least one new dish per week" (default on): one recipe Ivan has never cooked, ideally from a cuisine he cooks less often.
- **Ratings:** thumbs up raises a recipe's weight, thumbs down hides it (option: forever or for 8 weeks). Optional reason chips after thumbs down: too expensive, too much work, not tasty, portion too small.
- **On sale:** prefer recipes whose main ingredients are on sale today.
- Algorithm: generate candidates per slot, greedy fill, then local search (swap and replace moves) on a score combining cost, nutrition, reuse, variety, ratings, sales. Must run on the phone in under 2 seconds. Deterministic with a seed so "Regenerate" gives a new plan.
- **Swap** any single meal (unlimited), keeping the rest of the plan and updating costs and the shopping list.

Write unit tests for: package cost and leftovers, budget limit, nutrition aggregation, reuse bonus, swap.

## 6. Screens

Bottom tab bar: **Plan, Recipes, Shopping, Pantry**, with Settings from the Plan header.

- **Onboarding** (first launch): people, budget, meals to plan, stores (pick a chain, then search the nearest store by city), dislikes, diet. Can be changed later in Settings.
- **Plan:** budget card (spent of budget, money left, data date and chain), today's meals card with "Start cooking" and "Swap", week list grouped by day with meal type, time, kcal and cost per meal ("cost per day = ingredients that meal uses"), Nutrition check card, Left at home card with "Save to pantry", Deals today card.
- **Recipe detail:** illustration, time, kcal, cost per serving, ingredients scaled to the plan's people (with which product and store it comes from), steps, nutrition table, thumbs up/down, personal notes, "Add to this week".
- **Cooking mode:** one step per screen, large text, screen kept awake, timers where the step mentions a time.
- **Recipes:** search by recipe or ingredient, tabs for meal type, filters: For you, On sale, Under 30 min, Favourites, Cuisine, Vegetarian.
- **Shopping:** grouped by store, then by aisle category, checkboxes, quantity and package to buy, price, total per store. Items already in the pantry are listed separately as "You have this".
- **Pantry (visual, a real pantry):** three tabs, **Fridge, Shelves, Freezer**. Items sit on illustrated shelves as small tiles (icon by package type: jar, box, bag, bottle, can, pack; colour by food), each with name, amount and a fill bar. See section 6b.
- **Pantry quick add:** chips for staples (oil, salt, pepper, sugar, flour, rice, pasta, eggs, onion, garlic, milk, butter), free search add with quantity, and "Add my shopping" which moves everything ticked in the Shopping list into the pantry in one tap.
- **Settings:** everything from onboarding, plus energy target, weekday time limit, "New dish each week", "Cook once eat twice", backup export/import, data sources and dates, about.

## 6b. Living pantry (how it works)

- **Fills itself:** ticking items in the Shopping list, then "Add my shopping", puts them on the right shelf (fridge, shelves or freezer, from the ingredient's category) with the package amount bought.
- **Empties itself:** "Mark cooked" on a meal subtracts that recipe's ingredient amounts (scaled to the people cooked for). Show a confirmation card listing what was taken ("300 g chicken, 150 g quinoa...") with **Undo**. An item that reaches zero disappears from the shelf.
- **Manual edits:** tap a tile to adjust the amount with a slider or plus/minus, move it to another section, or remove it. Long press to mark "finished".
- **Use soon:** fresh items get a default shelf life per ingredient (editable). Items close to expiry get an orange bar, a "Use soon" card at the top, and the planner uses them first.
- **Running low:** staples below a threshold get an orange bar and are suggested for the next shopping list.
- **Planner link:** the planner always subtracts what is in the pantry before building the shopping list ("You have this").
- Keep it simple: amounts are approximate, the app never nags. A "Check my pantry" button once a week shows all items in a list to confirm or fix quickly.

## 6c. Extra features (all confirmed by Ivan; build after the core, in this order)

1. **Real deal check:** the price files include the lowest price in the last 30 days and the anchor price. Show a "Real deal" badge only when today's sale price is actually the lowest, and "Not really a deal" when a "sale" price is higher than the 30-day lowest.
2. **Croatian seasonal produce:** a month-by-month list (for example November: mandarins, chestnuts, kale, cabbage, pumpkin). Seasonal produce gets a bonus in the planner and a "In season" chip.
3. **Shopping mode in the store:** big checkboxes, items sorted in a typical aisle order, running total of what is in the basket, works offline.
4. **Share the shopping list** via the iPhone share sheet (WhatsApp, Messages) as clean text with quantities and the store.
5. **Meal prep Sunday:** optional plan that batches cooking (cook grains and sauces once, use them in 3 meals) and shows a one-hour prep timeline.
6. **Reminders** (web push, works for home-screen apps on iOS 16.4+): "Defrost the hake tonight", "Soak the chickpeas", "Chicken expires tomorrow". Off by default, each type switchable.
7. **Weekly recap:** spent vs budget, money saved from sales, how many meals cooked, food thrown away (one tap "I threw this away" on a pantry item), favourite new dish.
8. **"I don't have X":** in a recipe, tap an ingredient to see substitutes that you have in the pantry, and the plan cost updates.
9. **Barcode scan** to add an item to the pantry (camera + a JS barcode library; barcodes are in the price files, so the product and package size are known).

## 7. Design: "Sunset Night" (chosen)

Dark, neon-sunset style. Own identity: no game or brand logos, lettering or characters.

| Token | Hex | Use |
|---|---|---|
| bg | #140B24 | App background (deep night purple), with a soft radial pink glow at the top of screens |
| surface | #1F1433 | Cards, tiles, tab bar background |
| surface-2 | #2A1650 | Illustration areas |
| border | #33224D | Card borders, dividers |
| text | #FFF1F7 | Main text |
| muted | #B9A8D0 | Secondary text (passes 4.5:1 on surface) |
| pink (primary) | #FF4FA3 | Primary buttons, active tab, key actions (dark text #140B24 on it), soft glow shadow |
| orange | #FF9A3C | Second half of the sunset gradient, "use soon", "running low", warnings |
| teal | #3DE3D0 | On sale, health checks passed, success, secondary buttons (outline) |
| purple | #9B5CFF | "New dish" badge (dark text on it) |

- **Budget card:** linear gradient 120deg from pink #FF4FA3 to orange #FF9A3C, dark text #140B24, dark progress bar.
- **Type:** Space Grotesk (headings, prices, numbers), Inter (body). Prices large and bold.
- **Shapes:** 24 px card radius, 14 to 16 px for buttons and tiles, 44 px minimum tap targets.
- **Illustrations:** simple flat SVG scenes and food icons in the palette (sunset, palm silhouettes, plates). No photos yet; leave a field for photos later.
- **Pantry shelves:** tiles sit on glowing "plank" bars (#3A2560 with a pink shadow). Fill bars teal, orange when low or expiring.
- Euro formatting with comma decimals (59,14 €). English UI, Croatian product names as they appear in the store files.
- The approved mockups are in Ivan's design canvas "Pantry Planner colour schemes" (row "Final preview"): Plan, Pantry shelves, Recipes, Recipe detail, "I don't have X" swap sheet, Cooking mode, Shopping mode (with Real deal and Not really a deal labels, basket total, Add basket to my pantry), Meal prep Sunday timeline, Weekly recap, Barcode scan, Settings with reminders. Ask Ivan to share the canvas link or screenshots, and match them.

## 8. Quality

- CI: lint, type check, unit tests, recipe validation, a pipeline dry run on a small fixture.
- Lighthouse PWA check passes. Test at iPhone sizes (375 and 430 px wide).
- If prices for a chain are older than today, show it clearly ("Plodine prices from 18 Nov").

## 9. What Ivan must do (explain these step by step when you reach them)

1. Create a GitHub account and connect it to Claude.
2. Create an empty public repository (suggested name `pantry-planner`), and start a Claude Code session on it.
3. After milestone 1: in the repo go to Settings, Pages, set Source to "GitHub Actions".
4. After milestone 5: open the site link in Safari on the iPhone, tap Share, Add to Home Screen.

## 10. Milestones

1. **Repo setup and price pipeline:** project skeleton, ingredients list (first 100 entries), pipeline with fallbacks, store list output, Pages deploy of a simple "data status" page showing each chain's date and sample prices. Ivan checks a few prices against the shelf or the store site.
2. **Ingredients and recipes:** full ingredients list with nutrition, 150 recipes, validation script, nutrition calculation.
3. **Planner engine** with tests.
4. **App screens:** onboarding, Plan, Recipes, Recipe detail, Cooking mode, Shopping, Pantry, Settings, ratings, backup.
5. **Living pantry** (section 6b): shelves, add from shopping, subtract on cooking with undo, use soon, running low.
6. **Polish and install:** offline mode, iPhone testing, install guide for Ivan, short README on how to ask for new recipes and features.
7. **Extra features** (section 6c), one at a time, in the listed order.
