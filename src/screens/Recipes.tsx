// Recipes: search, meal type tabs, filters and a two-column grid.

import { useMemo, useState } from 'preact/hooks';
import { CUISINE_LABEL, FAMILY_LABEL, INGREDIENTS, RECIPES } from '../app/catalog';
import { priceIndex, saleIngredient, servingCost } from '../app/costs';
import { photoFor, usePhotos } from '../app/photos';
import { useApp } from '../app/state';
import { formatEur, zagrebToday } from '../lib/format';
import { dietAllows } from '../lib/nutrition';
import { monthOf, seasonalIngredients } from '../lib/seasons';
import type { PlannerRecipe } from '../planner/types';
import { IconHeart, IconSearch } from '../ui/icons';
import { Chip, DishArt, Screen, Segmented, Sheet } from '../ui/kit';
import { minutes } from '../ui/words';
import type { PriceState } from './Plan';
import { storeSummary } from './Plan';
import { fold } from './pickers';

type Tab = 'main' | 'breakfast' | 'dessert' | 'snack';
type Filter = 'foryou' | 'sale' | 'season' | 'quick' | 'favourites' | 'vegetarian';

const TABS: { id: Tab; label: string }[] = [
  { id: 'main', label: 'Dinner' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'snack', label: 'Snacks' },
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'sale', label: 'On sale' },
  { id: 'season', label: 'In season' },
  { id: 'quick', label: 'Under 30 min' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'vegetarian', label: 'Vegetarian' },
];

function inTab(r: PlannerRecipe, tab: Tab): boolean {
  if (tab === 'main') return r.mealTypes.includes('lunch') || r.mealTypes.includes('dinner');
  return r.mealTypes.includes(tab);
}

// Remember the browsing state while the app is open.
const memory: { tab: Tab; filter: Filter; q: string; cuisine: string | null; family: string | null } = {
  tab: 'main',
  filter: 'foryou',
  q: '',
  cuisine: null,
  family: null,
};

export function RecipesScreen({ prices }: { prices: PriceState }) {
  const d = useApp();
  usePhotos();
  const [tab, setTab] = useState<Tab>(memory.tab);
  const [filter, setFilter] = useState<Filter>(memory.filter);
  const [q, setQ] = useState(memory.q);
  const [cuisine, setCuisine] = useState<string | null>(memory.cuisine);
  const [cuisineSheet, setCuisineSheet] = useState(false);
  const [familyState, setFamily] = useState<string | null>(memory.family);
  // Kinds of dish in this tab (pasta, soups... for dinner; porridge, eggs... for breakfast).
  const families = Object.keys(FAMILY_LABEL).filter((f) => RECIPES.some((r) => r.family === f && inTab(r, tab)));
  const family = familyState && families.includes(familyState) ? familyState : null;
  Object.assign(memory, { tab, filter, q, cuisine, family });

  const idx = prices.data ? priceIndex(prices.data) : null;
  const today = zagrebToday();
  const month = monthOf(today);
  const hidden = new Set(d.ratings.filter((r) => !r.up && (r.until == null || r.until > today)).map((r) => r.recipeId));
  const liked = new Set([...d.ratings.filter((r) => r.up).map((r) => r.recipeId), ...d.favourites]);
  const cooked = new Set(d.history.map((h) => h.recipeId));

  const list = useMemo(() => {
    const words = fold(q.trim()).split(/\s+/).filter(Boolean);
    const out = RECIPES.filter((r) => {
      if (!dietAllows(d.settings.diet, r.facts.diet)) return false;
      if (words.length) {
        const hay = fold(
          `${r.title} ${r.ingredients.map((i) => INGREDIENTS[i.id]?.name ?? '').join(' ')} ${CUISINE_LABEL[r.cuisine] ?? ''} ${FAMILY_LABEL[r.family] ?? ''}`,
        );
        if (!words.every((w) => hay.includes(w))) return false;
      } else if (!inTab(r, tab)) return false;
      if (cuisine && r.cuisine !== cuisine) return false;
      if (family && !words.length && r.family !== family) return false;
      switch (filter) {
        case 'foryou':
          if (hidden.has(r.id)) return false;
          if (r.ingredients.some((i) => !i.optional && d.settings.dislikes.includes(i.id))) return false;
          return true;
        case 'sale':
          return !!idx && !!saleIngredient(r, idx);
        case 'season':
          return seasonalIngredients(r, INGREDIENTS, month).length > 0;
        case 'quick':
          return r.facts.totalMinutes <= 30;
        case 'favourites':
          return d.favourites.includes(r.id);
        case 'vegetarian':
          return r.facts.diet === 'vegetarian' || r.facts.diet === 'vegan';
      }
      return true;
    });
    const cost = (r: PlannerRecipe) => (idx ? (servingCost(r, idx) ?? 99) : 0);
    if (filter === 'foryou') {
      const rank = (r: PlannerRecipe) => (liked.has(r.id) ? -3 : 0) + (idx && saleIngredient(r, idx) ? -1 : 0) + (seasonalIngredients(r, INGREDIENTS, month).length ? -0.5 : 0) + cost(r) * 0.4;
      out.sort((a, b) => rank(a) - rank(b));
    } else out.sort((a, b) => cost(a) - cost(b));
    return out;
  }, [q, tab, filter, cuisine, family, idx, d.ratings, d.favourites, d.settings.diet, d.settings.dislikes]);

  const cuisines = Object.keys(CUISINE_LABEL).filter((c) => RECIPES.some((r) => r.cuisine === c));

  return (
    <Screen glow="purple">
      <header class="page-head">
        <h1>Recipes</h1>
        <p class="sub">
          {RECIPES.length} recipes · prices from {storeSummary(d.settings)}
        </p>
      </header>

      <label class="search big">
        <IconSearch size={20} />
        <input type="search" placeholder="Search a dish or an ingredient" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search recipes" />
      </label>

      {!q && <Segmented label="Meal type" options={TABS} value={tab} onChange={setTab} />}

      {!q && families.length > 1 && (
        <div class="filter-row family-row" role="group" aria-label="Kind of dish">
          <Chip on={!family} onClick={() => setFamily(null)}>
            All
          </Chip>
          {families.map((f) => (
            <Chip key={f} on={family === f} onClick={() => setFamily(family === f ? null : f)}>
              {FAMILY_LABEL[f]}
            </Chip>
          ))}
        </div>
      )}

      <div class="filter-row" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
        <Chip on={!!cuisine} onClick={() => setCuisineSheet(true)}>
          {cuisine ? CUISINE_LABEL[cuisine] : 'Cuisine'}
        </Chip>
      </div>

      {list.length ? (
        <ul class="recipe-grid">
          {list.map((r) => {
            const c = idx ? servingCost(r, idx) : null;
            const sale = idx ? saleIngredient(r, idx) : null;
            return (
              <li key={r.id}>
                <a href={`#/recipe/${r.id}`} class="recipe-card">
                  <DishArt emoji={r.illustration} height={84} photo={photoFor(r.id)?.src}>
                    <div class="art-badges">
                      {sale ? (
                        <span class="tag teal">On sale</span>
                      ) : seasonalIngredients(r, INGREDIENTS, month).length ? (
                        <span class="tag season">In season</span>
                      ) : (
                        !cooked.has(r.id) && d.history.length >= 5 && <span class="tag purple">New</span>
                      )}
                    </div>
                    {d.favourites.includes(r.id) && (
                      <span class="fav-dot" aria-label="Favourite">
                        <IconHeart size={16} filled />
                      </span>
                    )}
                  </DishArt>
                  <span class="rc-title">{r.title}</span>
                  <span class="rc-meta">
                    <span>{minutes(r.facts.totalMinutes)}</span>
                    {c != null && <span class="rc-price">{formatEur(c)}</span>}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div class="empty-card">
          <h2>No recipes found</h2>
          <p class="sub">{filter === 'favourites' ? 'Tap the heart on a recipe to keep it here.' : 'Try another word or filter.'}</p>
        </div>
      )}
      <p class="fineprint">Prices are per serving: the value of the food it uses, from your store's best value products.</p>

      {cuisineSheet && (
        <Sheet title="Cuisine" onClose={() => setCuisineSheet(false)}>
          <div class="chip-wrap">
            <Chip
              on={!cuisine}
              onClick={() => {
                setCuisine(null);
                setCuisineSheet(false);
              }}
            >
              All
            </Chip>
            {cuisines.map((c) => (
              <Chip
                key={c}
                on={cuisine === c}
                onClick={() => {
                  setCuisine(c);
                  setCuisineSheet(false);
                }}
              >
                {CUISINE_LABEL[c]}
              </Chip>
            ))}
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
