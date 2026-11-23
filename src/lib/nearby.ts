// "Stores near me": distances from the phone's location to the stores, whose
// map positions come from the price data (see pipeline/locate.py). The
// location is kept on the phone only and never sent anywhere.

import type { Store } from './data';

export interface Place {
  lat: number;
  lon: number;
}

export function distanceKm(a: Place, b: Place): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** "450 m", "2,3 km", "35 km" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

const key = (s: Store) => `${s.city} ${s.address}`.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The price lists sometimes have the same store twice ("3. Gardijske" and "3.Gardijske"). */
export function uniqueStores(list: Store[]): Store[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = key(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Nearest first; stores without a position go last, in their old order. */
export function byDistance<T extends Store>(list: T[], home: Place): (T & { km: number | null })[] {
  return list
    .map((s) => ({ ...s, km: s.lat != null && s.lon != null ? distanceKm(home, { lat: s.lat, lon: s.lon }) : null }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

/** Round the position to about 100 m: plenty for finding a shop. */
export function roughPlace(lat: number, lon: number): Place {
  return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}
