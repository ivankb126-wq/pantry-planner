import { beforeEach, describe, expect, it } from 'vitest';
import { pantryEntry } from './planning';
import { dismissReminder, reminders } from './reminders';
import { type AppData, emptyData } from './state';

// A tiny stand-in for the browser's storage, for "Done".
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
});

const TODAY = '2026-11-23'; // Monday, day 0 of the plan

function data(): AppData {
  const d = emptyData();
  d.settings.reminders = { ahead: true, defrost: true, expiry: true };
  d.plan = {
    startDate: TODAY,
    seed: 1,
    meals: [
      { day: 0, slot: 'dinner', recipeId: 'chicken-vegetable-stir-fry', source: 'cook' },
      { day: 1, slot: 'breakfast', recipeId: 'overnight-oats-jars', source: 'cook' },
      { day: 1, slot: 'dinner', recipeId: 'oslic-na-bijelo', source: 'cook' },
    ],
    cooked: [],
    avoid: {},
    settingsKey: '',
    createdAt: 'plan-1',
    pantryAtStart: [],
  };
  d.pantry = [
    { ...pantryEntry('hake', 500, TODAY), storage: 'freezer' },
    { ...pantryEntry('chicken-breast', 400, '2026-11-21'), expiresOn: '2026-11-24' },
    { ...pantryEntry('milk', 1000, '2026-11-15'), expiresOn: '2026-11-22' },
  ];
  return d;
}

describe('reminders', () => {
  beforeEach(() => store.clear());

  it('says what to start tonight, what to take out of the freezer and what to use soon', () => {
    expect(reminders(data(), TODAY).map((r) => r.text)).toEqual([
      "Tonight: make the oats for tomorrow's Overnight oats jars with berries.",
      "Move the hake fillets from the freezer to the fridge tonight, for tomorrow's Hake na bijelo.",
      'Milk was to be used by 22 Nov. Check it before you use it.',
      "Chicken breast: use by tomorrow. Today's Chicken and vegetable stir-fry uses it.",
    ]);
  });

  it('shows nothing for kinds that are switched off', () => {
    const d = data();
    d.settings.reminders = { ahead: false, defrost: false, expiry: false };
    expect(reminders(d, TODAY)).toEqual([]);
  });

  it('skips meals already cooked and food that is not frozen', () => {
    const d = data();
    d.plan!.cooked = [2];
    d.pantry = d.pantry.map((p) => (p.ingredient === 'hake' ? { ...p, storage: 'fridge' as const } : p));
    expect(reminders(d, TODAY).some((r) => r.kind === 'defrost')).toBe(false);
  });

  it('hides a reminder marked done for the rest of the day', () => {
    const first = reminders(data(), TODAY)[0];
    dismissReminder(first.key, TODAY);
    expect(reminders(data(), TODAY).some((r) => r.key === first.key)).toBe(false);
    expect(reminders(data(), '2026-11-24').length).toBeGreaterThan(0);
  });
});
