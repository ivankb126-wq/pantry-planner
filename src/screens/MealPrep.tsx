// Meal prep Sunday: the one-hour timeline and what each part is for.
// Steps can be ticked off; the screen stays on while you cook.

import { useState } from 'preact/hooks';
import { RECIPE_BY_ID } from '../app/catalog';
import { planDate } from '../app/planning';
import { prepFor, prepTicksKey } from '../app/prep';
import { go } from '../app/router';
import { type AppData, update, useApp } from '../app/state';
import { formatShortDate } from '../lib/format';
import { readPref, writePref } from '../lib/prefs';
import type { PrepPlan } from '../planner/prep';
import { IconCheck } from '../ui/icons';
import { Empty, Screen, TitleBar } from '../ui/kit';
import { useWakeLock } from '../ui/wakeLock';
import { dayLong } from '../ui/words';

export function MealPrep() {
  const d = useApp();
  const awake = useWakeLock();
  const p = prepFor(d);
  const key = prepTicksKey(d);
  const [done, setDone] = useState<string[]>(() => readPref<string[]>(key) ?? []);
  const toggle = (k: string) => {
    const next = done.includes(k) ? done.filter((x) => x !== k) : [...done, k];
    setDone(next);
    writePref(key, next);
  };

  if (!d.settings.mealPrep || !d.plan || !p) {
    return (
      <Screen glow="teal" tabs={false}>
        <TitleBar title="Meal prep Sunday" backTo="#/plan" />
        {!d.settings.mealPrep ? (
          <Empty
            title="Meal prep Sunday is off"
            action="Turn it on"
            onAction={() => {
              update((x) => {
                x.settings = { ...x.settings, mealPrep: true };
              });
              go('plan');
            }}
          >
            One hour on Sunday cooks the rice or potatoes, chops the onions and makes a soup or stew for the next days. Plans then lean towards meals that share. You can
            turn it off in Settings.
          </Empty>
        ) : !d.plan ? (
          <Empty title="No plan yet" action="Go to my plan" onAction={() => go('plan')}>
            Make a plan first, then Sunday's prep is worked out from it.
          </Empty>
        ) : (
          <Empty title="Nothing worth prepping this week" action="Back to my plan" onAction={() => go('plan')}>
            The first meals of the week share too little to save time by cooking ahead. Next week's plan will try again.
          </Empty>
        )}
      </Screen>
    );
  }

  return (
    <Screen glow="teal" tabs={false}>
      <TitleBar kicker={`${dayLong(p.date)} ${formatShortDate(p.date)}`} title="Meal prep Sunday" backTo="#/plan" />

      <section class="card prep-summary" aria-label="Summary">
        <div class="prep-stats">
          <div>
            <strong>{p.minutes} min</strong>
            <small>on Sunday</small>
          </div>
          <div>
            <strong>{p.saves} min</strong>
            <small>saved {prepRange(d, p)}</small>
          </div>
        </div>
        {awake && <small class="muted">The screen stays on while you prep.</small>}
      </section>

      <section class="card" aria-label="Timeline">
        <h2>Timeline</h2>
        <p class="sub">Times are minutes from when you start. Tick each step as you go.</p>
        <ol class="prep-timeline">
          {p.steps.map((s) => {
            const k = `${s.at}:${s.text}`;
            const on = done.includes(k);
            return (
              <li key={k}>
                <label class={`prep-step${on ? ' done' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(k)} />
                  <span class="prep-time">{clock(s.at)}</span>
                  <span class="grow">
                    <strong>{s.text}</strong>
                    {s.detail && <small>{s.detail}</small>}
                  </span>
                  <span class="box" aria-hidden="true">
                    {on && <IconCheck size={18} />}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      <section class="card" aria-label="What it is for">
        <h2>What it is for</h2>
        <ul class="prep-tasks">
          {p.tasks.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong>
              <ul class="prep-uses">
                {t.uses.map((u) => (
                  <li key={u.meal}>
                    <a href={`#/recipe/${u.recipeId}?meal=${u.meal}`}>
                      <span class="muted">{u.label}:</span> {RECIPE_BY_ID.get(u.recipeId)?.title ?? u.recipeId}
                    </a>
                  </li>
                ))}
              </ul>
              {t.tip && <p class="prep-tip">{t.tip}</p>}
            </li>
          ))}
        </ul>
      </section>
      <p class="fineprint">On the night, each recipe says what is already done.</p>
    </Screen>
  );
}

/** "from Monday to Wednesday", or "on Monday and Tuesday" */
export function prepRange(d: AppData, p: PrepPlan): string {
  const first = dayLong(planDate(d.plan!, p.days[0]));
  const last = dayLong(planDate(d.plan!, p.days[p.days.length - 1]));
  return p.days.length === 2 ? `on ${first} and ${last}` : `from ${first} to ${last}`;
}

function clock(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
