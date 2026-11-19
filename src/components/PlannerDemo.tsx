import { useEffect, useMemo, useState } from 'preact/hooks';
import content from '../generated/content.json';
import type { StorePrices } from '../lib/data';
import { formatAmount, formatEur, formatShortDate, zagrebToday } from '../lib/format';
import type { Diet, IngredientInfo } from '../lib/nutrition';
import { addDays } from '../planner/evaluate';
import { generatePlan, swapMeal } from '../planner/planner';
import { DEFAULT_SETTINGS, type Offer, type PlanInput, type PlanResult, type PlannerRecipe, type Slot } from '../planner/types';

// Milestone 3: a test bench for the planner engine. The real Plan screen
// (with onboarding, pantry and settings) comes in milestone 4.

const INGREDIENTS = content.ingredients as unknown as Record<string, IngredientInfo>;
const RECIPES = content.recipes as unknown as PlannerRecipe[];
const SLOTS: { id: Slot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert' },
];
const DIETS: { id: Diet | 'none'; label: string }[] = [
  { id: 'none', label: 'Everything' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
];

function nextMonday(): string {
  const today = zagrebToday();
  const [y, m, d] = today.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, ((8 - wd) % 7) || 7);
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${wd} ${formatShortDate(iso)}`;
}

interface Props {
  prices: StorePrices | null;
  storeLabel: string;
  reference: Offer[];
}

export function PlannerDemo({ prices, storeLabel, reference }: Props) {
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [budget, setBudget] = useState(100);
  const [meals, setMeals] = useState<Slot[]>(['breakfast', 'lunch', 'dinner']);
  const [diet, setDiet] = useState<Diet | 'none'>('none');
  const [seed, setSeed] = useState(1);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const [avoid, setAvoid] = useState<Record<number, string[]>>({});
  const [showShopping, setShowShopping] = useState(false);

  const input = useMemo<PlanInput | null>(() => {
    if (!prices) return null;
    return {
      recipes: RECIPES,
      ingredients: INGREDIENTS,
      offers: prices.items.map((i) => ({ ...i, store: storeLabel })),
      referenceOffers: reference,
      adults,
      children,
      budget,
      days: 7,
      startDate: nextMonday(),
      meals,
      diet,
      dislikes: [],
      pantry: [],
      ratings: [],
      history: [],
      settings: DEFAULT_SETTINGS,
      seed,
    };
  }, [prices, storeLabel, reference, adults, children, budget, meals, diet, seed]);

  // A new store or new settings make the old plan stale.
  useEffect(() => setPlan(null), [prices, adults, children, budget, meals, diet]);

  const run = (nextSeed: number) => {
    if (!input) return;
    setBusy(true);
    setAvoid({});
    // Let the "Planning..." text paint before the work starts.
    setTimeout(() => {
      const t0 = performance.now();
      const res = generatePlan({ ...input, seed: nextSeed });
      setMs(Math.round(performance.now() - t0));
      setPlan(res);
      setSeed(nextSeed);
      setBusy(false);
    }, 30);
  };

  const swap = (index: number) => {
    if (!input || !plan) return;
    const tried = [...(avoid[index] ?? []), plan.meals[index].recipeId];
    const res = swapMeal(input, plan.meals, index, { avoid: tried, seed: seed + tried.length });
    setAvoid({ ...avoid, [index]: tried });
    setPlan(res);
  };

  const toggleMeal = (s: Slot) =>
    setMeals((cur) => (cur.includes(s) ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : SLOTS.map((x) => x.id).filter((x) => x === s || cur.includes(x))));

  if (!prices) {
    return (
      <section class="card">
        <h2>Try the planner</h2>
        <p class="sub">Pick a store under "Check a few prices" first. The planner uses that store's prices.</p>
      </section>
    );
  }

  const byDay = plan ? groupByDay(plan) : [];
  const spentPct = plan ? Math.min(100, (plan.cost / Math.max(1, plan.budget)) * 100) : 0;

  return (
    <section class="card">
      <h2>Try the planner</h2>
      <p class="sub">A test bench for the planning engine with prices from {storeLabel}. The full Plan screen comes next.</p>

      <div class="form-grid">
        <Stepper label="Adults" value={adults} min={1} max={8} onChange={setAdults} />
        <Stepper label="Children" value={children} min={0} max={8} onChange={setChildren} />
        <label class="num-field">
          <span>Budget for the week</span>
          <span class="euro-input">
            <input
              type="number"
              inputMode="decimal"
              min={10}
              step={5}
              value={budget}
              onInput={(e) => setBudget(Math.max(10, Number((e.target as HTMLInputElement).value) || 10))}
            />
            <span aria-hidden="true">€</span>
          </span>
        </label>
      </div>
      <div class="chips" role="group" aria-label="Meals to plan">
        {SLOTS.map((s) => (
          <button key={s.id} class="chip" aria-pressed={meals.includes(s.id)} onClick={() => toggleMeal(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div class="chips" role="group" aria-label="Diet">
        {DIETS.map((d) => (
          <button key={d.id} class="chip" aria-pressed={diet === d.id} onClick={() => setDiet(d.id)}>
            {d.label}
          </button>
        ))}
      </div>
      <button class="primary-btn" disabled={busy} onClick={() => run(plan ? seed + 1 : seed)}>
        {busy ? 'Planning...' : plan ? 'Regenerate' : 'Plan my week'}
      </button>

      {plan && (
        <>
          <div class="card sunset-card budget-card" aria-label="Budget">
            <p class="sub">Spent of budget</p>
            <div class="big">{formatEur(plan.cost)}</div>
            <div class="bar" role="progressbar" aria-valuenow={Math.round(spentPct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${spentPct}%` }} />
            </div>
            <p class="sub">
              {plan.moneyLeft >= 0 ? `${formatEur(plan.moneyLeft)} left of ${formatEur(plan.budget)}` : `${formatEur(-plan.moneyLeft)} over budget`}
              {' · '}planned in {ms} ms
            </p>
          </div>

          {plan.warnings.map((w) => (
            <p key={w} class="warn">
              {w}
            </p>
          ))}

          <h3 class="section-title">Nutrition check</h3>
          <p class="sub">Per person per day, averaged over the week. General healthy-eating guidance, not medical advice.</p>
          <ul class="checks">
            {plan.checks.map((c) => (
              <li key={c.id} class={c.ok ? 'ok' : 'amber'}>
                <span class="check-dot" aria-hidden="true" />
                <span class="check-label">{c.label}</span>
                <span class="check-value">
                  {c.value.toLocaleString('hr-HR')} <small>({c.target})</small>
                </span>
              </li>
            ))}
          </ul>

          <h3 class="section-title">Your week</h3>
          {byDay.map(({ date, items, cost }) => (
            <div key={date} class="day-block">
              <div class="day-head">
                <span>{dayLabel(date)}</span>
                <span class="muted">{formatEur(cost)}</span>
              </div>
              <ul class="meal-list">
                {items.map(({ view, index }) => (
                  <li key={index} class="meal-row">
                    <span class="recipe-art" aria-hidden="true">
                      {view.illustration}
                    </span>
                    <span class="recipe-main">
                      <span class="meal-slot">{view.slot}</span>
                      <span class="recipe-title">
                        {view.title}
                        {view.leftover && <span class="badge loose">leftovers</span>}
                      </span>
                      <span class="recipe-meta">
                        {view.minutes} min · {view.kcal} kcal · {formatEur(view.cost)}
                      </span>
                    </span>
                    <button class="swap-btn" onClick={() => swap(index)} aria-label={`Swap ${view.title}`}>
                      Swap
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <h3 class="section-title">Shopping</h3>
          <p class="sub">
            {plan.shopping.length} items, {formatEur(plan.cost)}
            {plan.estimatedPrices.length > 0 &&
              `. ${plan.estimatedPrices.length} not in this store's price list, so a typical price is used.`}
          </p>
          <button class="link-btn" onClick={() => setShowShopping(!showShopping)}>
            {showShopping ? 'Hide the list' : 'Show the list'}
          </button>
          {showShopping && (
            <ul class="price-list">
              {plan.shopping.map((s, i) => (
                <li class="price-row" key={i}>
                  <div class="ing-name">
                    {INGREDIENTS[s.ingredient]?.name ?? s.ingredient}
                    {s.onSale && <span class="badge sale">On sale</span>}
                    {s.estimated && <span class="badge loose">estimate</span>}
                  </div>
                  <div class="price">{formatEur(s.cost)}</div>
                  <div class="product">
                    {s.estimated ? 'Not listed in this store' : s.product}
                    {s.loose
                      ? ` · ${formatAmount(s.amount, INGREDIENTS[s.ingredient].unit)}`
                      : ` · ${s.packs} × ${formatAmount(s.size, INGREDIENTS[s.ingredient].unit)}`}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {plan.leftovers.length > 0 && (
            <>
              <h3 class="section-title">Left at home</h3>
              <p class="sub">What stays from the packages after this week. The pantry will remember it in a later step.</p>
              <p class="leftover-list">
                {plan.leftovers
                  .map((l) => `${INGREDIENTS[l.ingredient]?.name ?? l.ingredient} ${formatAmount(l.amount, INGREDIENTS[l.ingredient].unit)}`)
                  .join(' · ')}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

function groupByDay(plan: PlanResult) {
  const days: { date: string; items: { view: PlanResult['views'][number]; index: number }[]; cost: number }[] = [];
  plan.views.forEach((view, index) => {
    let d = days.find((x) => x.date === view.date);
    if (!d) {
      d = { date: view.date, items: [], cost: 0 };
      days.push(d);
    }
    d.items.push({ view, index });
    d.cost += view.cost;
  });
  return days;
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div class="num-field">
      <span>{label}</span>
      <span class="stepper">
        <button aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span aria-live="polite">{value}</span>
        <button aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </span>
    </div>
  );
}
