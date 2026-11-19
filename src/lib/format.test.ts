import { describe, expect, it } from 'vitest';
import { daysBetween, formatAmount, formatEur, formatShortDate, zagrebToday } from './format';

// Intl may use a non-breaking or narrow space before the euro sign.
const NBSP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const plain = (s: string) => s.replace(NBSP, ' ');

describe('format', () => {
  it('formats euros with a comma', () => {
    expect(plain(formatEur(59.14))).toBe('59,14 €');
    expect(plain(formatEur(1234.5))).toBe('1.234,50 €');
  });

  it('formats short dates', () => {
    expect(formatShortDate('2026-11-19')).toBe('19 Nov');
  });

  it('counts days', () => {
    expect(daysBetween('2026-11-18', '2026-11-20')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the clock change
  });

  it('formats amounts', () => {
    expect(formatAmount(500, 'g')).toBe('500 g');
    expect(formatAmount(1500, 'g')).toBe('1,5 kg');
    expect(formatAmount(1000, 'ml')).toBe('1 l');
    expect(formatAmount(10, 'piece')).toBe('10 pcs');
  });

  it('knows the date in Zagreb', () => {
    // 23:30 UTC on 19 Nov is already 20 Nov in Zagreb
    expect(zagrebToday(new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20');
  });
});
