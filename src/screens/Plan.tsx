// Plan: budget, today's meal, the week, nutrition, leftovers and deals.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { newPlan, restorePlan, saveLeftovers, swap } from '../app/actions';
import { INGREDIENTS, RECIPE_BY_ID, ingName } from '../app/catalog';
import { saleIngredient } from '../app/costs';
import { planProblem, planResult, todayIndex } from '../app/planning';
import { activeStores, type PriceData } from '../app/prices';
import { go } from '../app/router';
import { type AppData, type Settings, update, useApp } from '../app/state';
import { daysBetween, formatAmount, formatEur, formatShortDate, zagrebToday } from '../lib/format';
import type { Check, MealView, PlanResult } from '../planner/types';
import { IconCheck, IconDown, IconFlame, IconSettings, IconSwap } from '../ui/icons';
import { DishArt, Screen, Sheet, Toast } from '../ui/kit';
import { SLOT_LABEL, dayLong, dayNum, dayShort, minutes, plural } from '../ui/words';
import { CHAIN_NAME, StoreModePicker } from './pickers';

export interface PriceState {
  data: PriceData | null;
  error: string | null;
}

export function storeSummary(s: Settings): string {
  const st = activeStores(s);
  if (!st.length) return 'No store';
  if (st.length === 1) return st[0].label;
  return st.map((x) => CHAIN_NAME[x.chain]).join(' + ');
}

/** The oldest price date of the stores in use, and whether it is old. */
export function priceAge(prices: PriceData): { date: string | null; old: boolean; label: string } {
  const entries = Object.entries(prices.dates);
  if (!entries.length) return { date: null, old: false, label: '' };
  entries.sort((a, b) => a[1].localeCompare(b[1]));
  const [store, date] = entries[0];
  const old = daysBetween(date, zagrebToday()) > 1;
  return { date, old, label: old ? `${store} prices from ${formatShortDate(date)}` : `Prices ${formatShortDate(date)}` };
}

/** Ingredients bought on sale this week. */
function saleSet(result: PlanResult): Set<string> {
  return new Set(result.shopping.filter((l) => l.onSale).map((l) => l.ingredient));
}

export function mealOnSale(recipeId: string, sale: Set<string>): string | null {
  const r = RECIPE_BY_ID.get(recipeId);
  return r ? saleIngredient(r, { best: new Map(), sale }) : null;
}

export function PlanScreen({ prices }: { prices: PriceState }) {
  const d = useApp();
  const data = prices.data;
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [storeSheet, setStoreSheet] = useState(false);
  const problem = planProblem(d);

  const make = () => {
    if (!data || busy) return;
    setBusy(true);
    // Let the "Planning your week" card paint before the planner runs.
    setTimeout(() => {
      const before = newPlan(data);
      setBusy(false);
      if (before) setToast({ text: 'New plan made.', undo: () => restorePlan(before) });
    }, 30);
  };

  useEffect(() => {
    if (data && problem === 'none') make();
  }, [data, problem]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const result = data && d.plan && !busy ? planResult(d, data) : null;
  const doSwap = (index: number) => {
    if (!data || !d.plan) return;
    const before = d.plan;
    const old = RECIPE_BY_ID.get(before.meals[index].recipeId)?.title ?? 'meal';
    swap(data, index);
    setToast({ text: `${old} swapped.`, undo: () => restorePlan(before) });
  };

  return (
    <Screen glow="pink">
      <header class="plan-head">
        <div>
          <p class="kicker">{d.plan ? `Week of ${formatShortDate(d.plan.startDate)}` : 'Your week'}</p>
          <h1>This week</h1>
        </div>
        <a class="icon-btn big" href="#/settings" aria-label="Settings">
          <IconSettings />
        </a>
      </header>

      {prices.error && (
        <div class="notice warn" role="alert">
          {prices.error}
        </div>
      )}

      {problem === 'settings' && !busy && data && (
        <div class="notice">
          <span class="grow">Your settings changed since this plan was made.</span>
          <button class="btn-small" onClick={make}>
            New plan
          </button>
        </div>
      )}
      {problem === 'over' && !busy && data && (
        <div class="notice">
          <span class="grow">This week's plan is over.</span>
          <button class="btn-small" onClick={make}>
            Plan next week
          </button>
        </div>
      )}

      {!result || !d.plan ? (
        <div class="card loading-card" aria-busy="true">
          <div class="spinner" aria-hidden="true" />
          <p>{busy || (data && problem === 'none') ? 'Planning your week...' : 'Loading prices...'}</p>
        </div>
      ) : (
        <PlanBody d={d} data={data!} result={result} onSwap={doSwap} onStore={() => (d.settings.stores.length > 1 ? setStoreSheet(true) : go('settings/stores'))} onNewPlan={make} />
      )}

      {storeSheet && (
        <Sheet title="Where to shop" sub="Prices and the shopping list follow this choice." onClose={() => setStoreSheet(false)}>
          <StoreModePicker
            s={d.settings}
            onChange={(p) => {
              update((x) => {
                x.settings = { ...x.settings, ...p };
              });
              setStoreSheet(false);
            }}
          />
        </Sheet>
      )}
      {toast && (
        <Toast
          action={toast.undo ? 'Undo' : undefined}
          onAction={() => {
            toast.undo?.();
            setToast(null);
          }}
        >
          {toast.text}
        </Toast>
      )}
    </Screen>
  );
}

function PlanBody({ d, data, result, onSwap, onStore, onNewPlan }: { d: AppData; data: PriceData; result: PlanResult; onSwap: (i: number) => void; onStore: () => void; onNewPlan: () => void }) {
  const plan = d.plan!;
  const sale = useMemo(() => saleSet(result), [result]);
  const t = todayIndex(plan);
  return (
    <>
      <BudgetCard d={d} data={data} result={result} onStore={onStore} />
      <TodayCard d={d} result={result} t={t} sale={sale} onSwap={onSwap} />
      <CheckChips checks={result.checks} />
      <WeekList d={d} result={result} t={t} sale={sale} />
      <NutritionCard checks={result.checks} />
      <LeftAtHome d={d} result={result} />
      <DealsCard data={data} />
      <button class="btn-ghost wide" onClick={onNewPlan}>
        <IconSwap size={20} /> Make a new plan
      </button>
      <p class="fineprint">
        Costs are what you pay for whole packages. Each meal's cost is the part of the food it uses. Orientation prices from the official daily price lists.
      </p>
    </>
  );
}

function BudgetCard({ d, data, result, onStore }: { d: AppData; data: PriceData; result: PlanResult; onStore: () => void }) {
  const age = priceAge(data);
  const pct = Math.min(100, (result.cost / Math.max(1, result.budget)) * 100);
  const over = result.cost > result.budget;
  const items = result.shopping.length;
  const estimated = result.estimatedPrices.length;
  return (
    <section class="budget-card" aria-label="Budget">
      <div class="budget-top">
        <button class="store-pill" onClick={onStore}>
          {storeSummary(d.settings)} <IconDown size={16} />
        </button>
        <span class={age.old ? 'stale' : ''}>{age.label}</span>
      </div>
      <div class="budget-big">
        <span class="amount">{formatEur(result.cost)}</span>
        <span class="of">of {formatEur(result.budget)}</span>
      </div>
      <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Budget used">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div class="budget-foot">
        <strong>{over ? `${formatEur(result.cost - result.budget)} over budget` : `${formatEur(result.moneyLeft)} left`}</strong>
        <a href="#/shopping">{plural(items, 'item', 'items')} to buy</a>
      </div>
      {estimated > 0 && <p class="budget-note">{plural(estimated, 'item uses', 'items use')} a typical price, because your store does not list it today.</p>}
    </section>
  );
}

function featuredIndex(views: MealView[], t: number, cooked: number[]): number {
  const today = views.map((v, i) => ({ v, i })).filter(({ v }) => v.day === t);
  if (!today.length) return -1;
  const rank = { dinner: 0, lunch: 1, breakfast: 2, dessert: 3, snack: 4 };
  const open = today.filter(({ i }) => !cooked.includes(i));
  const pick = (open.length ? open : today).sort((a, b) => {
    // Prefer the next meal to cook, then dinner.
    if (a.v.leftover !== b.v.leftover) return a.v.leftover ? 1 : -1;
    return rank[a.v.slot] - rank[b.v.slot];
  });
  return pick[0].i;
}

function TodayCard({ d, result, t, sale, onSwap }: { d: AppData; result: PlanResult; t: number; sale: Set<string>; onSwap: (i: number) => void }) {
  const plan = d.plan!;
  if (t < 0 || t > 6) return null;
  const i = featuredIndex(result.views, t, plan.cooked);
  if (i < 0) return null;
  const v = result.views[i];
  const r = RECIPE_BY_ID.get(v.recipeId)!;
  const saleName = mealOnSale(v.recipeId, sale);
  const cooked = plan.cooked.includes(i);
  const others = result.views.map((x, j) => ({ x, j })).filter(({ x, j }) => x.day === t && j !== i);
  const from = v.leftover ? plan.meals[i].from : undefined;
  return (
    <section class="today-card" aria-label="Today">
      <DishArt emoji={r.illustration} height={104}>
        <div class="art-badges">
          <span class="tag light">Today, {dayLong(v.date)}</span>
          {saleName && <span class="tag teal">On sale</span>}
        </div>
      </DishArt>
      <div class="today-body">
        <a class="today-title" href={`#/recipe/${v.recipeId}?meal=${i}`}>
          {v.title}
        </a>
        <p class="meta">
          {SLOT_LABEL[v.slot]} · {v.leftover ? `leftovers from ${from != null ? dayLong(result.views[from].date) : 'earlier'}` : minutes(v.minutes)} · {v.kcal} kcal
          {!v.leftover && v.cost > 0 && ` · ${formatEur(v.cost / Math.max(1, v.portions))} per person`}
        </p>
        <div class="today-actions">
          {cooked ? (
            <span class="done-label">
              <IconCheck size={18} /> Cooked
            </span>
          ) : v.leftover ? (
            <a class="btn-primary grow" href={`#/recipe/${v.recipeId}?meal=${i}`}>
              Heat and eat
            </a>
          ) : (
            <a class="btn-primary grow" href={`#/cook/${v.recipeId}?meal=${i}`}>
              <IconFlame size={20} /> Start cooking
            </a>
          )}
          <button class="btn-teal-outline square" aria-label={`Swap ${v.title}`} onClick={() => onSwap(i)}>
            <IconSwap />
          </button>
        </div>
        {others.length > 0 && (
          <ul class="also-today">
            {others.map(({ x, j }) => (
              <li key={j}>
                <a href={`#/recipe/${x.recipeId}?meal=${j}`}>
                  <span class="slot">{SLOT_LABEL[x.slot]}</span>
                  <span class="grow">{x.title}</span>
                  {plan.cooked.includes(j) && <IconCheck size={16} />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CheckChips({ checks }: { checks: Check[] }) {
  const get = (id: string) => checks.find((c) => c.id === id);
  const protein = get('protein');
  const fibre = get('fibre');
  const veg = get('veg');
  return (
    <div class="check-chips" aria-label="Nutrition at a glance">
      {protein && <span class={`check-chip ${protein.ok ? 'ok' : 'warn'}`}>Protein {protein.ok ? '✓' : 'low'}</span>}
      {fibre && <span class={`check-chip ${fibre.ok ? 'ok' : 'warn'}`}>Fibre {fibre.ok ? '✓' : 'low'}</span>}
      {veg && (
        <span class={`check-chip ${veg.ok ? 'ok' : 'warn'}`}>
          Veg {Math.round(veg.value * 10) / 10} a day {veg.ok ? '✓' : ''}
        </span>
      )}
    </div>
  );
}

function WeekList({ d, result, t, sale }: { d: AppData; result: PlanResult; t: number; sale: Set<string> }) {
  const plan = d.plan!;
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <section class="card week" aria-label="The week">
      <h2>The week</h2>
      {days.map((day) => {
        const meals = result.views.map((v, i) => ({ v, i })).filter(({ v }) => v.day === day);
        if (!meals.length) return null;
        const date = meals[0].v.date;
        const dayCost = meals.reduce((s, m) => s + m.v.cost, 0);
        return (
          <div key={day} class={`day-block${day === t ? ' today' : ''}${day < t ? ' past' : ''}`}>
            <div class="day-col" aria-label={dayLong(date)}>
              <span>{dayShort(date)}</span>
              <strong>{dayNum(date)}</strong>
            </div>
            <ul class="day-meals">
              {meals.map(({ v, i }) => {
                const cooked = plan.cooked.includes(i);
                return (
                  <li key={i}>
                    <a href={`#/recipe/${v.recipeId}?meal=${i}`} class={cooked ? 'cooked' : ''}>
                      <span class="grow">
                        <span class="meal-title">
                          {cooked && <IconCheck size={15} />} {v.title}
                        </span>
                        <span class="meal-meta">
                          {SLOT_LABEL[v.slot]} · {v.leftover ? 'leftovers' : minutes(v.minutes)} · {v.kcal} kcal
                          {v.newDish && d.history.length >= 5 && <span class="tag purple">New</span>}
                          {!v.leftover && mealOnSale(v.recipeId, sale) && <span class="tag teal">Sale</span>}
                        </span>
                      </span>
                      <span class="meal-cost">{v.leftover ? '' : formatEur(v.cost)}</span>
                    </a>
                  </li>
                );
              })}
              <li class="day-total">
                <span class="grow">Day</span>
                <span>{formatEur(dayCost)}</span>
              </li>
            </ul>
          </div>
        );
      })}
    </section>
  );
}

const CHECK_UNIT: Record<string, (v: number) => string> = {
  energy: (v) => `${Math.round(v)} kcal`,
  protein: (v) => `${Math.round(v)} g`,
  fibre: (v) => `${Math.round(v)} g`,
  veg: (v) => `${Math.round(v * 10) / 10} portions`,
  sugar: (v) => `${Math.round(v)} g`,
  salt: (v) => `${Math.round(v * 10) / 10} g`,
  fish: (v) => plural(v, 'time', 'times'),
  'red-meat': (v) => plural(v, 'time', 'times'),
  plant: (v) => plural(v, 'time', 'times'),
};

function NutritionCard({ checks }: { checks: Check[] }) {
  const ok = checks.filter((c) => c.ok).length;
  return (
    <section class="card" aria-label="Nutrition check">
      <div class="card-head">
        <h2>Nutrition check</h2>
        <span class={`count ${ok === checks.length ? 'ok' : 'warn'}`}>
          {ok} of {checks.length}
        </span>
      </div>
      <p class="sub">Per person per day, averaged over the week. General healthy eating guidance, not medical advice.</p>
      <ul class="checks">
        {checks.map((c) => (
          <li key={c.id}>
            <span class={`mark ${c.ok ? 'ok' : 'warn'}`} aria-label={c.ok ? 'Good' : 'Could be better'}>
              {c.ok ? '✓' : '!'}
            </span>
            <span class="grow">
              {c.label}
              <small>{c.target}</small>
            </span>
            <span class="val">{(CHECK_UNIT[c.id] ?? ((v: number) => String(v)))(c.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Leftovers worth mentioning (not 10 g of bread). */
function worthKeeping(l: { ingredient: string; amount: number }): boolean {
  const ing = INGREDIENTS[l.ingredient];
  if (!ing) return false;
  if (ing.unit === 'piece') return l.amount >= 1;
  return l.amount >= (ing.category === 'spices' ? 10 : 40);
}

function LeftAtHome({ d, result }: { d: AppData; result: PlanResult }) {
  const leftovers = result.leftovers.filter(worthKeeping);
  if (!leftovers.length) return null;
  const saved = !!d.plan?.leftoversSaved;
  return (
    <section class="card" aria-label="Left at home">
      <h2>Left at home</h2>
      <p class="sub">Shops sell whole packages, so after this week you will still have these. Save them and next week's plan uses them first.</p>
      <div class="chip-wrap static">
        {leftovers.map((l) => (
          <span key={l.ingredient} class="pill static">
            {ingName(l.ingredient)} <small>{formatAmount(roundLeft(l.amount, INGREDIENTS[l.ingredient]?.unit ?? 'g'), INGREDIENTS[l.ingredient]?.unit ?? 'g')}</small>
          </span>
        ))}
      </div>
      {saved ? (
        <p class="saved-line">
          <IconCheck size={18} /> Saved to your pantry
        </p>
      ) : (
        <button class="btn-teal-outline wide" onClick={() => saveLeftovers({ ...result, leftovers })}>
          Save to pantry
        </button>
      )}
    </section>
  );
}

function roundLeft(n: number, unit: 'g' | 'ml' | 'piece'): number {
  if (unit === 'piece') return Math.round(n * 2) / 2;
  return n >= 100 ? Math.round(n / 10) * 10 : Math.round(n / 5) * 5;
}

function DealsCard({ data }: { data: PriceData }) {
  const multi = data.stores.length > 1;
  const deals = useMemo(() => {
    const best = new Map<string, PriceData['deals'][number]>();
    for (const it of data.deals) {
      if (it.salePrice == null || !(it.price > it.salePrice)) continue;
      const cur = best.get(it.ingredient);
      const pct = 1 - it.salePrice / it.price;
      if (!cur || pct > 1 - cur.salePrice! / cur.price) best.set(it.ingredient, it);
    }
    return [...best.values()].sort((a, b) => a.salePrice! / a.price - b.salePrice! / b.price).slice(0, 6);
  }, [data]);
  if (!deals.length) return null;
  return (
    <section class="card" aria-label="Deals today">
      <h2>Deals today</h2>
      <p class="sub">On sale in your {multi ? 'stores' : 'store'} right now. The planner already prefers these.</p>
      <ul class="deals">
        {deals.map((it) => (
          <li key={`${it.store}${it.ingredient}`}>
            <span class="grow">
              <strong>{ingName(it.ingredient)}</strong>
              <small>
                {it.name}
                {multi ? ` · ${it.store}` : ''}
              </small>
            </span>
            <span class="deal-price">
              <strong>{formatEur(it.salePrice!)}</strong>
              <s>{formatEur(it.price)}</s>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
