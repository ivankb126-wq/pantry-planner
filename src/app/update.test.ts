import { describe, expect, it } from 'vitest';
import { safeToReload } from './update';

describe('safeToReload', () => {
  it('reloads on the main screens', () => {
    for (const h of ['', '#/plan', '#/recipes', '#/recipe/sarma', '#/shopping', '#/pantry', '#/settings/stores']) expect(safeToReload(h, true)).toBe(true);
  });
  it('never while cooking, shopping, scanning or prepping, nor during setup', () => {
    for (const h of ['#/cook/sarma', '#/shop', '#/shop/lidl', '#/scan', '#/prep', '#/onboarding']) expect(safeToReload(h, true)).toBe(false);
    expect(safeToReload('#/plan', false)).toBe(false);
  });
});
