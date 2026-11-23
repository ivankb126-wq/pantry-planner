// Small text helpers for the screens.

import type { Slot } from '../planner/types';

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  dessert: 'Dessert',
  starter: 'Soup to start',
  side: 'Side salad',
};

function utc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-11-20" -> "Friday" */
export function dayLong(iso: string): string {
  return utc(iso).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

/** "2026-11-20" -> "FRI" */
export function dayShort(iso: string): string {
  return utc(iso).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
}

/** "2026-11-20" -> "20" */
export function dayNum(iso: string): string {
  return String(utc(iso).getUTCDate());
}

export function minutes(n: number): string {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
