// Pantry: Fridge, Shelves and Freezer, with items on glowing planks.

import { useMemo, useState } from 'preact/hooks';
import { INGREDIENTS, INGREDIENT_LIST, ingName } from '../app/catalog';
import { addToPantry } from '../app/planning';
import { type PantryEntry, update, useApp } from '../app/state';
import { daysBetween, formatAmount, formatShortDate, zagrebToday } from '../lib/format';
import type { IngredientInfo } from '../lib/nutrition';
import { IconPlus, IconSearch } from '../ui/icons';
import { Chip, Screen, Segmented, Sheet, Toast, useToast } from '../ui/kit';
import { plural } from '../ui/words';
import { fold } from './pickers';

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

export function PantryScreen() {
  const d = useApp();
  const today = zagrebToday();
  const [section, setSection] = useState<Section>('fridge');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useToast<{ text: string; undo?: PantryEntry[] }>();

  const soon = d.pantry.filter((p) => p.expiresOn && daysBetween(today, p.expiresOn) <= 2).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
  const items = d.pantry.filter((p) => p.storage === section).sort((a, b) => ingName(a.ingredient).localeCompare(ingName(b.ingredient)));
  const rows: PantryEntry[][] = [];
  for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));
  const count = (s: Section) => d.pantry.filter((p) => p.storage === s).length;
  const edit = d.pantry.find((p) => p.id === editing) ?? null;

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

      {items.length ? (
        <div class="shelves">
          {rows.map((row, ri) => (
            <div key={ri} class="shelf">
              <div class="shelf-items">
                {row.map((p) => {
                  const ing = INGREDIENTS[p.ingredient];
                  const frac = p.full > 0 ? Math.min(1, p.amount / p.full) : 1;
                  const days = p.expiresOn ? daysBetween(today, p.expiresOn) : 99;
                  const warn = days <= 2 || frac < 0.25;
                  return (
                    <button key={p.id} class="tile" onClick={() => setEditing(p.id)} aria-label={`${ingName(p.ingredient)}, ${formatAmount(Math.round(p.amount), ing?.unit ?? 'g')}. Edit`}>
                      <PackIcon type={ing?.packageType ?? 'pack'} colour={COLOUR[ing?.category ?? ''] ?? '#B9A8D0'} />
                      <span class="tile-name">{ingName(p.ingredient)}</span>
                      <span class="tile-amount">{formatAmount(Math.round(p.amount), ing?.unit ?? 'g')}</span>
                      <span class={`fill${warn ? ' warn' : ''}`}>
                        <span style={{ width: `${Math.max(6, frac * 100)}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <div class="plank" aria-hidden="true" />
            </div>
          ))}
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

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onAdd={(ingredient, amount) => {
            update((x) => {
              x.pantry = addToPantry(x.pantry, [{ ingredient, amount }]);
            });
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
            const before = d.pantry;
            update((x) => {
              x.pantry = x.pantry.filter((p) => p.id !== edit.id);
            });
            setEditing(null);
            setToast({ text: `${ingName(edit.ingredient)} removed.`, undo: before });
          }}
        />
      )}
      {toast && (
        <Toast
          action={toast.undo ? 'Undo' : undefined}
          onAction={() => {
            const undo = toast.undo;
            if (undo)
              update((x) => {
                x.pantry = undo;
              });
            setToast(null);
          }}
        >
          {toast.text}
        </Toast>
      )}
    </Screen>
  );
}

function EditSheet({ entry, onClose, onRemove }: { entry: PantryEntry; onClose: () => void; onRemove: () => void }) {
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
