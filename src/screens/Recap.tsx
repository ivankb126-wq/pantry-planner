// Weekly recap: this week so far, and the weeks before.

import { useState } from 'preact/hooks';
import { RECIPE_BY_ID } from '../app/catalog';
import { photoFor, usePhotos } from '../app/photos';
import { weekRecap } from '../app/recap';
import { go } from '../app/router';
import { type WeekRecap, useApp } from '../app/state';
import { formatEur, formatShortDate } from '../lib/format';
import { Chip, DishArt, Empty, Screen, TitleBar } from '../ui/kit';
import { plural } from '../ui/words';

export function Recap() {
  const d = useApp();
  usePhotos();
  const current = d.plan ? weekRecap(d, d.plan) : null;
  const past = d.recaps.filter((r) => !current || r.startDate < current.startDate).reverse();
  const weeks = [...(current ? [current] : []), ...past].slice(0, 6);
  const [pick, setPick] = useState(0);
  const r = weeks[Math.min(pick, weeks.length - 1)];

  if (!r) {
    return (
      <Screen glow="purple" tabs={false}>
        <TitleBar title="Weekly recap" backTo="#/plan" />
        <Empty title="Nothing to sum up yet" action="Go to my plan" onAction={() => go('plan')}>
          Make a plan, shop and cook, and your week is added up here.
        </Empty>
      </Screen>
    );
  }

  const live = current != null && r === current;
  return (
    <Screen glow="purple" tabs={false}>
      <TitleBar kicker={`${formatShortDate(r.startDate)} to ${formatShortDate(r.endDate)}`} title="Weekly recap" backTo="#/plan" />
      {weeks.length > 1 && (
        <div class="chips recap-weeks" role="group" aria-label="Week">
          {weeks.map((w, i) => (
            <Chip key={w.startDate} on={w === r} onClick={() => setPick(i)}>
              {current && i === 0 ? 'This week' : `Week of ${formatShortDate(w.startDate)}`}
            </Chip>
          ))}
        </div>
      )}
      <RecapView r={r} live={live} />
    </Screen>
  );
}

function RecapView({ r, live }: { r: WeekRecap; live: boolean }) {
  const left = r.budget - r.spent;
  const pct = r.budget > 0 ? Math.min(100, (r.spent / r.budget) * 100) : 0;
  const fav = r.favourite ? RECIPE_BY_ID.get(r.favourite) : null;
  const photo = fav ? photoFor(fav.id) : null;
  const newTitles = r.newDishes.map((id) => RECIPE_BY_ID.get(id)?.title.replace(/\s*\(.*\)$/, '')).filter(Boolean) as string[];

  return (
    <>
      <section class="card recap-spent" aria-label="Spent">
        <p class="kicker">{live ? 'Spent so far' : 'Spent'}</p>
        <p class="recap-big">
          {formatEur(r.spent)} <small>of {formatEur(r.budget)}</small>
        </p>
        <div class="bar teal" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        {r.bought === 0 ? (
          <p class="sub">Nothing from the shopping list went into the pantry yet. Spending counts what you add with "Add basket to my pantry".</p>
        ) : (
          <p class="sub">{left >= 0 ? `${formatEur(left)} ${live ? "left in the budget" : "under budget"}.` : `${formatEur(-left)} over budget.`}</p>
        )}
      </section>

      <div class="recap-grid">
        <section class="card recap-stat">
          <strong>{formatEur(r.saved)}</strong>
          <small>saved on sales</small>
        </section>
        <section class="card recap-stat">
          <strong>
            {r.cooked} <span class="muted">of {r.toCook}</span>
          </strong>
          <small>meals cooked</small>
        </section>
        <section class="card recap-stat">
          <strong>{r.thrownCount}</strong>
          <small>
            {r.thrownCount === 1 ? 'item' : 'items'} thrown away{r.thrownValue > 0 ? `, about ${formatEur(r.thrownValue)}` : ''}
          </small>
        </section>
        <section class="card recap-stat">
          <strong>{r.newDishes.length}</strong>
          <small>{r.newDishes.length === 1 ? 'new dish' : 'new dishes'} tried</small>
        </section>
      </div>

      {r.thrownNames.length > 0 && <p class="recap-note">Thrown away: {r.thrownNames.join(', ')}.</p>}

      <section class="card recap-fav" aria-label="Favourite new dish">
        <h2>Favourite new dish</h2>
        {fav ? (
          <a class="recap-fav-dish" href={`#/recipe/${fav.id}`}>
            <DishArt emoji={fav.illustration} height={140} photo={photo?.src} />
            <strong>{fav.title}</strong>
          </a>
        ) : newTitles.length ? (
          <p class="sub">
            New this week: {newTitles.join(', ')}. Give one a thumbs up on its recipe page and it becomes your favourite.
          </p>
        ) : (
          <p class="sub">{live ? 'No new dishes cooked yet this week.' : 'No new dishes that week.'}</p>
        )}
      </section>

      <p class="fineprint">
        Meals count when you tap "Mark cooked". Food thrown away counts when you tap "I threw this away" on a pantry item. {plural(r.bought, 'shopping line', 'shopping lines')} counted
        {live ? ' so far' : ''}.
      </p>
    </>
  );
}
