// Reminders, shown at the top of the plan when the app is opened (there is no
// push server, so nothing pops up while the app is closed). Three kinds, each
// switched on in Settings: what to start the day before, what to take out of
// the freezer, and food that reaches its use-by date.

import { daysBetween, formatShortDate, zagrebToday } from '../lib/format';
import { readPref, writePref } from '../lib/prefs';
import { addDays } from '../planner/evaluate';
import { dayLong } from '../ui/words';
import { INGREDIENTS, RECIPE_BY_ID } from './catalog';
import type { AppData } from './state';

export type ReminderKind = 'ahead' | 'defrost' | 'expiry';

export interface Reminder {
  key: string; // stable, for "Done"
  kind: ReminderKind;
  text: string;
  href?: string;
}

const THAW = new Set(['meat', 'fish']);
const HIDDEN = 'reminders-done';

export function reminders(d: AppData, today = zagrebToday()): Reminder[] {
  const on = d.settings.reminders;
  const out: Reminder[] = [];
  const plan = d.plan;
  const t = plan ? daysBetween(plan.startDate, today) : 0;
  const upcoming = plan
    ? plan.meals
        .map((m, i) => ({ m, i, r: RECIPE_BY_ID.get(m.recipeId) }))
        .filter(({ m, i, r }) => r && m.source === 'cook' && m.day >= t && !plan.cooked.includes(i))
    : [];
  const short = (title: string) => title.replace(/\s*\(.*\)$/, '');
  const when = (day: number) => (day === t ? 'today' : day === t + 1 ? 'tomorrow' : dayLong(addDays(plan!.startDate, day)));

  if (on.ahead) {
    for (const { m, i, r } of upcoming) {
      if (m.day !== t + 1 || !r!.ahead) continue;
      out.push({ key: `ahead:${plan!.createdAt}:${i}`, kind: 'ahead', text: `Tonight: ${r!.ahead} for tomorrow's ${short(r!.title)}.`, href: `#/recipe/${r!.id}?meal=${i}` });
    }
  }

  if (on.defrost) {
    const frozen = new Set(d.pantry.filter((p) => p.storage === 'freezer' && p.amount > 0).map((p) => p.ingredient));
    const seen = new Set<string>();
    for (const { m, i, r } of upcoming) {
      if (m.day > t + 1) continue;
      for (const ri of r!.ingredients) {
        const ing = INGREDIENTS[ri.id];
        if (ri.optional || !ing || !THAW.has(ing.category) || !frozen.has(ri.id) || seen.has(ri.id)) continue;
        seen.add(ri.id);
        const name = ing.name.replace(/\s*\(.*\)$/, '').toLowerCase();
        const text =
          m.day === t
            ? `Take the ${name} out of the freezer now for today's ${short(r!.title)}. Thaw in a sealed bag in a bowl of cold water, or in the fridge if there is time.`
            : `Move the ${name} from the freezer to the fridge tonight, for tomorrow's ${short(r!.title)}.`;
        out.push({ key: `defrost:${plan!.createdAt}:${i}:${ri.id}`, kind: 'defrost', text, href: `#/recipe/${r!.id}?meal=${i}` });
      }
    }
  }

  if (on.expiry) {
    const soon = d.pantry
      .filter((p) => p.storage !== 'freezer' && p.amount > 0 && p.expiresOn && daysBetween(today, p.expiresOn) <= 1)
      .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
    for (const p of soon) {
      const name = INGREDIENTS[p.ingredient]?.name.replace(/\s*\(.*\)$/, '') ?? p.ingredient;
      const left = daysBetween(today, p.expiresOn!);
      const use = upcoming.find(({ r }) => r!.ingredients.some((x) => x.id === p.ingredient && !x.optional));
      let text =
        left < 0
          ? `${name} was to be used by ${formatShortDate(p.expiresOn!)}. Check it before you use it.`
          : `${name}: use by ${left === 0 ? 'today' : 'tomorrow'}.`;
      if (left >= 0) {
        text += use && use.m.day <= t + left ? ` ${capital(when(use.m.day))}'s ${short(use.r!.title)} uses it.` : ' Cook it soon or freeze it.';
      }
      out.push({ key: `expiry:${p.id}:${p.expiresOn}`, kind: 'expiry', text, href: use && left >= 0 && use.m.day <= t + left ? `#/recipe/${use.r!.id}?meal=${use.i}` : '#/pantry' });
    }
  }

  const done = readPref<Record<string, string>>(HIDDEN) ?? {};
  return out.filter((x) => done[x.key] !== today);
}

/** "Done": hide a reminder for the rest of the day. */
export function dismissReminder(key: string, today = zagrebToday()): void {
  const done = readPref<Record<string, string>>(HIDDEN) ?? {};
  // Keep the list short: only today's entries matter.
  const keep = Object.fromEntries(Object.entries(done).filter(([, day]) => day === today));
  writePref(HIDDEN, { ...keep, [key]: today });
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
