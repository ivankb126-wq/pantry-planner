# Pantry Planner

A personal meal-planning web app for Croatia. It plans a week of meals for a
number of people and a weekly budget, using real daily prices from Lidl,
Kaufland, Konzum, Spar and Plodine. The full plan is in [SPEC.md](SPEC.md).

Status: **milestone 1** (price pipeline and a data status page).

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
| `src/` | The web app |
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

Price data comes from the shops' official price lists, collected by
[cijene.dev](https://github.com/senko/cijene-api) (free for non-commercial
use). This is a personal, non-commercial project. Price data is never
committed to this repository; it is built into the published site.
