// Shopping list: by store, then by aisle. Tick items as they go in the basket.

import { useState } from 'preact/hooks';
import { AISLE_LABEL, AISLE_ORDER, INGREDIENTS, ingName } from '../app/catalog';
import { addToPantry, planResult } from '../app/planning';
import { update, useApp } from '../app/state';
import { formatAmount, formatEur } from '../lib/format';
import { ESTIMATE } from '../planner/evaluate';
import type { ShoppingLine } from '../planner/types';
import { IconCheck } from '../ui/icons';
import { Empty, Screen, Segmented, Toast, useToast } from '../ui/kit';
import type { PriceState } from './Plan';

export function lineKey(l: ShoppingLine): string {
  return `${l.store}|${l.ingredient}|${l.product}|${l.size}`;
}

/** "2 × 500 g", "about 1,2 kg" (loose), "1 × 10 pcs" */
export function lineQuantity(l: ShoppingLine): string {
  const unit = INGREDIENTS[l.ingredient]?.unit ?? 'g';
  if (l.loose) return `about ${formatAmount(Math.round(l.amount), unit)}`;
  return `${l.packs} × ${formatAmount(l.size, unit)}`;
}

function storeName(s: string): string {
  return s === ESTIMATE ? 'Any store (typical price)' : s;
}

function tabName(s: string): string {
  return s === ESTIMATE ? 'Other' : s.split(' ')[0];
}

export function ShoppingScreen({ prices }: { prices: PriceState }) {
  const d = useApp();
  const result = prices.data && d.plan ? planResult(d, prices.data) : null;
  const [tab, setTab] = useState('all');
  const [toast, setToast] = useToast<string>();

  if (!d.plan || !result) {
    return (
      <Screen glow="teal">
        <header class="page-head">
          <h1>Shopping</h1>
        </header>
        {d.plan ? (
          <div class="card loading-card" aria-busy="true">
            <div class="spinner" aria-hidden="true" />
            <p>Loading prices...</p>
          </div>
        ) : (
          <Empty title="No plan yet" action="Go to my plan" onAction={() => (location.hash = '#/plan')}>
            Your shopping list appears when you have a plan.
          </Empty>
        )}
      </Screen>
    );
  }

  const checked = d.shoppingChecked;
  const stores = [...new Set(result.shopping.map((l) => l.store))].sort((a, b) => (a === ESTIMATE ? 1 : b === ESTIMATE ? -1 : a.localeCompare(b)));
  const shown = tab === 'all' ? stores : stores.filter((s) => s === tab);
  const lines = result.shopping.filter((l) => shown.includes(l.store));
  const inBasket = lines.filter((l) => checked[lineKey(l)]);
  const basketCost = inBasket.reduce((s, l) => s + l.cost, 0);
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const pct = lines.length ? (inBasket.length / lines.length) * 100 : 0;

  const toggle = (l: ShoppingLine) =>
    update((x) => {
      const k = lineKey(l);
      if (x.shoppingChecked[k]) delete x.shoppingChecked[k];
      else x.shoppingChecked[k] = true;
    });

  const addBasket = () => {
    const items = inBasket.map((l) => ({ ingredient: l.ingredient, amount: l.loose ? l.amount : l.packs * l.size }));
    update((x) => {
      x.pantry = addToPantry(x.pantry, items);
      for (const l of inBasket) {
        delete x.shoppingChecked[lineKey(l)];
        x.shoppingChecked[`bought|${lineKey(l)}`] = true;
      }
    });
    setToast(`${inBasket.length} items added to your pantry.`);
  };

  const bought = (l: ShoppingLine) => !!checked[`bought|${lineKey(l)}`];

  return (
    <Screen glow="teal">
      <header class="page-head">
        <h1>Shopping</h1>
        <p class="sub">
          {lines.length} items · {formatEur(total)}
        </p>
      </header>

      {stores.length > 1 && <Segmented label="Store" options={[{ id: 'all', label: 'All' }, ...stores.map((s) => ({ id: s, label: tabName(s) }))]} value={tab} onChange={setTab} />}

      {shown.map((store) => {
        const sl = result.shopping.filter((l) => l.store === store);
        const groups = AISLE_ORDER.map((a) => ({ a, items: sl.filter((l) => (INGREDIENTS[l.ingredient]?.category ?? 'other') === a) })).filter((g) => g.items.length);
        const other = sl.filter((l) => !AISLE_ORDER.includes(INGREDIENTS[l.ingredient]?.category ?? 'other'));
        if (other.length) groups.push({ a: 'other', items: other });
        const storeTotal = sl.reduce((s, l) => s + l.cost, 0);
        return (
          <section key={store} class="card shop-store">
            <div class="card-head">
              <h2>{storeName(store)}</h2>
              <span class="store-total">{formatEur(storeTotal)}</span>
            </div>
            {store === ESTIMATE && <p class="sub">Your store does not list these today, so the price is a typical one.</p>}
            {groups.map((g) => (
              <div key={g.a} class="aisle">
                <h3>{AISLE_LABEL[g.a] ?? 'Other'}</h3>
                <ul class="shop-list">
                  {g.items.map((l) => {
                    const on = !!checked[lineKey(l)] || bought(l);
                    return (
                      <li key={lineKey(l)}>
                        <label class={`shop-row${on ? ' done' : ''}`}>
                          <input type="checkbox" checked={on} disabled={bought(l)} onChange={() => toggle(l)} />
                          <span class="box" aria-hidden="true">
                            {on && <IconCheck size={18} />}
                          </span>
                          <span class="grow">
                            <strong>{ingName(l.ingredient)}</strong>
                            <small>
                              {lineQuantity(l)} · {l.product}
                            </small>
                            {l.onSale && <span class="tag teal">On sale</span>}
                            {bought(l) && <span class="tag outline">In pantry</span>}
                          </span>
                          <span class="shop-price">{formatEur(l.cost)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {result.fromPantry.length > 0 && (
        <section class="card">
          <h2>You have this</h2>
          <p class="sub">The plan uses these from your pantry, so they are not on the list.</p>
          <ul class="have-list">
            {result.fromPantry.map((p) => (
              <li key={p.ingredient}>
                <IconCheck size={16} /> {ingName(p.ingredient)} <small>{formatAmount(Math.round(p.amount), INGREDIENTS[p.ingredient]?.unit ?? 'g')}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p class="fineprint">Prices are orientation prices from the store's official daily list. Loose fruit, veg and meat are weighed at the till.</p>

      <div class="basket-bar">
        <div class="basket-info">
          <span>
            In basket <strong>{inBasket.length}</strong> of {lines.length}
          </span>
          <strong>{formatEur(basketCost)}</strong>
        </div>
        <div class="bar teal" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        {inBasket.length > 0 && (
          <button class="btn-primary wide" onClick={addBasket}>
            Add basket to my pantry
          </button>
        )}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </Screen>
  );
}
