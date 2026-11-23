// Pickers shared by onboarding and Settings: stores, dislikes, diet, meals.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { INGREDIENT_LIST, ingName } from '../app/catalog';
import type { Settings, StoreChoice } from '../app/state';
import { CHAIN_ORDER, type ChainId, type Meta, type Store, loadMeta, loadStores } from '../lib/data';
import type { Diet } from '../lib/nutrition';
import type { MainSlot } from '../planner/types';
import { IconClose, IconSearch } from '../ui/icons';
import { Chip } from '../ui/kit';

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export const CHAIN_NAME: Record<ChainId, string> = {
  lidl: 'Lidl',
  kaufland: 'Kaufland',
  konzum: 'Konzum',
  spar: 'Spar',
  plodine: 'Plodine',
};

export const MAX_STORES = 3;

function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    loadMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);
  return meta;
}

/** Pick a chain, then search the store by city or street. Up to 3 stores. */
export function StorePicker({ stores, onChange }: { stores: StoreChoice[]; onChange: (s: StoreChoice[]) => void }) {
  const meta = useMeta();
  const [chain, setChain] = useState<ChainId | null>(null);
  const [list, setList] = useState<Store[]>([]);
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!chain) return;
    let live = true;
    setList([]);
    setFailed(false);
    loadStores(chain)
      .then((s) => live && setList(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [chain]);

  const matches = useMemo(() => {
    const f = fold(q.trim());
    const out = f ? list.filter((s) => fold(`${s.city} ${s.address} ${s.zip}`).includes(f)) : list;
    return out.slice(0, 40);
  }, [list, q]);

  const full = stores.length >= MAX_STORES;
  const add = (s: Store) => {
    if (!chain || full || stores.some((x) => x.chain === chain && x.storeId === s.id)) return;
    onChange([...stores, { chain, storeId: s.id, label: `${CHAIN_NAME[chain]} ${s.city || s.address}`, address: s.address }]);
    setChain(null);
    setQ('');
  };

  return (
    <div class="store-picker">
      {stores.length > 0 && (
        <ul class="chosen-stores">
          {stores.map((s, i) => (
            <li key={`${s.chain}${s.storeId}`}>
              <span class="grow">
                <strong>{s.label}</strong>
                <small>{s.address}</small>
              </span>
              <button class="icon-btn small" aria-label={`Remove ${s.label}`} onClick={() => onChange(stores.filter((_, j) => j !== i))}>
                <IconClose size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p class="hint">That is the most stores you can pick. Remove one to change it.</p>
      ) : (
        <>
          <p class="label">{stores.length ? 'Add another store (optional)' : 'Which chain?'}</p>
          <div class="chip-wrap" role="group" aria-label="Chain">
            {CHAIN_ORDER.map((c) => {
              const available = !meta || meta.chains[c]?.available !== false;
              return (
                <Chip key={c} on={chain === c} onClick={available ? () => setChain(chain === c ? null : c) : undefined}>
                  {CHAIN_NAME[c]}
                </Chip>
              );
            })}
          </div>
          {chain && (
            <>
              <label class="search">
                <IconSearch size={20} />
                <input type="search" placeholder="Your city or street" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label={`Search ${CHAIN_NAME[chain]} stores by city or street`} />
              </label>
              <ul class="pick-list" aria-label="Stores">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => add(s)}>
                      <strong>{s.city || 'Store'}</strong>
                      <small>{s.address}</small>
                    </button>
                  </li>
                ))}
                {!list.length && !failed && <li class="hint">Loading stores...</li>}
                {failed && <li class="hint">Stores could not be loaded. Check your connection.</li>}
                {list.length > 0 && !matches.length && <li class="hint">No store found. Try another city.</li>}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function StoreModePicker({ s, onChange }: { s: Settings; onChange: (p: Partial<Settings>) => void }) {
  if (s.stores.length < 2) return null;
  return (
    <div class="option-list" role="radiogroup" aria-label="How to shop">
      <button role="radio" aria-checked={s.storeMode === 'cheapest'} class={`option${s.storeMode === 'cheapest' ? ' on' : ''}`} onClick={() => onChange({ storeMode: 'cheapest' })}>
        <span class="radio" />
        <span class="grow">
          Cheapest across my stores
          <small>The shopping list is split by store.</small>
        </span>
      </button>
      {s.stores.map((st, i) => {
        const on = s.storeMode === 'one' && s.activeStore === i;
        return (
          <button key={st.storeId} role="radio" aria-checked={on} class={`option${on ? ' on' : ''}`} onClick={() => onChange({ storeMode: 'one', activeStore: i })}>
            <span class="radio" />
            <span class="grow">
              Only {st.label}
              <small>Everything from one store.</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const MEAL_OPTIONS: { id: MainSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert' },
];

export function MealsPicker({ meals, onChange }: { meals: MainSlot[]; onChange: (m: MainSlot[]) => void }) {
  const toggle = (id: MainSlot) => {
    const next = meals.includes(id) ? meals.filter((m) => m !== id) : [...meals, id];
    if (next.length) onChange(MEAL_OPTIONS.map((o) => o.id).filter((m) => next.includes(m)));
  };
  return (
    <div class="chip-wrap" role="group" aria-label="Meals to plan">
      {MEAL_OPTIONS.map((o) => (
        <Chip key={o.id} on={meals.includes(o.id)} onClick={() => toggle(o.id)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export const DIET_OPTIONS: { id: Diet | 'none'; label: string; hint: string }[] = [
  { id: 'none', label: 'Everything', hint: 'Meat, fish and vegetarian dishes' },
  { id: 'pescatarian', label: 'Pescatarian', hint: 'Fish, no meat' },
  { id: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish' },
  { id: 'vegan', label: 'Vegan', hint: 'Plants only' },
];

export function DietPicker({ diet, onChange }: { diet: Diet | 'none'; onChange: (d: Diet | 'none') => void }) {
  return (
    <div class="option-list" role="radiogroup" aria-label="Diet">
      {DIET_OPTIONS.map((o) => (
        <button key={o.id} role="radio" aria-checked={diet === o.id} class={`option${diet === o.id ? ' on' : ''}`} onClick={() => onChange(o.id)}>
          <span class="radio" />
          <span class="grow">
            {o.label}
            <small>{o.hint}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

const COMMON_DISLIKES = ['mushrooms', 'olives', 'tuna-canned', 'chickpeas', 'eggplant', 'fennel', 'goat-cheese', 'capers', 'coconut-milk'];

export function DislikesPicker({ dislikes, onChange }: { dislikes: string[]; onChange: (d: string[]) => void }) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return [];
    return INGREDIENT_LIST.filter((i) => !dislikes.includes(i.id) && fold(i.name).includes(f)).slice(0, 8);
  }, [q, dislikes]);
  const common = COMMON_DISLIKES.filter((id) => ingName(id) !== id && !dislikes.includes(id));
  return (
    <div>
      {dislikes.length > 0 && (
        <div class="chip-wrap" aria-label="Foods you do not eat">
          {dislikes.map((id) => (
            <button key={id} class="pill on removable" onClick={() => onChange(dislikes.filter((x) => x !== id))} aria-label={`Remove ${ingName(id)}`}>
              {ingName(id)} <IconClose size={14} />
            </button>
          ))}
        </div>
      )}
      <label class="search">
        <IconSearch size={20} />
        <input type="search" placeholder="Search a food, for example mushrooms" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search foods you do not eat" />
      </label>
      {matches.length > 0 && (
        <ul class="pick-list">
          {matches.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => {
                  onChange([...dislikes, i.id]);
                  setQ('');
                }}
              >
                <strong>{i.name}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!q && common.length > 0 && (
        <>
          <p class="label">Common ones</p>
          <div class="chip-wrap">
            {common.map((id) => (
              <Chip key={id} onClick={() => onChange([...dislikes, id])}>
                + {ingName(id)}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
