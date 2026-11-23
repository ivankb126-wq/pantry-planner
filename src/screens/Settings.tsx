// Settings: everything from onboarding plus planning options and backups.

import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { type Settings, importBackup, resetData, update, useApp } from '../app/state';
import { formatEur, formatShortDate } from '../lib/format';
import { IconChevron } from '../ui/icons';
import { Chip, Screen, Sheet, Stepper, TitleBar, Toast, Toggle, useToast } from '../ui/kit';
import { plural } from '../ui/words';
import { DIET_OPTIONS, DietPicker, DislikesPicker, MEAL_OPTIONS, MealsPicker, StoreModePicker, StorePicker } from './pickers';
import { InstallSteps, isInstalled } from './Install';
import { storeSummary } from './Plan';
import { setAllPhotos } from '../app/photos';
import { saveBackup } from '../app/backup';

function set(p: Partial<Settings>) {
  update((x) => {
    x.settings = { ...x.settings, ...p };
    if (x.settings.activeStore >= x.settings.stores.length) x.settings.activeStore = 0;
    if (x.settings.stores.length < 2) x.settings.storeMode = 'one';
  });
}

/** One reminder kind on or off (read from the latest settings, so quick taps all count). */
function setReminder(kind: keyof Settings['reminders'], on: boolean) {
  update((x) => {
    x.settings = { ...x.settings, reminders: { ...x.settings.reminders, [kind]: on } };
  });
}

const SOUP_OPTIONS: { id: Settings['soup']; label: string; hint: string }[] = [
  { id: 'off', label: 'No soup', hint: 'Just the main dish.' },
  { id: 'weekend', label: 'At the weekend', hint: 'A Saturday and Sunday pot, like a Sunday lunch at home.' },
  { id: 'daily', label: 'Every day', hint: 'One pot lasts 3 or 4 days. A soup that freezes well can last the week: freeze part of it the day you cook.' },
];
const SALAD_OPTIONS: { id: Settings['salad']; label: string; hint: string }[] = [
  { id: 'off', label: 'No side salad', hint: '' },
  { id: 'main', label: 'With the main meal', hint: 'With lunch, or with dinner if you do not plan lunch.' },
  { id: 'both', label: 'With lunch and dinner', hint: 'A bowl of cabbage or beetroot salad lasts a few days.' },
];

export function soupSaladSummary(s: Settings): string {
  const soup = s.soup === 'daily' ? 'Soup every day' : s.soup === 'weekend' ? 'Soup at weekends' : '';
  const salad = s.salad === 'both' ? 'salad with lunch and dinner' : s.salad === 'main' ? 'side salad' : '';
  if (!soup && !salad) return 'Off';
  if (!soup) return salad.charAt(0).toUpperCase() + salad.slice(1);
  return salad ? `${soup}, ${salad}` : soup;
}

function OptionList<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="option-list" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} class={`option${value === o.id ? ' on' : ''}`} onClick={() => onChange(o.id)}>
          <span class="radio" />
          <span class="grow">
            {o.label}
            {o.hint && <small>{o.hint}</small>}
          </span>
        </button>
      ))}
    </div>
  );
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
    const titles: Record<string, string> = { people: 'People', budget: 'Weekly budget', stores: 'My stores', meals: 'Meals to plan', diet: 'Diet and dislikes', extras: 'Soup and salad' };
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
        {section === 'extras' && (
          <>
            <p class="label">A small bowl of soup before the main meal</p>
            <OptionList label="Soup to start" value={s.soup} options={SOUP_OPTIONS} onChange={(v) => set({ soup: v })} />
            <p class="label">A side salad</p>
            <OptionList label="Side salad" value={s.salad} options={SALAD_OPTIONS} onChange={(v) => set({ salad: v })} />
            <p class="hint">The main dish gets a little smaller on soup days, so you eat about the same in a day. Soup and salad are in the shopping list and the costs.</p>
          </>
        )}
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
        <Row href="#/settings/extras" label="Soup and salad" value={soupSaladSummary(s)} />
        <Stepper label="Energy per adult a day" value={s.energyTarget} min={1600} max={3200} step={100} onChange={(v) => set({ energyTarget: v })} format={(v) => `${v} kcal`} />
        <Stepper label="Weekday cooking time" value={s.weekdayMaxMinutes} min={15} max={120} step={5} onChange={(v) => set({ weekdayMaxMinutes: v })} format={(v) => `${v} min`} />
        <Toggle label="A new dish every week" hint="One recipe you have never cooked." checked={s.newDishEachWeek} onChange={(v) => set({ newDishEachWeek: v })} />
        <Toggle label="Cook once, eat twice" hint="Lunch can be the last dinner's leftovers. A big pot like sarma or grah lasts two lunches." checked={s.cookOnceEatTwice} onChange={(v) => set({ cookOnceEatTwice: v })} />
        <Toggle label="Croatian classic at weekends" hint="Sarma, grah, pašticada and more, when the budget allows." checked={s.weekendClassic} onChange={(v) => set({ weekendClassic: v })} />
        <Toggle
          label="Meal prep Sunday"
          hint="One hour on Sunday: a pot of rice or potatoes, chopped onions and a soup or stew for the next days. Plans lean towards meals that share."
          checked={s.mealPrep}
          onChange={(v) => set({ mealPrep: v })}
        />
      </Group>

      <Group title="Reminders">
        <p class="group-note">Shown at the top of your plan when you open the app. Tap Done to hide one for the day.</p>
        <Toggle label="Start the day before" hint="Soaking beans or making overnight oats for tomorrow's meal." checked={s.reminders.ahead} onChange={(v) => setReminder('ahead', v)} />
        <Toggle label="Defrost" hint="Meat or fish in your freezer that today's or tomorrow's meal needs, and when to freeze and thaw a week's pot of soup." checked={s.reminders.defrost} onChange={(v) => setReminder('defrost', v)} />
        <Toggle label="Use it soon" hint="Pantry food that reaches its use-by date today or tomorrow." checked={s.reminders.expiry} onChange={(v) => setReminder('expiry', v)} />
      </Group>

      <BackupGroup />

      <Group title="About">
        <InstallRow />
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

function InstallRow() {
  const [open, setOpen] = useState(false);
  if (isInstalled()) {
    return (
      <div class="list-row">
        <span class="grow">
          On your home screen
          <small>The app works offline with the prices saved on your phone.</small>
        </span>
      </div>
    );
  }
  return (
    <>
      <button class="list-row link" onClick={() => setOpen(true)}>
        <span class="grow">
          Add to Home Screen
          <small>Opens like an app and works offline in the shop</small>
        </span>
        <IconChevron size={18} />
      </button>
      {open && (
        <Sheet title="Add to Home Screen" onClose={() => setOpen(false)}>
          <InstallSteps />
          <button class="btn-primary wide" onClick={() => setOpen(false)}>
            Got it
          </button>
        </Sheet>
      )}
    </>
  );
}

function BackupGroup() {
  const d = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useToast<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  const download = async () => {
    const r = await saveBackup();
    if (r === 'shared' || r === 'downloaded') setToast('Backup saved. Keep the file somewhere safe, for example iCloud Drive.');
    if (r === 'failed') setToast('The backup could not be saved. Try again.');
  };

  const restore = async (f: File) => {
    try {
      const photos = importBackup(await f.text());
      setAllPhotos(photos);
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
              {plural(d.ratings.length, 'rating', 'ratings')}, {plural(d.favourites.length, 'favourite', 'favourites')}, {plural(d.pantry.length, 'pantry item', 'pantry items')}. {d.lastBackupOn ? ` Last backup ${formatShortDate(d.lastBackupOn)}.` : ' No backup yet.'} Make one now and then, and before changing phones.
            </small>
          </span>
        </div>
        <div class="list-row buttons">
          <button class="btn-primary grow" onClick={() => void download()}>
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
