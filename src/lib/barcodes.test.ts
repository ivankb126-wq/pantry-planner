import { describe, expect, it } from 'vitest';
import { barcodeKey, findBarcode, validCheckDigit } from './barcodes';

describe('barcodes', () => {
  it('checks the last digit', () => {
    expect(validCheckDigit('3850334433015')).toBe(true); // almond drink from a Konzum list
    expect(validCheckDigit('3850334433016')).toBe(false);
    expect(validCheckDigit('20001223')).toBe(true); // EAN-8
  });

  it('stores codes as EAN-13 or EAN-8 and skips shop-internal weighed codes', () => {
    expect(barcodeKey(' 3850334433015 ')).toBe('3850334433015');
    expect(barcodeKey('036000291452')).toBe('0036000291452'); // UPC-A
    expect(barcodeKey('00036000291452')).toBe('0036000291452'); // padded GTIN-14
    expect(barcodeKey('2892890000000')).toBeNull(); // weighed meat label
    expect(barcodeKey('12345')).toBeNull();
  });

  it('finds the product, its ingredient and package size', () => {
    const index = { '3850334433015': ['almond-drink', 1000, 'NAPITAK BADEM'] as [string, number, string] };
    expect(findBarcode(index, '3850334433015')).toEqual({ ingredient: 'almond-drink', size: 1000, name: 'NAPITAK BADEM' });
    expect(findBarcode(index, '4006381333931')).toBeNull();
  });
});
