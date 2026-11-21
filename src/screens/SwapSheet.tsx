// "I don't have X": what to use instead, with what you have at home first.

import { INGREDIENTS } from '../app/catalog';
import { buyFor, priceIndex } from '../app/costs';
import { useApp } from '../app/state';
import { formatAmount, formatEur } from '../lib/format';
import { dietAllows } from '../lib/nutrition';
import { SUBSTITUTES, canLeaveOut } from '../lib/substitutes';
import { IconCheck } from '../ui/icons';
import { Sheet } from '../ui/kit';
import type { PriceState } from './Plan';

/** Whether "Don't have it?" has anything to offer for this ingredient. */
export function canSwap(id: string, optional: boolean): boolean {
  return !!SUBSTITUTES[id]?.length || canLeaveOut(id, INGREDIENTS[id]?.category, optional);
}

function amountText(n: number, unit: 'g' | 'ml' | 'piece'): string {
  if (unit !== 'piece' && n < 1) return 'a pinch';
  const r = unit === 'piece' ? Math.max(0.25, Math.round(n * 4) / 4) : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
  return formatAmount(r, unit);
}

export function SwapSheet({
  orig,
  amount,
  optional,
  current,
  inPlan,
  prices,
  onPick,
  onClose,
}: {
  orig: string;
  amount: number; // of the original, in its unit, for the servings shown
  optional: boolean;
  current?: string; // swap in use ('' = left out)
  inPlan: boolean;
  prices: PriceState;
  onPick: (to: string | null) => void;
  onClose: () => void;
}) {
  const d = useApp();
  const ing = INGREDIENTS[orig];
  const name = ing?.name.replace(/\s*\(.*\)$/, '') ?? orig;
  const idx = prices.data ? priceIndex(prices.data) : null;
  const options = (SUBSTITUTES[orig] ?? [])
    .filter((s) => {
      const sub = INGREDIENTS[s.id];
      return sub && dietAllows(d.settings.diet, sub.diet) && !d.settings.dislikes.includes(s.id);
    })
    .map((s) => {
      const sub = INGREDIENTS[s.id];
      const need = amount * s.ratio;
      const have = d.pantry.filter((p) => p.ingredient === s.id).reduce((t, p) => t + p.amount, 0);
      const home = have > 0 && have >= need * 0.9;
      const buy = !home && idx ? buyFor(s.id, need, idx) : null;
      return { s, sub, need, have, home, buy };
    })
    .sort((a, b) => Number(b.home) - Number(a.home));

  return (
    <Sheet title={`No ${name.toLowerCase()}?`} sub={`Instead of ${amountText(amount, ing?.unit ?? 'g')} ${name.toLowerCase()}. What you have at home comes first.`} onClose={onClose}>
      <ul class="swap-list">
        {options.map(({ s, sub, need, have, home, buy }) => (
          <li key={s.id}>
            <button class={`swap-row${current === s.id ? ' on' : ''}`} onClick={() => onPick(s.id)}>
              <span class="grow">
                <strong>
                  {amountText(need, sub.unit)} {sub.name.toLowerCase()}
                </strong>
                {s.note && <small>{s.note}</small>}
                {home ? (
                  <small class="have">
                    <IconCheck size={14} /> You have {formatAmount(Math.round(have * 10) / 10, sub.unit)}
                  </small>
                ) : buy ? (
                  <small>Buy it: {formatEur(buy.cost)}</small>
                ) : null}
              </span>
              {current === s.id && <IconCheck size={20} />}
            </button>
          </li>
        ))}
        {canLeaveOut(orig, ing?.category, optional) && (
          <li>
            <button class={`swap-row${current === '' ? ' on' : ''}`} onClick={() => onPick('')}>
              <span class="grow">
                <strong>Leave it out</strong>
                <small>The dish still works without it.</small>
              </span>
              {current === '' && <IconCheck size={20} />}
            </button>
          </li>
        )}
        {current !== undefined && (
          <li>
            <button class="swap-row" onClick={() => onPick(null)}>
              <span class="grow">
                <strong>Use {name.toLowerCase()} after all</strong>
                <small>Back to the recipe as written.</small>
              </span>
            </button>
          </li>
        )}
      </ul>
      <p class="fineprint">
        {inPlan
          ? "The swap is saved for this meal (and its leftovers). The plan's cost and shopping list update."
          : 'This only changes this page. Open the recipe from your plan to save a swap for that meal.'}
      </p>
    </Sheet>
  );
}
