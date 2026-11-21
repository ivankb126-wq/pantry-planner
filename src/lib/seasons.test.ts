import { describe, expect, it } from 'vitest';
import content from '../generated/content.json';
import type { IngredientInfo, Recipe } from './nutrition';
import { SEASON, inSeasonIn, monthOf, seasonalIngredients } from './seasons';

const ING = content.ingredients as unknown as Record<string, IngredientInfo>;
const recipe = (id: string) => (content.recipes as unknown as Recipe[]).find((r) => r.id === id)!;

describe('Croatian seasonal produce', () => {
  it('has the November classics in season', () => {
    const nov = inSeasonIn(11);
    for (const id of ['mandarin', 'chestnuts', 'kale', 'cabbage', 'pumpkin']) expect(nov).toContain(id);
    expect(nov).not.toContain('strawberries');
  });
  it('only lists ingredients the app knows', () => {
    for (const id of Object.keys(SEASON)) expect(ING[id], id).toBeTruthy();
  });
  it('finds the seasonal produce a dish uses, by month', () => {
    expect(seasonalIngredients(recipe('pumpkin-risotto'), ING, 11)).toContain('pumpkin');
    expect(seasonalIngredients(recipe('pumpkin-risotto'), ING, 7)).toEqual([]);
    expect(monthOf('2026-11-23')).toBe(11);
  });
});
