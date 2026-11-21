// Recipe detail: ingredients with where to buy them, steps, nutrition,
// ratings, notes, favourites, and adding it to this week.

import { useRef, useState } from 'preact/hooks';
import { type HideFor, rate, ratingOf, setCooked, setNote, swap, toggleFavourite } from '../app/actions';
import { CUISINE_LABEL, FAMILY_LABEL, INGREDIENTS, RECIPE_BY_ID, similarRecipes } from '../app/catalog';
import { buyFor, priceIndex, saleIngredient, servingCost } from '../app/costs';
import { lineQuantity, productLabel } from './Shopping';
import { planResult, portionsFor, scaledIngredients } from '../app/planning';
import { back, go } from '../app/router';
import { type AppData, useApp } from '../app/state';
import { formatAmount, formatEur, zagrebToday } from '../lib/format';
import { monthOf, seasonalIngredients } from '../lib/seasons';
import { NUTRIENTS, scaleStep, stepText, stepTip } from '../lib/nutrition';
import { ESTIMATE } from '../planner/evaluate';
import type { PlannerRecipe, PlanResult, Slot } from '../planner/types';
import { IconBack, IconCheck, IconClock, IconFlame, IconHeart, IconSwap, IconThumbDown, IconThumbUp } from '../ui/icons';
import { mealPortions, takenText } from '../app/pantry';
import { photoFor, photoSite, removePhoto, setPhoto, shrinkPhoto, usePhotos } from '../app/photos';
import { Chip, DishArt, Empty, Screen, Sheet, Toast, useToast } from '../ui/kit';
import { SLOT_LABEL, dayLong, minutes, plural } from '../ui/words';
import type { PriceState } from './Plan';

export const REASONS = ['Too expensive', 'Too much work', 'Not tasty', 'Portion too small'];

const NUTRIENT_LABEL: Record<string, string> = {
  kcal: 'Energy',
  protein: 'Protein',
  carbs: 'Carbohydrates',
  sugar: 'of which sugars',
  fat: 'Fat',
  sat_fat: 'of which saturates',
  fibre: 'Fibre',
  salt: 'Salt',
};

function slotsFor(r: PlannerRecipe): Slot[] {
  return r.mealTypes.filter((m): m is Slot => ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'].includes(m));
}

interface Source {
  kind: 'have' | 'buy' | 'none';
  text: string;
  price?: number;
}

function sourceFor(id: string, need: number, d: AppData, result: PlanResult | null, inPlan: boolean, prices: PriceState): Source {
  const multi = (prices.data?.stores.length ?? 0) > 1;
  if (inPlan && result) {
    if (result.fromPantry.some((p) => p.ingredient === id) && !result.shopping.some((l) => l.ingredient === id)) return { kind: 'have', text: 'You have it' };
    const lines = result.shopping.filter((l) => l.ingredient === id);
    if (lines.length) {
      const l = lines[0];
      const text = l.estimated ? 'Typical price, your store does not list it' : `${multi ? `${l.store} · ` : ''}${lineQuantity(l)} · ${productLabel(l.product, l.brand, l.ingredient, l.loose)}`;
      return { kind: 'buy', text, price: lines.reduce((s, x) => s + x.cost, 0) };
    }
  }
  const have = d.pantry.filter((p) => p.ingredient === id).reduce((s, p) => s + p.amount, 0);
  if (have > 0 && have >= need * 0.9) return { kind: 'have', text: 'You have it' };
  if (prices.data) {
    const p = buyFor(id, need, priceIndex(prices.data));
    if (p) {
      const o = p.lines[0].offer;
      const unit = INGREDIENTS[id]?.unit ?? 'g';
      const qty = o.loose ? `about ${formatAmount(p.bought, unit)}` : `${p.lines[0].count} × ${formatAmount(o.size, unit)}`;
      const text = o.store === ESTIMATE ? `Typical price for ${qty}` : `${multi ? `${o.store} · ` : ''}${qty} · ${productLabel(o.name, o.brand, id, o.loose)}`;
      return { kind: 'buy', text, price: p.cost };
    }
  }
  return { kind: 'none', text: 'Usually at home' };
}

export function RecipeDetail({ id, mealParam, prices }: { id: string; mealParam: string | null; prices: PriceState }) {
  const d = useApp();
  const r = RECIPE_BY_ID.get(id);
  const mealIndex = mealParam != null && d.plan && d.plan.meals[Number(mealParam)]?.recipeId === id ? Number(mealParam) : null;
  // A plan meal is cooked for its eaters plus any later leftover or batch meals.
  const cookFor = Math.max(1, Math.round(mealIndex != null ? mealPortions(d.plan!, mealIndex, d.settings) : portionsFor(d.settings)));
  const [servings, setServings] = useState(cookFor);
  const maxServings = Math.max(12, cookFor);
  const [sheet, setSheet] = useState<null | 'down' | 'add'>(null);
  const [toast, setToast] = useToast<{ text: string; undo?: () => void }>(7000);
  const [note, setNoteText] = useState(d.notes[id] ?? '');
  usePhotos();

  if (!r) {
    return (
      <Screen tabs={false}>
        <Empty title="Recipe not found" action="Back to recipes" onAction={() => go('recipes')} />
      </Screen>
    );
  }

  const result = prices.data && d.plan ? planResult(d, prices.data) : null;
  const idx = prices.data ? priceIndex(prices.data) : null;
  const perServing = idx ? servingCost(r, idx) : null;
  const view = mealIndex != null && result ? result.views[mealIndex] : null;
  const perPerson = view && !view.leftover && view.portions ? view.cost / view.portions : perServing;
  const sale = idx ? saleIngredient(r, idx) : null;
  const seasonal = seasonalIngredients(r, INGREDIENTS, monthOf(zagrebToday()));
  const rating = ratingOf(d, id);
  const fav = d.favourites.includes(id);
  const cooked = mealIndex != null && d.plan!.cooked.includes(mealIndex);
  const isNew = d.history.length >= 5 && !d.history.some((h) => h.recipeId === id);
  const ings = scaledIngredients(r, servings);
  const f = r.facts.perServing;

  const photo = photoFor(id);
  const planMeals = d.plan ? d.plan.meals.map((m, i) => ({ m, i })).filter(({ m }) => m.recipeId === id) : [];

  return (
    <Screen tabs={false} glow="orange">
      <div class="detail-hero">
        <DishArt emoji={r.illustration} height={210} photo={photo?.src} />
        <button class="hero-btn left" aria-label="Back" onClick={() => back('recipes')}>
          <IconBack />
        </button>
        <button class={`hero-btn right${fav ? ' fav' : ''}`} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={fav} onClick={() => toggleFavourite(id)}>
          <IconHeart filled={fav} />
        </button>
      </div>

      {photo && !photo.mine && photo.credit && (
        <p class="photo-credit">
          Photo:{' '}
          {photo.source ? (
            <a href={photo.source} target="_blank" rel="noopener noreferrer">
              {photo.credit}, {photoSite(photo.source)}
            </a>
          ) : (
            photo.credit
          )}
        </p>
      )}
      <div class="badges">
        {sale && <span class="tag teal">{sale} on sale</span>}
        {seasonal.length > 0 && <span class="tag season">In season: {seasonal.map((id) => INGREDIENTS[id].name.toLowerCase()).join(', ')}</span>}
        <span class="tag outline">{CUISINE_LABEL[r.cuisine] ?? r.cuisine}</span>
        {isNew && <span class="tag purple">New for you</span>}
        {r.facts.diet === 'vegan' ? <span class="tag outline">Vegan</span> : r.facts.diet === 'vegetarian' ? <span class="tag outline">Vegetarian</span> : null}
      </div>
      <h1 class="detail-title">{r.title}</h1>
      <p class="lead">{r.description}</p>
      <p class="meta big">
        {minutes(r.facts.totalMinutes)} · {f.kcal} kcal · {Math.round(f.protein)} g protein
        {perPerson != null && ` · ${formatEur(perPerson)} per person`}
      </p>
      {r.ahead && (
        <p class="ahead-note">
          <IconClock size={16} /> Start the day before: {r.ahead}.
        </p>
      )}

      {mealIndex != null && view && (
        <section class="card in-plan">
          <p>
            In your plan: <strong>{dayLong(view.date)} {SLOT_LABEL[view.slot].toLowerCase()}</strong>
            {view.leftover && ' (leftovers)'}
          </p>
          {!view.leftover && cookFor > portionsFor(d.settings) + 0.5 && (
            <p class="sub">
              Cook {cookFor} servings: this meal plus {plural(d.plan!.meals.filter((m) => m.source === 'leftover' && m.from === mealIndex).length, 'later meal', 'later meals')}. The amounts below are for all of it.
            </p>
          )}
          <div class="row-btns">
            <button
              class={cooked ? 'btn-teal' : 'btn-teal-outline'}
              aria-pressed={cooked}
              onClick={() => {
                if (cooked) {
                  setCooked(mealIndex, false);
                  setToast({ text: 'Marked as not cooked. Anything taken is back in your pantry.' });
                  return;
                }
                const taken = setCooked(mealIndex, true);
                setToast({ text: taken.length ? `Taken from your pantry: ${takenText(taken)}.` : 'Marked as cooked.', undo: () => setCooked(mealIndex, false) });
              }}
            >
              <IconCheck size={18} /> {cooked ? 'Cooked' : 'Mark cooked'}
            </button>
            <button
              class="btn-ghost"
              disabled={!prices.data}
              onClick={() => {
                swap(prices.data!, mealIndex);
                go('plan');
              }}
            >
              <IconSwap size={18} /> Swap
            </button>
          </div>
        </section>
      )}

      <section class="card">
        <div class="card-head">
          <h2>Ingredients</h2>
          <div class="stepper2 small" aria-label="Servings">
            <button aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
              −
            </button>
            <span>{servings} servings</span>
            <button aria-label="More servings" disabled={servings >= maxServings} onClick={() => setServings(servings + 1)}>
              +
            </button>
          </div>
        </div>
        <ul class="ing-list">
          {ings.map((i) => {
            const src = sourceFor(i.id, i.amount, d, result, mealIndex != null, prices);
            return (
              <li key={i.id}>
                <span class="ing-amount">{i.display}</span>
                <span class="grow">
                  {i.name}
                  {i.optional && <em> (optional)</em>}
                  {i.note && <small class="ing-note">{i.note}</small>}
                  {src.kind === 'have' ? (
                    <small class="have">
                      <IconCheck size={14} /> You have it
                    </small>
                  ) : (
                    <small>{src.text}</small>
                  )}
                </span>
                {src.price != null && <span class="ing-price">{formatEur(src.price)}</span>}
              </li>
            );
          })}
        </ul>
        <p class="fineprint">Prices are for the whole packages you would buy for this many servings.</p>
      </section>

      <section class="card">
        <h2>Steps</h2>
        <ol class="steps">
          {r.steps.map((s, i) => (
            <li key={i}>
              {scaleStep(stepText(s), servings / r.servings)}
              {stepTip(s) && <span class="step-tip small">Tip: {scaleStep(stepTip(s)!, servings / r.servings)}</span>}
            </li>
          ))}
        </ol>
        {r.equipment.length > 0 && <p class="sub">You need: {r.equipment.join(', ')}.</p>}
        {r.keepsDays > 1 && <p class="sub">Keeps {r.keepsDays} days in the fridge.</p>}
      </section>

      <section class="card">
        <h2>Nutrition per serving</h2>
        <table class="nutri">
          <tbody>
            {NUTRIENTS.map((n) => (
              <tr key={n} class={n === 'sugar' || n === 'sat_fat' ? 'sub-row' : ''}>
                <th scope="row">{NUTRIENT_LABEL[n]}</th>
                <td>{n === 'kcal' ? `${Math.round(f.kcal)} kcal` : `${f[n].toLocaleString('en-GB', { maximumFractionDigits: 1 })} g`}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Vegetables and fruit</th>
              <td>{f.vegPortions.toLocaleString('en-GB', { maximumFractionDigits: 1 })} portions</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>My notes</h2>
        <textarea
          class="notes"
          rows={3}
          placeholder="For example: less salt, add chili"
          value={note}
          onInput={(e) => setNoteText((e.target as HTMLTextAreaElement).value)}
          onBlur={() => setNote(id, note)}
          aria-label="My notes"
        />
      </section>

      <SimilarDishes id={id} />

      <MyPhoto id={id} title={r.title} hasOwn={!!photo?.mine} onError={(text) => setToast({ text })} />

      {d.plan && (
        <button class="btn-ghost wide" onClick={() => setSheet('add')} disabled={!prices.data}>
          {planMeals.length ? 'Add to this week again' : 'Add to this week'}
        </button>
      )}

      <div class="action-bar">
        <button
          class={`round-btn${rating && !rating.up ? ' on-pink' : ''}`}
          aria-label="Thumbs down"
          aria-pressed={!!rating && !rating.up}
          onClick={() => (rating && !rating.up ? rate(id, null) : setSheet('down'))}
        >
          <IconThumbDown />
        </button>
        <button
          class={`round-btn teal${rating?.up ? ' on-teal' : ''}`}
          aria-label="Thumbs up"
          aria-pressed={!!rating?.up}
          onClick={() => {
            rate(id, rating?.up ? null : true);
            if (!rating?.up) setToast({ text: 'Thanks. You will see this more often.' });
          }}
        >
          <IconThumbUp />
        </button>
        <a class="btn-primary grow" href={`#/cook/${id}${mealIndex != null ? `?meal=${mealIndex}` : ''}`}>
          <IconFlame size={20} /> Start cooking
        </a>
      </div>

      {sheet === 'down' && (
        <ThumbsDownSheet
          title={r.title}
          inPlan={planMeals.length > 0}
          onClose={() => setSheet(null)}
          onDone={(hide, reasons) => {
            rate(id, false, hide, reasons);
            if (prices.data && d.plan) {
              // Swap it out of this week (later meals first keeps indexes valid).
              for (const { i } of [...planMeals].reverse()) swap(prices.data, i);
            }
            setSheet(null);
            setToast({ text: hide === 'forever' ? 'Hidden for good.' : 'Hidden for 8 weeks.' });
          }}
        />
      )}
      {sheet === 'add' && prices.data && d.plan && result && (
        <Sheet title="Add to this week" sub="Pick the meal it should replace." onClose={() => setSheet(null)}>
          <ul class="pick-list">
            {result.views
              .map((v, i) => ({ v, i }))
              .filter(({ v }) => slotsFor(r).includes(v.slot) && v.recipeId !== id)
              .map(({ v, i }) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      swap(prices.data!, i, id);
                      setSheet(null);
                      go('plan');
                    }}
                  >
                    <strong>
                      {dayLong(v.date)} {SLOT_LABEL[v.slot].toLowerCase()}
                    </strong>
                    <small>Instead of {v.title}</small>
                  </button>
                </li>
              ))}
          </ul>
          {!result.views.some((v) => slotsFor(r).includes(v.slot)) && <p class="hint">Your plan has no {r.mealTypes.join(' or ')} meals. Turn them on in Settings.</p>}
        </Sheet>
      )}
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

/** Other dishes of the same kind, sharing the most ingredients first. */
function SimilarDishes({ id }: { id: string }) {
  const r = RECIPE_BY_ID.get(id)!;
  const list = similarRecipes(id, 4);
  if (!list.length) return null;
  return (
    <section class="card">
      <h2>Similar dishes</h2>
      <p class="sub">More {(FAMILY_LABEL[r.family] ?? 'dishes').toLowerCase()}, handy if you are missing something for this one.</p>
      <ul class="recipe-grid similar-grid">
        {list.map((s) => (
          <li key={s.id}>
            <a href={`#/recipe/${s.id}`} class="recipe-card">
              <DishArt emoji={s.illustration} height={72} photo={photoFor(s.id)?.src} />
              <span class="rc-title">{s.title}</span>
              <span class="rc-meta">
                <span>{minutes(s.facts.totalMinutes)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Take or pick a photo of the dish (saved on the phone only). */
function MyPhoto({ id, title, hasOwn, onError }: { id: string; title: string; hasOwn: boolean; onError: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section class="card">
      <h2>My photo</h2>
      <p class="sub">{hasOwn ? 'Your photo is shown for this dish.' : 'Add a photo of how yours turned out. It stays on your phone.'}</p>
      <div class="photo-row">
        <button class="btn-teal-outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Saving...' : hasOwn ? 'Change photo' : 'Add a photo'}
        </button>
        {hasOwn && (
          <button class="btn-ghost" onClick={() => removePhoto(id)}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={`Photo of ${title}`}
        onChange={async (e) => {
          const el = e.target as HTMLInputElement;
          const file = el.files?.[0];
          el.value = '';
          if (!file) return;
          setBusy(true);
          try {
            setPhoto(id, await shrinkPhoto(file));
          } catch (err) {
            onError((err as Error).message || 'This photo could not be saved.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}

export function ThumbsDownSheet({ title, inPlan, onClose, onDone }: { title: string; inPlan: boolean; onClose: () => void; onDone: (hide: HideFor, reasons: string[]) => void }) {
  const [hide, setHide] = useState<HideFor>('8weeks');
  const [reasons, setReasons] = useState<string[]>([]);
  return (
    <Sheet title={`Hide ${title}?`} sub={inPlan ? 'It will also be swapped out of this week.' : 'The planner will not pick it.'} onClose={onClose}>
      <div class="option-list" role="radiogroup" aria-label="How long">
        {(
          [
            ['8weeks', 'For 8 weeks'],
            ['forever', 'Forever'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={hide === v} class={`option${hide === v ? ' on' : ''}`} onClick={() => setHide(v)}>
            <span class="radio" />
            <span class="grow">{label}</span>
          </button>
        ))}
      </div>
      <p class="label">Why? (optional)</p>
      <div class="chip-wrap">
        {REASONS.map((x) => (
          <Chip key={x} on={reasons.includes(x)} onClick={() => setReasons(reasons.includes(x) ? reasons.filter((y) => y !== x) : [...reasons, x])}>
            {x}
          </Chip>
        ))}
      </div>
      <div class="sheet-btns">
        <button class="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button class="btn-primary" onClick={() => onDone(hide, reasons)}>
          Hide it
        </button>
      </div>
    </Sheet>
  );
}
