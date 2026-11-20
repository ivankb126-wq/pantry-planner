import { describe, expect, it } from 'vitest';
import { stepText, stepTip } from '../lib/nutrition';
import { productLabel } from '../screens/Shopping';
import { backupDue } from './backup';
import { emptyData, exportBackup, importBackup } from './state';

describe('brands', () => {
  it('adds the brand unless the product name already has it', () => {
    expect(productLabel('Ajvar blagi', 'Kania')).toBe('Ajvar blagi · Kania');
    expect(productLabel('Kania Ajvar', 'Kania')).toBe('Kania Ajvar');
    expect(productLabel('Slanutak', null)).toBe('Slanutak · no brand listed');
  });
});

describe('recipe steps', () => {
  it('reads plain steps and steps with a tip', () => {
    expect(stepText('Chop the onion.')).toBe('Chop the onion.');
    expect(stepTip('Chop the onion.')).toBeNull();
    const s = { text: 'Fry the onion on medium heat for 8 minutes.', tip: 'Done when soft and golden at the edges.' };
    expect(stepText(s)).toBe(s.text);
    expect(stepTip(s)).toBe(s.tip);
  });
});

describe('backup reminder', () => {
  it('waits until there is something to keep, then reminds every two weeks', () => {
    const d = emptyData();
    expect(backupDue(d, '2026-11-20')).toBe(false);
    d.favourites = ['a', 'b', 'c'];
    expect(backupDue(d, '2026-11-20')).toBe(true);
    d.lastBackupOn = '2026-11-15';
    expect(backupDue(d, '2026-11-20')).toBe(false);
    expect(backupDue(d, '2026-11-29')).toBe(true);
    d.backupSnoozedUntil = '2026-12-01';
    expect(backupDue(d, '2026-11-29')).toBe(false);
  });

  it('keeps photos in the backup file', () => {
    const file = exportBackup({ 'chana-masala': 'data:image/jpeg;base64,AAAA' });
    expect(importBackup(file)).toEqual({ 'chana-masala': 'data:image/jpeg;base64,AAAA' });
  });
});
