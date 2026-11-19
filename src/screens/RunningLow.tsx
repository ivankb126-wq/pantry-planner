// "Running low": staples that are nearly gone, offered for the shopping list.

import { addExtra, dismissLow } from '../app/actions';
import { INGREDIENTS, ingName } from '../app/catalog';
import { lowStaples } from '../app/pantry';
import { useApp } from '../app/state';
import { formatAmount, zagrebToday } from '../lib/format';
import { IconClose } from '../ui/icons';

export function RunningLow({ note }: { note?: string }) {
  const d = useApp();
  const low = lowStaples(d, zagrebToday());
  if (!low.length) return null;
  return (
    <section class="card low-card" aria-label="Running low">
      <h2>Running low</h2>
      <p class="sub">{note ?? 'Staples that are nearly gone. Add them to your shopping list?'}</p>
      <ul class="low-list">
        {low.map((id) => {
          const have = d.pantry.filter((p) => p.ingredient === id).reduce((s, p) => s + p.amount, 0);
          return (
            <li key={id}>
              <span class="grow">
                <strong>{ingName(id)}</strong>
                <small>{have > 0 ? `${formatAmount(Math.round(have), INGREDIENTS[id]?.unit ?? 'g')} left` : 'Ran out'}</small>
              </span>
              <button class="btn-small" onClick={() => addExtra(id)}>
                Add to list
              </button>
              <button class="icon-btn small" aria-label={`Not now, ${ingName(id)}`} onClick={() => dismissLow(id)}>
                <IconClose size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
