// Barcodes on food packages (EAN-13, EAN-8, UPC). Pure helpers, shared by
// scripts/barcodes.ts (which builds the list) and the scan screen.

/** Whether the last digit is the right check digit (GS1). */
export function validCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 8) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * The form a barcode is stored in: digits only, UPC-A (12) and padded codes
 * as EAN-13. Shop-internal codes (starting with 2, used for weighed food)
 * and codes with a wrong check digit give null.
 */
export function barcodeKey(raw: string): string | null {
  let code = raw.replace(/\D/g, '');
  if (code.length === 14 && code.startsWith('0')) code = code.slice(1);
  if (code.length === 12) code = `0${code}`;
  if (code.length !== 13 && code.length !== 8) return null;
  if (code.length === 13 && code.startsWith('2')) return null;
  return validCheckDigit(code) ? code : null;
}

export interface BarcodeHit {
  ingredient: string;
  size: number; // package size in the ingredient's unit
  name: string; // product name as the shop lists it
}

export type BarcodeIndex = Record<string, [string, number, string]>;

export function findBarcode(index: BarcodeIndex, raw: string): BarcodeHit | null {
  const key = barcodeKey(raw);
  const hit = key ? index[key] : undefined;
  return hit ? { ingredient: hit[0], size: hit[1], name: hit[2] } : null;
}
