import { describe, expect, it } from 'vitest';
import { scaleStep, stepText, stepTip } from '../lib/nutrition';
import { stepMinutes } from '../screens/Cooking';
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

  it('scales amounts in steps to the servings', () => {
    const t = 'Add {700 ml} water, {1 tbsp} oil and crack in {8} eggs.';
    expect(scaleStep(t)).toBe('Add 700 ml water, 1 tbsp oil and crack in 8 eggs.');
    expect(scaleStep(t, 0.5)).toBe('Add 350 ml water, ½ tbsp oil and crack in 4 eggs.');
    expect(scaleStep('Pour in {600 ml} milk', 2)).toBe('Pour in 1.2 l milk');
    expect(scaleStep('{3} hollows', 0.1)).toBe('1 hollows');
  });

  it('times a step by its main wait', () => {
    expect(stepMinutes('Stir 1 minute, then simmer 20 to 25 minutes.')).toBe(20);
    expect(stepMinutes('Chop the onion.')).toBeNull();
    expect(stepMinutes('Boil for 6.5 minutes.')).toBe(6.5);
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
