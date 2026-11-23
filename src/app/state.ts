// App state: one object, saved to IndexedDB after every change.

import { useEffect, useState } from 'preact/hooks';
import type { ChainId } from '../lib/data';
import type { Diet } from '../lib/nutrition';
import type { MainSlot, Meal, PantryItem, Rating } from '../planner/types';
import { dbGet, dbSet } from './db';

export interface StoreChoice {
  chain: ChainId;
  storeId: string;
  label: string; // "Lidl Jastrebarsko"
  address: string;
}

export interface Settings {
  onboarded: boolean;
  adults: number;
  children: number;
  budget: number;
  meals: MainSlot[];
  diet: Diet | 'none';
  dislikes: string[];
  stores: StoreChoice[];
  storeMode: 'one' | 'cheapest';
  activeStore: number; // which store, when storeMode is 'one'
  energyTarget: number;
  weekdayMaxMinutes: number;
  newDishEachWeek: boolean;
  cookOnceEatTwice: boolean;
  weekendClassic: boolean;
  /** Meal prep Sunday (off unless chosen). */
  mealPrep: boolean;
  /** With meal prep: prep the whole week, not just the next three evenings. */
  mealPrepBig: boolean;
  /** A small bowl of soup before the main meal: never, at the weekend or every day. */
  soup: 'off' | 'weekend' | 'daily';
  /** A side salad with the main meal, or with lunch and dinner. */
  salad: 'off' | 'main' | 'both';
  /** Reminders at the top of the plan, each kind off unless chosen. */
  reminders: { ahead: boolean; defrost: boolean; expiry: boolean };
  /** Roughly where you are, if you let the app find stores near you. Kept on this phone only. */
  home: { lat: number; lon: number } | null;
}

export interface SavedPlan {
  startDate: string;
  seed: number;
  meals: Meal[];
  cooked: number[]; // indexes of meals marked cooked
  avoid: Record<number, string[]>; // recipes already swapped out per meal
  settingsKey: string; // settings the plan was made with
  createdAt: string;
  /** What was at home when the plan was made. The week's shopping list is
   * based on this, so adding shopping or cooking later does not change it. */
  pantryAtStart: PantryItem[];
  leftoversSaved?: boolean;
  /** What "Mark cooked" took from the pantry, per meal (put back when unmarked). */
  taken?: Record<number, Amount[]>;
  /** Dishes eaten in the two weeks before this plan (they get a rest). */
  recent?: string[];
  /** Made with "Plan a week of favourites". */
  favourites?: boolean;
}

export interface Amount {
  ingredient: string;
  amount: number; // ingredient unit
}

export interface RatingEntry extends Rating {
  reasons?: string[];
  at: string;
}

export interface PantryEntry {
  id: string;
  ingredient: string;
  amount: number; // ingredient unit
  full: number; // amount when full (for the fill bar)
  storage: 'fridge' | 'shelves' | 'freezer';
  addedOn: string;
  expiresOn?: string;
}

export interface AppData {
  version: 1;
  settings: Settings;
  plan: SavedPlan | null;
  ratings: RatingEntry[];
  favourites: string[];
  notes: Record<string, string>;
  history: { recipeId: string; date: string }[];
  pantry: PantryEntry[];
  shoppingChecked: Record<string, boolean>;
  /** Staples that ran out (reached zero), to suggest for shopping. */
  ranOut: string[];
  /** Extra items added to the shopping list (running low). */
  extras: string[];
  /** Running-low suggestions dismissed, ingredient -> date. */
  lowDismissed: Record<string, string>;
  /** Last "Check my pantry". */
  pantryCheckedOn: string | null;
  lastBackupOn: string | null;
  backupSnoozedUntil: string | null;
  /** What went from the shopping list into the pantry (for the weekly recap). */
  purchases: { date: string; ingredient: string; cost: number; saved: number }[];
  /** "I threw this away" on a pantry item. */
  thrown: { date: string; ingredient: string; amount: number; value: number }[];
  /** Recaps of past weeks, newest last. */
  recaps: WeekRecap[];
}

export interface WeekRecap {
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  saved: number;
  bought: number; // shopping lines put in the pantry
  cooked: number;
  toCook: number;
  thrownCount: number;
  thrownValue: number;
  thrownNames: string[];
  newDishes: string[]; // recipe ids cooked for the first time
  favourite: string | null; // a new dish you gave a thumbs up
}

export const DEFAULT_APP_SETTINGS: Settings = {
  onboarded: false,
  adults: 2,
  children: 0,
  budget: 80,
  meals: ['breakfast', 'lunch', 'dinner'],
  diet: 'none',
  dislikes: [],
  stores: [],
  storeMode: 'one',
  activeStore: 0,
  energyTarget: 2200,
  weekdayMaxMinutes: 45,
  newDishEachWeek: true,
  cookOnceEatTwice: true,
  weekendClassic: true,
  mealPrep: false,
  mealPrepBig: false,
  soup: 'off',
  salad: 'off',
  reminders: { ahead: false, defrost: false, expiry: false },
  home: null,
};

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_APP_SETTINGS },
    plan: null,
    ratings: [],
    favourites: [],
    notes: {},
    history: [],
    pantry: [],
    shoppingChecked: {},
    ranOut: [],
    extras: [],
    lowDismissed: {},
    pantryCheckedOn: null,
    lastBackupOn: null,
    backupSnoozedUntil: null,
    purchases: [],
    thrown: [],
    recaps: [],
  };
}

/** The settings that change what a plan looks like. */
export function settingsKey(s: Settings): string {
  return JSON.stringify([s.adults, s.children, s.budget, s.meals, s.diet, s.dislikes, s.stores.map((x) => x.chain + x.storeId), s.storeMode, s.activeStore, s.energyTarget, s.weekdayMaxMinutes, s.newDishEachWeek, s.cookOnceEatTwice, ...(s.weekendClassic ? [] : ['no-weekend-classic']), ...(s.mealPrep ? ['meal-prep'] : []), ...(s.mealPrep && s.mealPrepBig ? ['meal-prep-big'] : []), ...(s.soup !== 'off' ? [`soup-${s.soup}`] : []), ...(s.salad !== 'off' ? [`salad-${s.salad}`] : [])]);
}

// ------------------------------------------------------------------ store

const KEY = 'data';
let data: AppData = emptyData();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadData(): Promise<AppData> {
  const saved = await dbGet<AppData>(KEY);
  data = saved ? migrate(saved) : emptyData();
  loaded = true;
  listeners.forEach((l) => l());
  return data;
}

export function migrate(d: AppData): AppData {
  const base = emptyData();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) } };
  if (out.plan) out.plan = { ...out.plan, cooked: out.plan.cooked ?? [], avoid: out.plan.avoid ?? {}, pantryAtStart: out.plan.pantryAtStart ?? [] };
  return out;
}

/** Start again from scratch (used by Settings). */
export function resetData(): void {
  update(() => emptyData());
}

export function getData(): AppData {
  return data;
}

export function isLoaded(): boolean {
  return loaded;
}

/** Change state. The updater gets a copy-on-write draft. */
export function update(fn: (d: AppData) => AppData | void): void {
  const draft = structuredClone(data);
  data = fn(draft) ?? draft;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void dbSet(KEY, data), 250);
}

export function useApp(): AppData {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return data;
}

// ------------------------------------------------------------------ backup

/** The backup file. photos (recipe id -> image) are kept outside AppData. */
export function exportBackup(photos: Record<string, string> = {}): string {
  return JSON.stringify({ app: 'pantry-planner', exportedAt: new Date().toISOString(), data, photos }, null, 1);
}

/** Replace everything with a backup file's contents. Returns the photos in it. Throws a readable error. */
export function importBackup(text: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Pantry Planner backup.');
  }
  const p = parsed as { app?: string; data?: AppData; photos?: Record<string, string> };
  if (p.app !== 'pantry-planner' || !p.data || p.data.version !== 1 || typeof p.data.settings !== 'object') {
    throw new Error('This file is not a Pantry Planner backup.');
  }
  update(() => migrate(p.data!));
  return p.photos && typeof p.photos === 'object' ? p.photos : {};
}
