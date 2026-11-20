import { describe, expect, it } from 'vitest';
import {
  type IngredientInfo,
  type Recipe,
  UnitError,
  collectionOf,
  dietAllows,
  recipeFacts,
  toIngredientUnit,
} from './nutrition';

const n = (kcal: number, protein: number, carbs: number, sugar: number, fat: number, salt = 0) => ({
  kcal, protein, carbs, sugar, fat, sat_fat: fat / 2, fibre: 0, salt,
});

const ING: Record<string, IngredientInfo> = {
  rice: { id: 'rice', name: 'Rice', category: 'grains', storage: 'shelves', unit: 'g', staple: true, packageType: 'bag', packages: [1000], nutrition: n(350, 7, 79, 0, 1), diet: 'vegan' },
  oil: { id: 'oil', name: 'Oil', category: 'oils', storage: 'shelves', unit: 'ml', staple: true, packageType: 'bottle', packages: [1000], nutrition: n(820, 0, 0, 0, 91), diet: 'vegan', density: 0.92 },
  egg: { id: 'egg', name: 'Eggs', category: 'eggs', storage: 'fridge', unit: 'piece', staple: true, packageType: 'box', packages: [10], nutrition: n(143, 12.6, 0.7, 0.4, 9.5, 0.36), diet: 'vegetarian', pieceG: 60 },
  carrot: { id: 'carrot', name: 'Carrot', category: 'fruit-veg', storage: 'fridge', unit: 'g', staple: false, packageType: 'bag', packages: [1000], nutrition: n(40, 1, 7, 5, 0), diet: 'vegan', pieceG: 80, tags: ['veg'] },
  sugar: { id: 'sugar', name: 'Sugar', category: 'baking', storage: 'shelves', unit: 'g', staple: true, packageType: 'bag', packages: [1000], nutrition: n(400, 0, 100, 100, 0), diet: 'vegan', tags: ['added-sugar'] },
  fish: { id: 'fish', name: 'Whole fish', category: 'fish', storage: 'fridge', unit: 'g', staple: false, packageType: 'loose', packages: [400], nutrition: n(100, 20, 0, 0, 2), diet: 'pescatarian', pieceG: 400, edible: 0.5, tags: ['fish'] },
  beans: { id: 'beans', name: 'Beans', category: 'legumes', storage: 'shelves', unit: 'g', staple: false, packageType: 'can', packages: [400], nutrition: n(100, 7, 13, 1, 0.5), diet: 'vegan', tags: ['legume'] },
  bacon: { id: 'bacon', name: 'Bacon', category: 'meat', storage: 'fridge', unit: 'g', staple: false, packageType: 'pack', packages: [150], nutrition: n(400, 13, 1, 0, 38, 3.5), diet: 'meat', tags: ['processed-meat'] },
};

function recipe(ingredients: Recipe['ingredients'], servings = 2, extra: Partial<Recipe> = {}): Recipe {
  return {
    id: 't', title: 'Test', description: 'A test recipe', mealTypes: ['dinner'], cuisine: 'everyday', family: 'stew', servings,
    prepMinutes: 10, cookMinutes: 20, difficulty: 'easy', mainProtein: 'none', ingredients, steps: ['a', 'b'],
    tags: [], keepsDays: 2, equipment: [], illustration: '🍽', ...extra,
  };
}

describe('toIngredientUnit', () => {
  it('converts spoons to ml and to grams via density', () => {
    expect(toIngredientUnit(ING.oil, 2, 'tbsp')).toBe(30);
    expect(toIngredientUnit(ING.sugar, 1, 'tsp')).toBe(5);
  });
  it('converts pieces to grams and grams to pieces', () => {
    expect(toIngredientUnit(ING.carrot, 2, 'piece')).toBe(160);
    expect(toIngredientUnit(ING.egg, 120, 'g')).toBe(2);
  });
  it('rejects units that do not fit', () => {
    expect(() => toIngredientUnit(ING.rice, 1, 'piece')).toThrow(UnitError);
    expect(() => toIngredientUnit(ING.egg, 1, 'ml')).toThrow(UnitError);
  });
});

describe('recipeFacts', () => {
  it('sums nutrition per serving', () => {
    const f = recipeFacts(recipe([{ id: 'rice', quantity: 200, unit: 'g' }, { id: 'oil', quantity: 2, unit: 'tbsp' }]), ING);
    // rice 200 g = 700 kcal, oil 30 ml = 246 kcal, per 2 servings
    expect(f.perServing.kcal).toBe(473);
    expect(f.perServing.carbs).toBe(79);
    expect(f.diet).toBe('vegan');
  });
  it('uses piece weight for eggs and counts only the edible part of fish', () => {
    const eggs = recipeFacts(recipe([{ id: 'egg', quantity: 2, unit: 'piece' }, { id: 'rice', quantity: 1, unit: 'g' }], 1), ING);
    expect(eggs.perServing.protein).toBe(15.2); // 120 g eggs
    const fish = recipeFacts(recipe([{ id: 'fish', quantity: 1, unit: 'piece' }, { id: 'rice', quantity: 1, unit: 'g' }], 1), ING);
    expect(fish.perServing.protein).toBe(40.1); // 200 g edible fish
    expect(fish.fish).toBe(true);
    expect(fish.diet).toBe('pescatarian');
  });
  it('ignores optional ingredients for nutrition and diet', () => {
    const f = recipeFacts(recipe([{ id: 'rice', quantity: 100, unit: 'g' }, { id: 'bacon', quantity: 100, unit: 'g', optional: true }], 1), ING);
    expect(f.perServing.kcal).toBe(350);
    expect(f.diet).toBe('vegan');
    expect(f.processedMeat).toBe(false);
  });
  it('counts added sugar, vegetable portions and caps legumes at one portion', () => {
    const f = recipeFacts(
      recipe([{ id: 'sugar', quantity: 20, unit: 'g' }, { id: 'carrot', quantity: 160, unit: 'g' }, { id: 'beans', quantity: 400, unit: 'g' }], 1),
      ING,
    );
    expect(f.perServing.addedSugar).toBe(20);
    expect(f.perServing.vegPortions).toBe(3); // 2 carrot portions + max 1 legume portion
    expect(f.legumeMain).toBe(true);
  });
  it('rejects unknown ingredients', () => {
    expect(() => recipeFacts(recipe([{ id: 'unicorn', quantity: 1, unit: 'g' }, { id: 'rice', quantity: 1, unit: 'g' }]), ING)).toThrow(/unknown/);
  });
});

describe('diet and collections', () => {
  it('knows which diets a recipe fits', () => {
    expect(dietAllows('vegetarian', 'vegan')).toBe(true);
    expect(dietAllows('vegetarian', 'pescatarian')).toBe(false);
    expect(dietAllows('pescatarian', 'pescatarian')).toBe(true);
    expect(dietAllows('none', 'meat')).toBe(true);
  });
  it('sorts recipes into the spec groups', () => {
    expect(collectionOf(recipe([], 1, { mealTypes: ['snack'], tags: ['batch'] }))).toBe('batch-snack');
    expect(collectionOf(recipe([], 1, { mealTypes: ['breakfast'], tags: ['quick'] }))).toBe('breakfast');
    expect(collectionOf(recipe([], 1, { mealTypes: ['dinner'], tags: ['quick'] }))).toBe('quick');
    expect(collectionOf(recipe([], 1, { mealTypes: ['breakfast', 'dinner'] }))).toBe('main');
  });
});
