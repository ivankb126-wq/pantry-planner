// Settings: everything from onboarding plus planning options and backups.

import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { type Settings, exportBackup, importBackup, resetData, update, useApp } from '../app/state';
import { formatEur, zagrebToday } from '../lib/format';
import { IconChevron } from '../ui/icons';
import { Chip, Screen, Sheet, Stepper, TitleBar, Toast, Toggle, useToast } from '../ui/kit';
import { plural } from '../ui/words';
import { DIET_OPTIONS, DietPicker, DislikesPicker, MEAL_OPTIONS, MealsPicker, StoreModePicker, StorePicker } from './pickers';
import { storeSummary } from './Plan';

function set(p: Partial<Settings>) {
  update((x) => {
    x.settings = { ...x.settings, ...p };
    if (x.settings.activeStore >= x.settings.stores.length) x.settings.activeStore = 0;
    if (x.settings.stores.length < 2) x.settings.storeMode = 'one';
  });
}

function Row({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a class="list-row link" href={href}>
      <span class="grow">{label}</span>
      <span class="row-value">{value}</span>
      <IconChevron size={18} />
    </a>
  );
}

function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="settings-group">
      <h2 class="group-title">{title}</h2>
      <div class="card list">{children}</div>
    </section>
  );
}

export function SettingsScreen({ section }: { section?: string }) {
  const d = useApp();
  const s = d.settings;

  if (section) {
    const titles: Record<string, string> = { people: 'People', budget: 'Weekly budget', stores: 'My stores', meals: 'Meals to plan', diet: 'Diet and dislikes' };
    return (
      <Screen glow="pink">
        <TitleBar title={titles[section] ?? 'Settings'} backTo="#/settings" />
        {section === 'people' && (
          <div class="card tight">
            <Stepper label="Adults" value={s.adults} min={1} max={8} onChange={(v) => set({ adults: v })} />
            <Stepper label="Children" value={s.children} min={0} max={8} onChange={(v) => set({ children: v })} />
          </div>
        )}
        {section === 'budget' && (
          <>
            <div class="card tight">
              <Stepper label="Per week" value={s.budget} min={20} max={400} step={5} onChange={(v) => set({ budget: v })} format={(v) => formatEur(v)} />
            </div>
            <div class="chip-wrap">
              {[40, 60, 80, 100, 130].map((b) => (
                <Chip key={b} on={s.budget === b} onClick={() => set({ budget: b })}>
                  {formatEur(b)}
                </Chip>
              ))}
            </div>
          </>
        )}
        {section === 'stores' && (
          <>
            <StorePicker stores={s.stores} onChange={(st) => set({ stores: st })} />
            {s.stores.length > 1 && (
              <>
                <p class="label">How should I shop?</p>
                <StoreModePicker s={s} onChange={set} />
              </>
            )}
            {!s.stores.length && <p class="hint">Pick at least one store, or the plan has no prices.</p>}
          </>
        )}
        {section === 'meals' && <MealsPicker meals={s.meals} onChange={(m) => set({ meals: m })} />}
        {section === 'diet' && (
          <>
            <DietPicker diet={s.diet} onChange={(v) => set({ diet: v })} />
            <p class="label">Foods you never want</p>
            <DislikesPicker dislikes={s.dislikes} onChange={(v) => set({ dislikes: v })} />
          </>
        )}
        <p class="fineprint">Changes are saved straight away. The Plan screen offers a new plan when your settings change.</p>
      </Screen>
    );
  }

  const meals = MEAL_OPTIONS.filter((m) => s.meals.includes(m.id))
    .map((m) => m.label)
    .join(', ');
  const diet = DIET_OPTIONS.find((o) => o.id === s.diet)?.label ?? 'Everything';
  const people = [plural(s.adults, 'adult', 'adults'), s.children ? plural(s.children, 'child', 'children') : ''].filter(Boolean).join(', ');

  return (
    <Screen glow="pink">
      <TitleBar title="Settings" backTo="#/plan" />

      <Group title="Household">
        <Row href="#/settings/people" label="People" value={people} />
        <Row href="#/settings/budget" label="Weekly budget" value={formatEur(s.budget)} />
        <Row href="#/settings/stores" label="My stores" value={storeSummary(s)} />
      </Group>

      <Group title="Planning">
        <Row href="#/settings/meals" label="Meals" value={meals} />
        <Row href="#/settings/diet" label="Diet and dislikes" value={s.dislikes.length ? `${diet}, ${s.dislikes.length} dislikes` : diet} />
        <Stepper label="Energy per adult a day" value={s.energyTarget} min={1600} max={3200} step={100} onChange={(v) => set({ energyTarget: v })} format={(v) => `${v} kcal`} />
        <Stepper label="Weekday cooking time" value={s.weekdayMaxMinutes} min={15} max={120} step={5} onChange={(v) => set({ weekdayMaxMinutes: v })} format={(v) => `${v} min`} />
        <Toggle label="A new dish every week" hint="One recipe you have never cooked." checked={s.newDishEachWeek} onChange={(v) => set({ newDishEachWeek: v })} />
        <Toggle label="Cook once, eat twice" hint="Lunch can be the last dinner's leftovers." checked={s.cookOnceEatTwice} onChange={(v) => set({ cookOnceEatTwice: v })} />
      </Group>

      <BackupGroup />

      <Group title="About">
        <a class="list-row link" href="#/data">
          <span class="grow">
            Price data and dates
            <small>Which chains and days the prices come from</small>
          </span>
          <IconChevron size={18} />
        </a>
        <div class="list-row">
          <span class="grow">
            Pantry Planner
            <small>Orientation prices from the official daily price lists of Croatian supermarkets, via cijene.dev. Loyalty card and app-only discounts may be missing. Nutrition is general healthy eating guidance, not medical advice. Your data stays on this phone.</small>
          </span>
        </div>
      </Group>
    </Screen>
  );
}

function BackupGroup() {
  const d = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useToast<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pantry-planner-backup-${zagrebToday()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setToast('Backup saved. Keep the file somewhere safe, for example iCloud Drive.');
  };

  const restore = async (f: File) => {
    try {
      importBackup(await f.text());
      setToast('Backup restored.');
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  return (
    <>
      <Group title="Your data">
        <div class="list-row">
          <span class="grow">
            Everything is saved on this phone only
            <small>
              {plural(d.ratings.length, 'rating', 'ratings')}, {plural(d.favourites.length, 'favourite', 'favourites')}, {plural(d.pantry.length, 'pantry item', 'pantry items')}. Make a backup now and then, and before changing phones.
            </small>
          </span>
        </div>
        <div class="list-row buttons">
          <button class="btn-primary grow" onClick={download}>
            Back up my data
          </button>
          <button class="btn-ghost grow" onClick={() => file.current?.click()}>
            Restore a backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) void restore(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>
        <button class="list-row link danger" onClick={() => setConfirmReset(true)}>
          <span class="grow">Start over</span>
        </button>
      </Group>
      {confirmReset && (
        <Sheet title="Start over?" sub="This deletes your plan, ratings, notes and pantry on this phone. It cannot be undone. Make a backup first if you might want them back." onClose={() => setConfirmReset(false)}>
          <div class="sheet-btns">
            <button class="btn-ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              class="btn-primary"
              onClick={() => {
                resetData();
                setConfirmReset(false);
                location.hash = '#/plan';
              }}
            >
              Delete everything
            </button>
          </div>
        </Sheet>
      )}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
