// The barcode list (public/data/barcodes.json, built from the store price
// files) plus barcodes you taught the app yourself.

import { type BarcodeHit, type BarcodeIndex, barcodeKey, findBarcode } from '../lib/barcodes';
import { readPref, writePref } from '../lib/prefs';

const MINE = 'my-barcodes';
let list: Promise<BarcodeIndex> | null = null;

function loadList(): Promise<BarcodeIndex> {
  list ??= fetch(`${import.meta.env.BASE_URL}data/barcodes.json`)
    .then((r) => (r.ok ? (r.json() as Promise<BarcodeIndex>) : {}))
    .catch(() => {
      list = null; // try again next time (offline the first time)
      return {};
    });
  return list;
}

/** What a scanned barcode is: from your own list first, then the shops'. */
export async function lookupBarcode(raw: string): Promise<(BarcodeHit & { mine?: boolean }) | null> {
  const key = barcodeKey(raw);
  if (!key) return null;
  const mine = readPref<Record<string, { ingredient: string; size: number }>>(MINE)?.[key];
  if (mine) return { ...mine, name: '', mine: true };
  return findBarcode(await loadList(), key);
}

/** Remember what a barcode the shops do not list is, for next time. */
export function rememberBarcode(raw: string, ingredient: string, size: number): void {
  const key = barcodeKey(raw);
  if (!key) return;
  const mine = readPref<Record<string, { ingredient: string; size: number }>>(MINE) ?? {};
  writePref(MINE, { ...mine, [key]: { ingredient, size } });
}
