// Loads prices for the chosen store(s), plus deals and typical prices.

import { useEffect, useState } from 'preact/hooks';
import { type Meta, type PriceItem, type StorePrices, loadMeta, loadReferencePrices, loadStorePrices } from '../lib/data';
import type { Offer } from '../planner/types';
import type { Settings, StoreChoice } from './state';

export interface PriceData {
  offers: Offer[];
  reference: Offer[];
  deals: (PriceItem & { store: string })[];
  dates: Record<string, string>; // store label -> price date
  meta: Meta | null;
  stores: StoreChoice[];
}

const base = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function loadDeals(store: StoreChoice): Promise<PriceItem[]> {
  try {
    const res = await fetch(`${base}data/deals/${store.chain}/${store.storeId}.json`);
    if (!res.ok) return [];
    return ((await res.json()) as { items: PriceItem[] }).items;
  } catch {
    return [];
  }
}

/** The stores the planner shops at. */
export function activeStores(s: Settings): StoreChoice[] {
  if (!s.stores.length) return [];
  if (s.storeMode === 'cheapest') return s.stores;
  return [s.stores[Math.min(s.activeStore, s.stores.length - 1)]];
}

export async function loadPriceData(stores: StoreChoice[]): Promise<PriceData> {
  const [meta, reference, per] = await Promise.all([
    cached('meta', loadMeta).catch(() => null),
    cached('reference', loadReferencePrices),
    Promise.all(
      stores.map(async (st) => {
        const [prices, deals] = await Promise.all([
          cached(`p:${st.chain}:${st.storeId}`, () => loadStorePrices(st.chain, st.storeId)) as Promise<StorePrices>,
          cached(`d:${st.chain}:${st.storeId}`, () => loadDeals(st)) as Promise<PriceItem[]>,
        ]);
        return { st, prices, deals };
      }),
    ),
  ]);
  return {
    offers: per.flatMap(({ st, prices }) => prices.items.map((i) => ({ ...i, store: st.label }))),
    reference: reference.map((r) => ({ ...r, store: 'estimate' })),
    deals: per.flatMap(({ st, deals }) => deals.map((d) => ({ ...d, store: st.label }))),
    dates: Object.fromEntries(per.map(({ st, prices }) => [st.label, prices.date])),
    meta,
    stores,
  };
}

export function usePriceData(settings: Settings): { data: PriceData | null; error: string | null } {
  const stores = activeStores(settings);
  const key = stores.map((s) => `${s.chain}:${s.storeId}`).join(',');
  const [state, setState] = useState<{ key: string; data: PriceData | null; error: string | null }>({ key: '', data: null, error: null });
  useEffect(() => {
    if (!stores.length) return;
    let live = true;
    loadPriceData(stores)
      .then((data) => live && setState({ key, data, error: null }))
      .catch(() => live && setState({ key, data: null, error: 'Prices could not be loaded. Check your connection.' }));
    return () => {
      live = false;
    };
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error } : { data: null, error: null };
}
