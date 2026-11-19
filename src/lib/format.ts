// Formatting helpers. Prices use Croatian euro style (59,14 €), the rest of
// the UI is English.

const eur = new Intl.NumberFormat('hr-HR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 59.14 -> "59,14 €" */
export function formatEur(value: number): string {
  // Some engines use a non-breaking space before the euro sign; keep it,
  // it stops the sign from wrapping onto its own line.
  return eur.format(value);
}

/** "2026-11-19" -> "19 Nov" */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Today's date in Zagreb as YYYY-MM-DD. */
export function zagrebToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** 500 g, 1,5 kg, 750 ml, 1 l, 10 pcs */
export function formatAmount(amount: number, unit: 'g' | 'ml' | 'piece'): string {
  const num = (n: number) => n.toLocaleString('hr-HR', { maximumFractionDigits: 2 });
  if (unit === 'piece') return `${num(amount)} ${amount === 1 ? 'pc' : 'pcs'}`;
  if (amount >= 1000) return `${num(amount / 1000)} ${unit === 'g' ? 'kg' : 'l'}`;
  return `${num(amount)} ${unit}`;
}

/** Label for a unit price: "4,99 € / kg" */
export function formatUnitPrice(value: number, unit: 'g' | 'ml' | 'piece'): string {
  const per = unit === 'g' ? 'kg' : unit === 'ml' ? 'l' : 'pc';
  return `${formatEur(value)} / ${per}`;
}
