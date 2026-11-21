// Builds public/data/barcodes.json for "Scan a barcode" in the pantry:
// every packaged product in the store price files that matched an
// ingredient, as barcode -> [ingredient, package size, product name].
//   npx tsx scripts/barcodes.ts
// Runs as part of `npm run build`, after the price pipeline has written
// public/data. Without price data (CI checks) it does nothing.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { barcodeKey } from '../src/lib/barcodes';

const root = join('public', 'data', 'prices');
if (!existsSync(root)) {
  console.log('No price data in public/data/prices: barcode list skipped.');
  process.exit(0);
}

interface Item {
  ingredient: string;
  name: string;
  size: number;
  barcode?: string | null;
  loose?: boolean;
}

const index: Record<string, [string, number, string]> = {};
const seen = new Map<string, number>();
let files = 0;
for (const chain of readdirSync(root)) {
  const dir = join(root, chain);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    files++;
    const items = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { items: Item[] }).items;
    for (const it of items) {
      // Loose food is weighed in the shop, its label is not a product barcode.
      if (it.loose || !it.barcode) continue;
      const key = barcodeKey(it.barcode);
      if (!key) continue;
      // The same barcode in many stores: keep the name most stores use.
      const id = `${key}|${it.ingredient}|${it.size}|${it.name}`;
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      const cur = index[key];
      const curN = cur ? (seen.get(`${key}|${cur[0]}|${cur[1]}|${cur[2]}`) ?? 0) : 0;
      if (!cur || n > curN) index[key] = [it.ingredient, it.size, it.name];
    }
  }
}

writeFileSync(join('public', 'data', 'barcodes.json'), JSON.stringify(index));
console.log(`Wrote ${Object.keys(index).length} barcodes from ${files} store files to public/data/barcodes.json`);
