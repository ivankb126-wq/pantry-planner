import { useEffect, useMemo, useState } from 'preact/hooks';
import { SunsetArt } from './components/SunsetArt';
import {
  CHAIN_ORDER,
  type ChainId,
  type ChainMeta,
  type Ingredient,
  type Meta,
  type Store,
  type StorePrices,
  loadIngredients,
  loadMeta,
  loadStorePrices,
  loadStores,
} from './lib/data';
import { daysBetween, formatAmount, formatEur, formatShortDate, formatUnitPrice, zagrebToday } from './lib/format';
import { readPref, writePref } from './lib/prefs';

// Milestone 1: a "data status" page. It shows how fresh each chain's prices
// are and lets you check sample prices in any store against the shelf.

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ingredients, setIngredients] = useState<Record<string, Ingredient>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMeta(), loadIngredients()])
      .then(([m, ings]) => {
        setMeta(m);
        setIngredients(Object.fromEntries(ings.map((i) => [i.id, i])));
      })
      .catch(() => setError('Price data could not be loaded. Check your connection and try again.'));
  }, []);

  return (
    <main class="page">
      <header class="hero">
        <SunsetArt />
        <h1>Pantry Planner</h1>
        <p>Price data status. Plans, recipes and your pantry arrive in the next steps.</p>
      </header>

      {error && (
        <section class="card error" role="alert">
          <h2>Something went wrong</h2>
          <p class="sub">{error}</p>
        </section>
      )}

      {meta && <Summary meta={meta} />}
      {meta && <ChainStatus meta={meta} />}
      {meta && <SamplePrices meta={meta} ingredients={ingredients} />}

      <p class="note">
        Orientation prices from the official daily price lists, via{' '}
        <a href="https://cijene.dev" target="_blank" rel="noopener">
          cijene.dev
        </a>
        . Loyalty-card and app-only discounts may not be included.
      </p>
    </main>
  );
}

function Summary({ meta }: { meta: Meta }) {
  const chains = CHAIN_ORDER.map((c) => meta.chains[c]).filter((c): c is ChainMeta => !!c?.available);
  const stores = chains.reduce((n, c) => n + (c.stores ?? 0), 0);
  const products = chains.reduce((n, c) => n + (c.matchedProducts ?? 0), 0);
  return (
    <section class="card sunset-card" aria-label="Summary">
      <p class="sub">Shops with prices</p>
      <div class="big">{stores.toLocaleString('hr-HR')}</div>
      <p class="sub">
        {chains.length} chains, {products.toLocaleString('hr-HR')} matched products, {meta.ingredients} ingredients
      </p>
    </section>
  );
}

function ChainStatus({ meta }: { meta: Meta }) {
  const today = zagrebToday();
  return (
    <section class="card">
      <h2>Prices by chain</h2>
      <p class="sub">Updated twice a day. Orange means older than yesterday.</p>
      <ul class="chains">
        {CHAIN_ORDER.map((id) => {
          const c = meta.chains[id];
          if (!c || !c.available || !c.date) {
            return (
              <li class="chain-row" key={id}>
                <span class="dot none" aria-hidden="true" />
                <div>
                  <div class="chain-name">{c?.name ?? id}</div>
                  <div class="chain-detail">No prices available yet</div>
                </div>
                <div class="chain-date old">None</div>
              </li>
            );
          }
          const age = daysBetween(c.date, today);
          const old = age > 1;
          const source = c.fallback ? 'kept from an earlier update' : c.source === 'official site' ? 'official site' : 'daily price list';
          return (
            <li class="chain-row" key={id}>
              <span class={`dot${old ? ' old' : ''}`} aria-hidden="true" />
              <div>
                <div class="chain-name">{c.name}</div>
                <div class="chain-detail">
                  {c.stores} stores, {source}
                </div>
              </div>
              <div class={`chain-date${old ? ' old' : ''}`}>
                {old ? `${c.name} prices from ${formatShortDate(c.date)}` : formatShortDate(c.date)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface Choice {
  chain: ChainId;
  store: string | null;
}

function SamplePrices({ meta, ingredients }: { meta: Meta; ingredients: Record<string, Ingredient> }) {
  const available = CHAIN_ORDER.filter((c) => meta.chains[c]?.available);
  const saved = readPref<Choice>('status.store');
  const [chain, setChain] = useState<ChainId>(saved && available.includes(saved.chain) ? saved.chain : available[0]);
  const [storeId, setStoreId] = useState<string | null>(saved?.chain === chain ? saved.store : null);
  const [stores, setStores] = useState<Store[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [showPicker, setShowPicker] = useState(!storeId);
  const [prices, setPrices] = useState<StorePrices | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!chain) return;
    let live = true;
    loadStores(chain).then((s) => live && setStores(s)).catch(() => live && setStores([]));
    return () => {
      live = false;
    };
  }, [chain]);

  useEffect(() => {
    setPrices(null);
    if (!chain || !storeId) return;
    let live = true;
    loadStorePrices(chain, storeId)
      .then((p) => live && setPrices(p))
      .catch(() => live && setPrices(null));
    writePref<Choice>('status.store', { chain, store: storeId });
    return () => {
      live = false;
    };
  }, [chain, storeId]);

  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const matchingStores = useMemo(() => {
    const q = fold(cityQuery.trim());
    const list = q ? stores.filter((s) => fold(`${s.city} ${s.address}`).includes(q)) : stores;
    return list.slice(0, 60);
  }, [stores, cityQuery]);

  const store = stores.find((s) => s.id === storeId) ?? null;

  // One line per ingredient: its best value product in this store.
  const rows = useMemo(() => {
    if (!prices) return [];
    const best = new Map<string, StorePrices['items'][number]>();
    for (const item of prices.items) if (!best.has(item.ingredient)) best.set(item.ingredient, item);
    const q = fold(filter.trim());
    return [...best.values()]
      .map((item) => ({ item, name: ingredients[item.ingredient]?.name ?? item.ingredient }))
      .filter(({ item, name }) => !q || fold(name).includes(q) || fold(item.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [prices, ingredients, filter]);

  if (!available.length) return null;

  return (
    <section class="card">
      <h2>Check a few prices</h2>
      <p class="sub">Pick a store and compare these with the shelf or the store's website.</p>

      <div class="chips" role="group" aria-label="Chain">
        {CHAIN_ORDER.map((c) => (
          <button
            key={c}
            class="chip"
            aria-pressed={c === chain}
            disabled={!meta.chains[c]?.available}
            onClick={() => {
              setChain(c);
              setStoreId(null);
              setCityQuery('');
              setShowPicker(true);
            }}
          >
            {meta.chains[c]?.name ?? c}
          </button>
        ))}
      </div>

      {store && !showPicker ? (
        <div style={{ marginTop: '12px' }}>
          <div class="chain-name">
            {meta.chains[chain]?.name} {store.city}
          </div>
          <div class="chain-detail">{store.address}</div>
          <button class="link-btn" onClick={() => setShowPicker(true)}>
            Change store
          </button>
        </div>
      ) : (
        <>
          <input
            class="field"
            type="search"
            placeholder="Search by city or street"
            value={cityQuery}
            onInput={(e) => setCityQuery((e.target as HTMLInputElement).value)}
            aria-label="Search stores by city or street"
          />
          <ul class="store-list">
            {matchingStores.map((s) => (
              <li key={s.id}>
                <button
                  class="store-btn"
                  aria-current={s.id === storeId}
                  onClick={() => {
                    setStoreId(s.id);
                    setShowPicker(false);
                  }}
                >
                  {s.city || 'Unknown city'}
                  <small>{s.address}</small>
                </button>
              </li>
            ))}
            {!matchingStores.length && <li class="empty">No store found. Try another city.</li>}
          </ul>
        </>
      )}

      {prices && (
        <>
          <p class="sub" style={{ marginTop: '14px' }}>
            Prices from {formatShortDate(prices.date)}. Best value package for each ingredient.
          </p>
          <input
            class="field"
            type="search"
            placeholder="Filter, for example eggs or riža"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            aria-label="Filter ingredients"
          />
          <ul class="price-list">
            {rows.map(({ item, name }) => (
              <li class="price-row" key={item.ingredient}>
                <div class="ing-name">
                  {name}
                  {item.salePrice != null && <span class="badge sale">On sale</span>}
                  {item.loose && <span class="badge loose">per kg</span>}
                </div>
                <div class="price">{formatEur(item.price)}</div>
                <div class="product">
                  {item.name}
                  {!item.loose && ` · ${formatAmount(item.size, item.unit)}`}
                </div>
                <div class="unit-price">{formatUnitPrice(item.unitPrice, item.unit)}</div>
              </li>
            ))}
            {!rows.length && <li class="empty">Nothing matches that filter.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
