// Shopping list: by store, then by aisle. Tick items as they go in the basket.
// Shopping mode (ShoppingMode.tsx) is the big-print version for in the store.

import { useState } from 'preact/hooks';
import { AISLE_LABEL, AISLE_ORDER, INGREDIENTS, ingName } from '../app/catalog';
import { removeExtra } from '../app/actions';
import { buyFor, priceIndex } from '../app/costs';
import { stock } from '../app/pantry';
import { planResult } from '../app/planning';
import type { PriceData } from '../app/prices';
import { type AppData, update, useApp } from '../app/state';
import { DEAL_LABEL, dealVerdict, isGoodSale } from '../lib/deals';
import { formatAmount, formatEur } from '../lib/format';
import { ESTIMATE } from '../planner/evaluate';
import type { PlanResult, ShoppingLine } from '../planner/types';
import { IconCheck, IconClose } from '../ui/icons';
import { Empty, Screen, Segmented, Toast, useToast } from '../ui/kit';
import type { PriceState } from './Plan';
import { RunningLow } from './RunningLow';

export type ShopLine = ShoppingLine & { extra?: boolean };

export function lineKey(l: ShopLine): string {
  return `${l.extra ? 'extra|' : ''}${l.store}|${l.ingredient}|${l.product}|${l.size}`;
}

/** "2 × 500 g", "about 1,2 kg" (loose), "1 × 10 pcs" */
export function lineQuantity(l: ShoppingLine): string {
  const unit = INGREDIENTS[l.ingredient]?.unit ?? 'g';
  if (l.loose) return `about ${formatAmount(Math.round(l.amount), unit)}`;
  return `${l.packs} × ${formatAmount(l.size, unit)}`;
}

/** "Ajvar blagi · Kania", or the product alone with a note when the store lists no brand. */
export function productLabel(product: string, brand?: string | null, ingredient?: string, loose?: boolean): string {
  // Fresh and loose food rarely has a brand; only say so for packaged goods.
  if (!brand) return loose || INGREDIENTS[ingredient ?? '']?.category === 'fruit-veg' ? product : `${product} · no brand listed`;
  return product.toLowerCase().includes(brand.toLowerCase()) ? product : `${product} · ${brand}`;
}

export function storeName(s: string): string {
  return s === ESTIMATE ? 'Any store (typical price)' : s;
}

/** Shopping lines for staples added because they are running low (one usual package each). */
export function extraLines(extras: string[], prices: PriceData): ShopLine[] {
  const idx = priceIndex(prices);
  const out: ShopLine[] = [];
  for (const id of extras) {
    const ing = INGREDIENTS[id];
    if (!ing) continue;
    const need = ing.packages[0] ?? (ing.unit === 'piece' ? 1 : 500);
    const p = buyFor(id, need, idx);
    if (!p) continue;
    for (const l of p.lines) {
      // Two listings of the same product (for example two barcodes): one line.
      const same = out.find((o) => o.ingredient === id && o.store === l.offer.store && o.product === l.offer.name);
      if (same && !l.offer.loose) {
        same.packs += l.count;
        same.amount += l.amount;
        same.cost = Math.round((same.cost + l.cost) * 100) / 100;
        continue;
      }
      out.push({
        ingredient: id,
        store: l.offer.store,
        product: l.offer.name,
        brand: l.offer.brand ?? null,
        size: l.offer.size,
        loose: !!l.offer.loose,
        packs: l.count,
        amount: l.amount,
        cost: l.cost,
        onSale: isGoodSale(l.offer),
        deal: dealVerdict(l.offer),
        estimated: l.offer.store === ESTIMATE,
        extra: true,
      });
    }
  }
  return out;
}

export interface ShoppingData {
  result: PlanResult;
  all: ShopLine[];
  extraKeys: Set<string>;
  stores: string[];
}

/** Every line to buy (the plan plus running-low extras) and the stores, "Any store" last. */
export function shoppingData(d: AppData, prices: PriceData): ShoppingData | null {
  if (!d.plan) return null;
  const result = planResult(d, prices);
  if (!result) return null;
  const extra = extraLines(d.extras, prices);
  const all: ShopLine[] = [...result.shopping, ...extra];
  const stores = [...new Set(all.map((l) => l.store))].sort((a, b) => (a === ESTIMATE ? 1 : b === ESTIMATE ? -1 : a.localeCompare(b)));
  return { result, all, extraKeys: new Set(extra.map(lineKey)), stores };
}

/** Already put in the pantry from an earlier basket. */
export function isBought(d: AppData, l: ShopLine): boolean {
  return !!d.shoppingChecked[`bought|${lineKey(l)}`];
}

/** In the basket (ticked) or already bought. */
export function isTicked(d: AppData, l: ShopLine): boolean {
  return !!d.shoppingChecked[lineKey(l)] || isBought(d, l);
}

export function toggleLine(l: ShopLine): void {
  update((x) => {
    const k = lineKey(l);
    if (x.shoppingChecked[k]) delete x.shoppingChecked[k];
    else x.shoppingChecked[k] = true;
  });
}

/** Puts ticked lines in the pantry and marks them bought. */
export function basketToPantry(lines: ShopLine[]): void {
  const items = lines.map((l) => ({ ingredient: l.ingredient, amount: l.loose ? l.amount : l.packs * l.size }));
  update((x) => {
    stock(x, items);
    for (const l of lines) {
      delete x.shoppingChecked[lineKey(l)];
      x.shoppingChecked[`bought|${lineKey(l)}`] = true;
    }
  });
}

/** Lines grouped by aisle, in a typical shop walk (fresh first, frozen last). */
export function byAisle(lines: ShopLine[]): { a: string; items: ShopLine[] }[] {
  const groups = AISLE_ORDER.map((a) => ({ a, items: lines.filter((l) => (INGREDIENTS[l.ingredient]?.category ?? 'other') === a) })).filter((g) => g.items.length);
  const other = lines.filter((l) => !AISLE_ORDER.includes(INGREDIENTS[l.ingredient]?.category ?? 'other'));
  if (other.length) groups.push({ a: 'other', items: other });
  return groups;
}

function tabName(s: string): string {
  return s === ESTIMATE ? 'Other' : s.split(' ')[0];
}

export function ShoppingScreen({ prices }: { prices: PriceState }) {
  const d = useApp();
  const sd = prices.data && d.plan ? shoppingData(d, prices.data) : null;
  const [tab, setTab] = useState('all');
  const [toast, setToast] = useToast<string>();

  if (!d.plan || !sd) {
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

  const { result, all, extraKeys, stores } = sd;
  const checked = d.shoppingChecked;
  const shown = tab === 'all' ? stores : stores.filter((s) => s === tab);
  const lines = all.filter((l) => shown.includes(l.store));
  const inBasket = lines.filter((l) => checked[lineKey(l)]);
  const basketCost = inBasket.reduce((s, l) => s + l.cost, 0);
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const pct = lines.length ? (inBasket.length / lines.length) * 100 : 0;
  const bought = (l: ShopLine) => isBought(d, l);

  const addBasket = () => {
    basketToPantry(inBasket);
    setToast(`${inBasket.length} items added to your pantry.`);
  };

  return (
    <Screen glow="teal">
      <header class="page-head">
        <h1>Shopping</h1>
        <p class="sub">
          {lines.length} items · {formatEur(total)}
        </p>
      </header>

      <a class="btn-primary wide shop-mode-start" href={`#/shop${tab === 'all' ? '' : `/${encodeURIComponent(tab)}`}`}>
        Start shopping mode
      </a>

      {stores.length > 1 && <Segmented label="Store" options={[{ id: 'all', label: 'All' }, ...stores.map((s) => ({ id: s, label: tabName(s) }))]} value={tab} onChange={setTab} />}

      {shown.map((store) => {
        const sl = all.filter((l) => l.store === store);
        const groups = byAisle(sl);
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
                          <input type="checkbox" checked={on} disabled={bought(l)} onChange={() => toggleLine(l)} />
                          <span class="box" aria-hidden="true">
                            {on && <IconCheck size={18} />}
                          </span>
                          <span class="grow">
                            <strong>{ingName(l.ingredient)}</strong>
                            <small>
                              {lineQuantity(l)} · {l.estimated ? 'typical price' : productLabel(l.product, l.brand, l.ingredient, l.loose)}
                            </small>
                            {l.deal && <span class={l.deal === 'not' ? 'tag notdeal' : 'tag teal'}>{DEAL_LABEL[l.deal]}</span>}
                            {bought(l) && <span class="tag outline">In pantry</span>}
                            {extraKeys.has(lineKey(l)) && <span class="tag orange">Running low</span>}
                          </span>
                          <span class="shop-price">{formatEur(l.cost)}</span>
                        </label>
                        {extraKeys.has(lineKey(l)) && (
                          <button class="icon-btn small remove-extra" aria-label={`Remove ${ingName(l.ingredient)} from the list`} onClick={() => removeExtra(l.ingredient)}>
                            <IconClose size={16} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      <RunningLow note="Nearly gone at home. Add them to this list?" />

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
