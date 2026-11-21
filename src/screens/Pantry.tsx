// Pantry: Fridge, Shelves and Freezer, with items on glowing planks.

import { useMemo, useRef, useState } from 'preact/hooks';
import { removeFromPantry, restorePantry, setCooked, throwAway, undoThrowAway } from '../app/actions';
import { priceIndex } from '../app/costs';
import { INGREDIENTS, INGREDIENT_LIST, RECIPE_BY_ID, ingName } from '../app/catalog';
import { isExpiring, isLow, needsCheck, stock, takenText } from '../app/pantry';
import { todayIndex } from '../app/planning';
import { type Amount, type PantryEntry, update, useApp } from '../app/state';
import { daysBetween, formatAmount, formatShortDate, zagrebToday } from '../lib/format';
import type { IngredientInfo } from '../lib/nutrition';
import { IconCheck, IconClose, IconPlus, IconSearch } from '../ui/icons';
import { Chip, Screen, Segmented, Sheet, Toast, useToast } from '../ui/kit';
import { SLOT_LABEL, plural } from '../ui/words';
import { fold } from './pickers';
import { RunningLow } from './RunningLow';
import type { PriceState } from './Plan';

type Section = PantryEntry['storage'];
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'fridge', label: 'Fridge' },
  { id: 'shelves', label: 'Shelves' },
  { id: 'freezer', label: 'Freezer' },
];

export const STAPLES = ['olive-oil', 'sunflower-oil', 'salt', 'black-pepper', 'sugar', 'flour', 'rice', 'pasta', 'eggs', 'onion', 'garlic', 'milk', 'butter'];

const COLOUR: Record<string, string> = {
  'fruit-veg': '#3DE3D0',
  meat: '#FF4FA3',
  fish: '#9B5CFF',
  dairy: '#FFF1F7',
  eggs: '#FFD9A8',
  bakery: '#FF9A3C',
  grains: '#FFC46B',
  legumes: '#FF9A3C',
  canned: '#9B5CFF',
  sauces: '#FF4FA3',
  oils: '#FFC46B',
  spices: '#FF9A3C',
  baking: '#FFF1F7',
  nuts: '#FF9A3C',
  frozen: '#3DE3D0',
  sweets: '#FF4FA3',
  drinks: '#9B5CFF',
};

/** Package icon by type, coloured by food. */
export function PackIcon({ type, colour }: { type: string; colour: string }) {
  const s = { fill: colour, stroke: '#140B24', 'stroke-width': 1.5, 'stroke-linejoin': 'round' as const };
  let shape;
  switch (type) {
    case 'jar':
      shape = (
        <>
          <rect x="9" y="5" width="14" height="5" rx="1.5" {...s} fill="#3A2560" />
          <rect x="7" y="10" width="18" height="18" rx="4" {...s} />
        </>
      );
      break;
    case 'bottle':
      shape = <path d="M13 3h6v5l3 4v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V12l3-4z" {...s} />;
      break;
    case 'can':
      shape = (
        <>
          <rect x="7" y="7" width="18" height="21" rx="3" {...s} />
          <path d="M7 11h18M7 24h18" stroke="#140B24" stroke-width="1.5" />
        </>
      );
      break;
    case 'bag':
      shape = <path d="M8 9l2-5h12l2 5-1 18a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z" {...s} />;
      break;
    case 'box':
    case 'carton':
      shape = (
        <>
          <path d="M8 9l4-5h8l4 5v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" {...s} />
          <path d="M8 9h16" stroke="#140B24" stroke-width="1.5" />
        </>
      );
      break;
    case 'tube':
      shape = <path d="M11 4h10l-1 3 2 18-6 4-6-4 2-18z" {...s} />;
      break;
    case 'loose':
      shape = (
        <>
          <circle cx="16" cy="18" r="10" {...s} />
          <path d="M16 8c0-3 2-4 4-4" stroke="#140B24" stroke-width="1.5" fill="none" />
        </>
      );
      break;
    default:
      shape = <rect x="5" y="9" width="22" height="16" rx="4" {...s} />;
  }
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      {shape}
    </svg>
  );
}

function stepFor(ing: IngredientInfo | undefined, full: number): number {
  if (!ing || ing.unit === 'piece') return 1;
  if (full <= 200) return 10;
  if (full <= 600) return 50;
  return 100;
}

function expiryText(e: PantryEntry, today: string): string | null {
  if (!e.expiresOn) return null;
  const days = daysBetween(today, e.expiresOn);
  if (days < 0) return 'past its date';
  if (days === 0) return 'use today';
  if (days === 1) return 'use by tomorrow';
  return `use by ${formatShortDate(e.expiresOn)}`;
}

export function PantryScreen({ prices }: { prices: PriceState }) {
  const d = useApp();
  const today = zagrebToday();
  const [section, setSection] = useState<Section>('fridge');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useToast<{ text: string; undo?: () => void }>(6000);

  const soon = d.pantry.filter((p) => isExpiring(p, today)).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
  const items = d.pantry.filter((p) => p.storage === section).sort((a, b) => ingName(a.ingredient).localeCompare(ingName(b.ingredient)));
  const rows: PantryEntry[][] = [];
  for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));
  const count = (s: Section) => d.pantry.filter((p) => p.storage === s).length;
  const edit = d.pantry.find((p) => p.id === editing) ?? null;

  const finish = (p: PantryEntry) => {
    const before = removeFromPantry(p.id);
    setToast({ text: `${ingName(p.ingredient)} finished and removed.`, undo: () => restorePantry(before) });
  };

  // Rough value of what is thrown away, from today's prices (0 while they load).
  const valueOf = (p: PantryEntry): number => {
    const o = prices.data ? priceIndex(prices.data).best.get(p.ingredient) : undefined;
    if (!o) return 0;
    return INGREDIENTS[p.ingredient]?.unit === 'piece' ? p.amount * o.unitPrice : (p.amount / 1000) * o.unitPrice;
  };
  const throwOut = (p: PantryEntry) => {
    const was = throwAway(p.id, valueOf(p));
    setToast({ text: `Noted as thrown away: ${ingName(p.ingredient)}. This counts in your weekly recap.`, undo: () => undoThrowAway(was) });
  };

  return (
    <Screen glow="purple">
      <header class="plan-head">
        <div>
          <p class="kicker">{plural(d.pantry.length, 'item', 'items')} at home</p>
          <h1>Pantry</h1>
        </div>
        <button class="icon-btn big pink" aria-label="Add to pantry" onClick={() => setAdding(true)}>
          <IconPlus />
        </button>
      </header>

      <Segmented label="Pantry section" options={SECTIONS.map((s) => ({ id: s.id, label: `${s.label} ${count(s.id) ? count(s.id) : ''}`.trim() }))} value={section} onChange={setSection} />

      <TonightCard />

      {needsCheck(d, today) && (
        <div class="notice">
          <span class="grow">Quick weekly check: is your pantry still right?</span>
          <button class="btn-small" onClick={() => setChecking(true)}>
            Check
          </button>
        </div>
      )}

      {soon.length > 0 && (
        <section class="use-soon" aria-label="Use soon">
          <h2>Use soon</h2>
          <ul>
            {soon.map((p) => (
              <li key={p.id}>
                <button onClick={() => setEditing(p.id)}>
                  <strong>{ingName(p.ingredient)}</strong> <span>{expiryText(p, today)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p class="sub">The planner uses these first in your next plan.</p>
        </section>
      )}

      <RunningLow />

      {items.length ? (
        <div class="shelves">
          {rows.map((row, ri) => (
            <div key={ri} class="shelf">
              <div class="shelf-items">
                {row.map((p) => (
                  <Tile key={p.id} p={p} today={today} onTap={() => setEditing(p.id)} onLong={() => finish(p)} />
                ))}
              </div>
              <div class="plank" aria-hidden="true" />
            </div>
          ))}
          <p class="fineprint center">Tap an item to change it. Press and hold when it is finished.</p>
        </div>
      ) : (
        <div class="empty-card">
          <h2>Nothing in the {SECTIONS.find((s) => s.id === section)!.label.toLowerCase()} yet</h2>
          <p class="sub">Add what you have, or tick your shopping and tap "Add basket to my pantry". The planner uses your pantry first.</p>
          <button class="btn-primary" onClick={() => setAdding(true)}>
            Add items
          </button>
        </div>
      )}

      {d.pantry.length > 0 && (
        <button class="btn-ghost wide" onClick={() => setChecking(true)}>
          Check my pantry
        </button>
      )}

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onAdd={(ingredient, amount) => {
            update((x) => stock(x, [{ ingredient, amount }]));
            setSection(INGREDIENTS[ingredient]?.storage ?? 'shelves');
            setToast({ text: `${ingName(ingredient)} added.` });
          }}
        />
      )}
      {edit && (
        <EditSheet
          entry={edit}
          onClose={() => setEditing(null)}
          onRemove={() => {
            setEditing(null);
            finish(edit);
          }}
          onThrow={() => {
            setEditing(null);
            throwOut(edit);
          }}
        />
      )}
      {checking && <CheckSheet onClose={() => setChecking(false)} />}
      {toast && (
        <Toast
          action={toast.undo ? 'Undo' : undefined}
          onAction={() => {
            toast.undo?.();
            setToast(null);
          }}
        >
          {toast.text}
        </Toast>
      )}
    </Screen>
  );
}

/** A pantry item on the shelf. Tap to edit, press and hold to finish it. */
function Tile({ p, today, onTap, onLong }: { p: PantryEntry; today: string; onTap: () => void; onLong: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  const ing = INGREDIENTS[p.ingredient];
  const frac = p.full > 0 ? Math.min(1, p.amount / p.full) : 1;
  const warn = isExpiring(p, today) || isLow(p);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      class="tile"
      onPointerDown={() => {
        long.current = false;
        cancel();
        timer.current = setTimeout(() => {
          long.current = true;
          navigator.vibrate?.(30);
          onLong();
        }, 600);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (long.current) {
          long.current = false;
          return;
        }
        onTap();
      }}
      aria-label={`${ingName(p.ingredient)}, ${formatAmount(Math.round(p.amount), ing?.unit ?? 'g')}${warn ? ', use soon or running low' : ''}. Edit`}
    >
      <PackIcon type={ing?.packageType ?? 'pack'} colour={COLOUR[ing?.category ?? ''] ?? '#B9A8D0'} />
      <span class="tile-name">{ingName(p.ingredient)}</span>
      <span class="tile-amount">{formatAmount(Math.round(p.amount), ing?.unit ?? 'g')}</span>
      <span class={`fill${warn ? ' warn' : ''}`}>
        <span style={{ width: `${Math.max(6, frac * 100)}%` }} />
      </span>
    </button>
  );
}

/** Tonight's meal with "Mark cooked", then what was taken with Undo. */
function TonightCard() {
  const d = useApp();
  const [done, setDone] = useState<{ index: number; taken: Amount[] } | null>(null);
  const plan = d.plan;
  if (!plan) return null;
  const t = todayIndex(plan);
  if (done) {
    return (
      <section class="taken-card" aria-live="polite">
        <p>
          <IconCheck size={18} /> <strong>Taken from your pantry:</strong> {done.taken.length ? takenText(done.taken) : 'nothing, it was not in your pantry'}.
        </p>
        <button
          class="link-btn"
          onClick={() => {
            setCooked(done.index, false);
            setDone(null);
          }}
        >
          Undo
        </button>
      </section>
    );
  }
  const order = ['dinner', 'lunch', 'breakfast', 'dessert', 'snack'];
  const candidates = plan.meals
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => m.day === t && m.source === 'cook' && !plan.cooked.includes(i))
    .sort((a, b) => order.indexOf(a.m.slot) - order.indexOf(b.m.slot));
  if (!candidates.length) return null;
  const { m, i } = candidates[0];
  const r = RECIPE_BY_ID.get(m.recipeId);
  if (!r) return null;
  return (
    <section class="tonight-card" aria-label="Tonight">
      <span class="tonight-emoji" aria-hidden="true">
        {r.illustration}
      </span>
      <span class="grow">
        <small>{m.slot === 'dinner' ? 'Tonight' : `Today, ${SLOT_LABEL[m.slot].toLowerCase()}`}</small>
        <a href={`#/recipe/${r.id}?meal=${i}`}>{r.title}</a>
      </span>
      <button class="btn-teal-outline" onClick={() => setDone({ index: i, taken: setCooked(i, true) })}>
        Mark cooked
      </button>
    </section>
  );
}

/** Weekly "Check my pantry": every item in one list to confirm or fix. */
function CheckSheet({ onClose }: { onClose: () => void }) {
  const d = useApp();
  const order: Section[] = ['fridge', 'shelves', 'freezer'];
  const list = [...d.pantry].sort((a, b) => order.indexOf(a.storage) - order.indexOf(b.storage) || ingName(a.ingredient).localeCompare(ingName(b.ingredient)));
  const set = (id: string, amount: number) =>
    update((x) => {
      x.pantry = x.pantry.map((e) => (e.id === id ? { ...e, amount, full: Math.max(e.full, amount) } : e));
    });
  return (
    <Sheet title="Check my pantry" sub="Fix anything that is not right. Rough amounts are fine." onClose={onClose}>
      <ul class="check-list">
        {list.map((p) => {
          const ing = INGREDIENTS[p.ingredient];
          const step = stepFor(ing, p.full);
          return (
            <li key={p.id}>
              <span class="grow">
                <strong>{ingName(p.ingredient)}</strong>
                <small>{SECTIONS.find((s) => s.id === p.storage)!.label}</small>
              </span>
              <div class="stepper2 small">
                <button aria-label={`Less ${ingName(p.ingredient)}`} disabled={p.amount <= step} onClick={() => set(p.id, Math.max(step, p.amount - step))}>
                  −
                </button>
                <span>{formatAmount(Math.round(p.amount), ing?.unit ?? 'g')}</span>
                <button aria-label={`More ${ingName(p.ingredient)}`} onClick={() => set(p.id, p.amount + step)}>
                  +
                </button>
              </div>
              <button class="icon-btn small" aria-label={`Remove ${ingName(p.ingredient)}`} onClick={() => removeFromPantry(p.id)}>
                <IconClose size={16} />
              </button>
            </li>
          );
        })}
        {!list.length && <li class="hint">Your pantry is empty.</li>}
      </ul>
      <button
        class="btn-primary wide"
        onClick={() => {
          update((x) => {
            x.pantryCheckedOn = zagrebToday();
          });
          onClose();
        }}
      >
        Looks right
      </button>
    </Sheet>
  );
}

function EditSheet({ entry, onClose, onRemove, onThrow }: { entry: PantryEntry; onClose: () => void; onRemove: () => void; onThrow: () => void }) {
  const ing = INGREDIENTS[entry.ingredient];
  const unit = ing?.unit ?? 'g';
  const step = stepFor(ing, entry.full);
  const set = (p: Partial<PantryEntry>) =>
    update((x) => {
      x.pantry = x.pantry.map((e) => (e.id === entry.id ? { ...e, ...p } : e));
    });
  return (
    <Sheet title={ingName(entry.ingredient)} sub={`Added ${formatShortDate(entry.addedOn)}`} onClose={onClose}>
      <div class="stepper-row">
        <span>Amount</span>
        <div class="stepper2">
          <button aria-label="Less" disabled={entry.amount <= step} onClick={() => set({ amount: Math.max(step, entry.amount - step) })}>
            −
          </button>
          <span aria-live="polite">{formatAmount(Math.round(entry.amount), unit)}</span>
          <button aria-label="More" onClick={() => set({ amount: entry.amount + step, full: Math.max(entry.full, entry.amount + step) })}>
            +
          </button>
        </div>
      </div>
      <input
        class="slider"
        type="range"
        min={0}
        max={Math.max(entry.full, entry.amount)}
        step={step}
        value={entry.amount}
        aria-label="Amount left"
        onInput={(e) => set({ amount: Math.max(step, Number((e.target as HTMLInputElement).value)) })}
      />
      <p class="label">Keep it in</p>
      <Segmented label="Move to" options={SECTIONS} value={entry.storage} onChange={(v) => set({ storage: v })} />
      <label class="date-row">
        <span>Use by</span>
        <input type="date" value={entry.expiresOn ?? ''} onInput={(e) => set({ expiresOn: (e.target as HTMLInputElement).value || undefined })} />
      </label>
      <button class="btn-ghost wide throw-btn" onClick={onThrow}>
        I threw this away
      </button>
      <div class="sheet-btns">
        <button class="btn-ghost" onClick={onRemove}>
          Finished, remove it
        </button>
        <button class="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

function AddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (ingredient: string, amount: number) => void }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<IngredientInfo | null>(null);
  const [amount, setAmount] = useState(0);
  const matches = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return [];
    return INGREDIENT_LIST.filter((i) => fold(i.name).includes(f)).slice(0, 8);
  }, [q]);
  const choose = (i: IngredientInfo) => {
    setPick(i);
    setAmount(i.packages[0] ?? (i.unit === 'piece' ? 1 : 500));
  };

  if (pick) {
    const step = stepFor(pick, amount);
    return (
      <Sheet title={`Add ${pick.name}`} sub="Amounts can be rough." onClose={onClose}>
        <div class="stepper-row">
          <span>How much?</span>
          <div class="stepper2">
            <button aria-label="Less" disabled={amount <= step} onClick={() => setAmount(Math.max(step, amount - step))}>
              −
            </button>
            <span aria-live="polite">{formatAmount(amount, pick.unit)}</span>
            <button aria-label="More" onClick={() => setAmount(amount + step)}>
              +
            </button>
          </div>
        </div>
        {pick.packages.length > 1 && (
          <div class="chip-wrap">
            {pick.packages.map((p) => (
              <Chip key={p} on={amount === p} onClick={() => setAmount(p)}>
                {formatAmount(p, pick.unit)}
              </Chip>
            ))}
          </div>
        )}
        <div class="sheet-btns">
          <button class="btn-ghost" onClick={() => setPick(null)}>
            Back
          </button>
          <button
            class="btn-primary"
            onClick={() => {
              onAdd(pick.id, amount);
              setPick(null);
              setQ('');
            }}
          >
            Add
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add to pantry" onClose={onClose}>
      <p class="label">Staples</p>
      <div class="chip-wrap">
        {STAPLES.filter((id) => INGREDIENTS[id]).map((id) => (
          <Chip key={id} onClick={() => choose(INGREDIENTS[id])}>
            + {ingName(id)}
          </Chip>
        ))}
      </div>
      <label class="search">
        <IconSearch size={20} />
        <input type="search" placeholder="Search any food" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search food to add" />
      </label>
      <ul class="pick-list">
        {matches.map((i) => (
          <li key={i.id}>
            <button onClick={() => choose(i)}>
              <strong>{i.name}</strong>
            </button>
          </li>
        ))}
        {q && !matches.length && <li class="hint">Nothing found. Try another word.</li>}
      </ul>
    </Sheet>
  );
}
