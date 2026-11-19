// Types and loaders for the price data built by the pipeline (pipeline/).

export type ChainId = 'lidl' | 'kaufland' | 'konzum' | 'spar' | 'plodine';
export type Unit = 'g' | 'ml' | 'piece';

export interface ChainMeta {
  name: string;
  date: string | null;
  ageDays?: number;
  stale?: boolean;
  source?: string;
  fallback?: boolean;
  stores?: number;
  matchedProducts?: number;
  available: boolean;
  notes: string[];
}

export interface Meta {
  generatedAt: string;
  today: string;
  ingredients: number;
  chains: Partial<Record<ChainId, ChainMeta>>;
}

export interface Store {
  id: string;
  type: string;
  address: string;
  city: string;
  zip: string;
}

export interface PriceItem {
  ingredient: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  size: number;
  unit: Unit;
  price: number;
  salePrice: number | null;
  unitPrice: number;
  best30: number | null;
  anchor: number | null;
  loose?: boolean;
}

export interface StorePrices {
  chain: ChainId;
  store: string;
  date: string;
  items: PriceItem[];
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  storage: 'fridge' | 'shelves' | 'freezer';
  unit: Unit;
  staple: boolean;
  packageType: string;
  packages: number[];
  nutrition: Record<string, number>;
  pieceG?: number;
  shelfLifeDays?: number;
}

export const CHAIN_ORDER: ChainId[] = ['lidl', 'kaufland', 'konzum', 'spar', 'plodine'];

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const loadMeta = () => getJson<Meta>('meta.json');
export const loadIngredients = () => getJson<Ingredient[]>('ingredients.json');
export const loadStores = (chain: ChainId) => getJson<Store[]>(`stores/${chain}.json`);
export const loadStorePrices = (chain: ChainId, store: string) =>
  getJson<StorePrices>(`prices/${chain}/${store}.json`);
/** Typical price per ingredient across all stores (fills gaps in one store's list). */
export const loadReferencePrices = () =>
  getJson<(PriceItem & { stores: number })[]>('reference-prices.json').catch(() => []);
