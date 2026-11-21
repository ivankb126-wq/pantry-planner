// Real deal check: is a "sale" price actually cheap?
//
// The shops' price lists give, for each product on sale, the lowest price
// it had in the 30 days before the sale (best30, required by EU price rules).
//  - lower than that lowest price: a real deal
//  - higher than it: not really a deal (it was cheaper recently)
//  - the same, or the shop does not publish it (Konzum): just "on sale"

export type DealVerdict = 'real' | 'not' | 'sale';

export const DEAL_LABEL: Record<DealVerdict, string> = {
  real: 'Real deal',
  not: 'Not really a deal',
  sale: 'On sale',
};

/** Prices are in whole cents; anything closer than half a cent counts as the same. */
const SAME = 0.005;

export function dealVerdict(o: { salePrice: number | null; best30?: number | null }): DealVerdict | null {
  if (o.salePrice == null) return null;
  if (o.best30 == null || !(o.best30 > 0)) return 'sale';
  if (o.salePrice < o.best30 - SAME) return 'real';
  if (o.salePrice > o.best30 + SAME) return 'not';
  return 'sale';
}

/** On sale in a way worth acting on (not a fake sale). */
export function isGoodSale(o: { salePrice: number | null; best30?: number | null }): boolean {
  const v = dealVerdict(o);
  return v === 'real' || v === 'sale';
}

/** Saving against the lowest price of the last 30 days (0.2 = 20% cheaper), or 0. */
export function dealSaving(o: { salePrice: number | null; best30?: number | null }): number {
  if (dealVerdict(o) !== 'real') return 0;
  return 1 - o.salePrice! / o.best30!;
}
