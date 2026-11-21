// Shopping mode: the list in big print for the store. One tap per item,
// what is left to find stays at the top in aisle order, ticked items drop
// into "In the basket", and the screen stays on. Works offline: the list
// comes from the saved plan and the last prices on the phone.

import { useEffect, useRef, useState } from 'preact/hooks';
import { AISLE_LABEL, ingName } from '../app/catalog';
import { useApp } from '../app/state';
import { DEAL_LABEL } from '../lib/deals';
import { formatEur } from '../lib/format';
import { ESTIMATE } from '../planner/evaluate';
import { IconCheck, IconClose } from '../ui/icons';
import { Empty, Screen, Toast, useToast } from '../ui/kit';
import { useWakeLock } from '../ui/wakeLock';
import type { PriceState } from './Plan';
import { type ShopLine, basketToPantry, byAisle, isBought, isTicked, lineKey, lineQuantity, productLabel, shoppingData, storeName, toggleLine } from './Shopping';

export function ShoppingMode({ prices, store }: { prices: PriceState; store?: string }) {
  const d = useApp();
  const awake = useWakeLock();
  const [showBasket, setShowBasket] = useState(false);
  const [toast, setToast] = useToast<string>();
  // Just-ticked items stay in place for a moment, so the next item does not
  // jump under your thumb.
  const [settling, setSettling] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const tick = (l: ShopLine) => {
    const k = lineKey(l);
    toggleLine(l);
    setSettling((x) => [...x.filter((y) => y !== k), k]);
    timers.current.push(window.setTimeout(() => setSettling((x) => x.filter((y) => y !== k)), 1500));
  };
  const sd = prices.data && d.plan ? shoppingData(d, prices.data) : null;

  if (!sd) {
    return (
      <Screen glow="teal" tabs={false}>
        <ModeTop title="Shopping mode" />
        {d.plan ? (
          <div class="card loading-card" aria-busy="true">
            <div class="spinner" aria-hidden="true" />
            <p>Loading prices...</p>
          </div>
        ) : (
          <Empty title="No plan yet" action="Go to my plan" onAction={() => (location.hash = '#/plan')}>
            Make a plan first, then your shopping list is ready here.
          </Empty>
        )}
      </Screen>
    );
  }

  const stores = store && sd.stores.includes(store) ? [store] : sd.stores;
  const lines = sd.all.filter((l) => stores.includes(l.store));
  const todo = lines.filter((l) => !isTicked(d, l) || settling.includes(lineKey(l)));
  const basket = lines.filter((l) => d.shoppingChecked[lineKey(l)]);
  const inBasketList = basket.filter((l) => !settling.includes(lineKey(l)));
  const bought = lines.filter((l) => isBought(d, l));
  const done = lines.filter((l) => isTicked(d, l)).length;
  const basketCost = basket.reduce((s, l) => s + l.cost, 0);
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const pct = lines.length ? (done / lines.length) * 100 : 0;

  const finish = () => {
    basketToPantry(basket);
    setToast(`${basket.length} items added to your pantry.`);
  };

  return (
    <Screen glow="teal" tabs={false}>
      <div class="shop-mode">
        <ModeTop title={stores.length === 1 ? storeName(stores[0]) : 'Shopping mode'} />
        <div class="mode-progress" aria-live="polite">
          <div class="mode-count">
            <span>
              <strong>{done}</strong> of {lines.length} in the basket
            </span>
            <strong class="mode-total">{formatEur(basketCost)}</strong>
          </div>
          <div class="bar teal" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          <small>
            List total {formatEur(total)}
            {awake ? ' · the screen stays on while you shop' : ''}
          </small>
        </div>

        {todo.length === 0 ? (
          <section class="card mode-done">
            <h2>All done</h2>
            <p>Everything on the list is in the basket.</p>
          </section>
        ) : (
          stores.map((s) => {
            const left = todo.filter((l) => l.store === s);
            if (!left.length) return null;
            return (
              <section key={s} class="mode-store">
                {stores.length > 1 && <h2 class="mode-store-name">{storeName(s)}</h2>}
                {s === ESTIMATE && <p class="sub">Not listed by your store today: buy these wherever is handy.</p>}
                {byAisle(left).map((g) => (
                  <div key={g.a} class="mode-aisle">
                    <h3>{AISLE_LABEL[g.a] ?? 'Other'}</h3>
                    <ul class="mode-list">
                      {g.items.map((l) => (
                        <ModeRow key={lineKey(l)} l={l} on={isTicked(d, l)} onTick={tick} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })
        )}

        {inBasketList.length + bought.length > 0 && (
          <section class="card mode-basket">
            <button class="mode-basket-head" aria-expanded={showBasket} onClick={() => setShowBasket(!showBasket)}>
              <span>In the basket ({inBasketList.length + bought.length})</span>
              <span class="muted">{showBasket ? 'Hide' : 'Show'}</span>
            </button>
            {showBasket && (
              <ul class="mode-list">
                {[...inBasketList, ...bought].map((l) => (
                  <ModeRow key={lineKey(l)} l={l} on locked={isBought(d, l)} onTick={tick} />
                ))}
              </ul>
            )}
          </section>
        )}

        {basket.length > 0 && (
          <div class="mode-actions">
            <button class="btn-primary wide" onClick={finish}>
              Add basket to my pantry
            </button>
          </div>
        )}
      </div>
      {toast && <Toast>{toast}</Toast>}
    </Screen>
  );
}

function ModeTop({ title }: { title: string }) {
  return (
    <div class="mode-top">
      <h1>{title}</h1>
      <a class="icon-btn" href="#/shopping" aria-label="Close shopping mode">
        <IconClose />
      </a>
    </div>
  );
}

function ModeRow({ l, on, locked, onTick }: { l: ShopLine; on: boolean; locked?: boolean; onTick: (l: ShopLine) => void }) {
  return (
    <li>
      <label class={`mode-row${on ? ' done' : ''}`}>
        <input type="checkbox" checked={on} disabled={locked} onChange={() => onTick(l)} />
        <span class="box" aria-hidden="true">
          {on && <IconCheck size={24} />}
        </span>
        <span class="grow">
          <strong>{ingName(l.ingredient)}</strong>
          <small>
            {lineQuantity(l)} · {l.estimated ? 'typical price' : productLabel(l.product, l.brand, l.ingredient, l.loose)}
          </small>
          {!on && l.deal && <span class={l.deal === 'not' ? 'tag notdeal' : 'tag teal'}>{DEAL_LABEL[l.deal]}</span>}
          {locked && <span class="tag outline">In pantry</span>}
        </span>
        <span class="shop-price">{formatEur(l.cost)}</span>
      </label>
    </li>
  );
}
