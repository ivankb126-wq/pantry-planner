// What you actually pay: whole packages. For each ingredient we find the
// cheapest way to buy at least the amount needed, using one package size or
// a mix of two sizes (for example 1 kg + 500 g). Loose produce is bought by
// weight, rounded up to what a shop scale would give you.

import type { Unit } from '../lib/nutrition';
import type { Offer } from './types';

export interface PurchaseLine {
  offer: Offer;
  count: number; // packages, or 1 for a loose purchase
  amount: number; // ingredient unit
  cost: number;
}

export interface Purchase {
  lines: PurchaseLine[];
  cost: number;
  bought: number;
}

const EMPTY: Purchase = { lines: [], cost: 0, bought: 0 };

/** Loose produce: smallest step you can sensibly buy. */
function looseStep(unit: Unit): number {
  return unit === 'piece' ? 1 : 100;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function single(offer: Offer, need: number, unit: Unit): PurchaseLine {
  if (offer.loose) {
    const step = looseStep(unit);
    const amount = Math.max(step, Math.ceil(need / step - 1e-9) * step);
    const per = unit === 'piece' ? 1 : 1000;
    return { offer, count: 1, amount, cost: round2((amount / per) * offer.unitPrice) };
  }
  const count = Math.max(1, Math.ceil(need / offer.size - 1e-9));
  return { offer, count, amount: count * offer.size, cost: round2(count * offer.price) };
}

/** Cheapest way to buy at least `need` (ingredient unit) from these offers. */
export function cheapestPurchase(need: number, offers: Offer[], unit: Unit): Purchase {
  if (need <= 1e-9 || offers.length === 0) return EMPTY;
  let best: Purchase | null = null;
  const consider = (lines: PurchaseLine[]) => {
    const cost = round2(lines.reduce((s, l) => s + l.cost, 0));
    const bought = lines.reduce((s, l) => s + l.amount, 0);
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && bought < best.bought)) {
      best = { lines, cost, bought };
    }
  };
  for (const o of offers) consider([single(o, need, unit)]);
  // Mixes of two packaged sizes: k of the bigger one, the rest from the smaller.
  const packaged = offers.filter((o) => !o.loose);
  for (const big of packaged) {
    for (const small of packaged) {
      if (big === small || big.size <= small.size) continue;
      const maxK = Math.floor(need / big.size);
      for (let k = 1; k <= maxK && k <= 20; k++) {
        const rest = need - k * big.size;
        if (rest <= 1e-9) continue;
        const bigLine: PurchaseLine = { offer: big, count: k, amount: k * big.size, cost: round2(k * big.price) };
        consider([bigLine, single(small, rest, unit)]);
      }
    }
  }
  return best ?? EMPTY;
}

/** Offers grouped by ingredient, cheapest per unit first. */
export function indexOffers(offers: Offer[]): Map<string, Offer[]> {
  const map = new Map<string, Offer[]>();
  for (const o of offers) {
    if (!(o.size > 0) || !(o.price > 0)) continue;
    const list = map.get(o.ingredient) ?? [];
    list.push(o);
    map.set(o.ingredient, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.unitPrice - b.unitPrice);
  return map;
}
