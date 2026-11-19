// First launch: a few short questions, one per screen.

import { useState } from 'preact/hooks';
import { go } from '../app/router';
import { type Settings, update, useApp } from '../app/state';
import { formatEur } from '../lib/format';
import { IconBack } from '../ui/icons';
import { Chip, Screen, Stepper } from '../ui/kit';
import { DietPicker, DislikesPicker, MealsPicker, StoreModePicker, StorePicker } from './pickers';

const STEPS = ['people', 'budget', 'meals', 'stores', 'diet'] as const;

export function Onboarding() {
  const d = useApp();
  const s = d.settings;
  const [step, setStep] = useState(0);
  const set = (p: Partial<Settings>) =>
    update((x) => {
      x.settings = { ...x.settings, ...p };
      if (p.stores && x.settings.activeStore >= p.stores.length) x.settings.activeStore = 0;
    });
  const name = STEPS[step];
  const canGo = name !== 'stores' || s.stores.length > 0;
  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo(0, 0);
      return;
    }
    update((x) => {
      x.settings.onboarded = true;
    });
    go('plan');
  };

  return (
    <Screen tabs={false} glow="pink">
      <div class="onboard-top">
        {step > 0 ? (
          <button class="icon-btn" aria-label="Back" onClick={() => setStep(step - 1)}>
            <IconBack />
          </button>
        ) : (
          <span class="brand">Pantry Planner</span>
        )}
        <div class="dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((id, i) => (
            <span key={id} class={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>
      </div>

      {name === 'people' && (
        <section>
          <h1 class="onboard-h">Who are you cooking for?</h1>
          <p class="lead">Plans and shopping amounts are made for this many people. Children eat a bit less.</p>
          <div class="card tight">
            <Stepper label="Adults" value={s.adults} min={1} max={8} onChange={(v) => set({ adults: v })} />
            <Stepper label="Children" value={s.children} min={0} max={8} onChange={(v) => set({ children: v })} />
          </div>
        </section>
      )}

      {name === 'budget' && (
        <section>
          <h1 class="onboard-h">Weekly food budget</h1>
          <p class="lead">The plan stays at or below this, for all the meals you plan.</p>
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
        </section>
      )}

      {name === 'meals' && (
        <section>
          <h1 class="onboard-h">Which meals should I plan?</h1>
          <p class="lead">Pick all you want in the plan. You can change this any time.</p>
          <MealsPicker meals={s.meals} onChange={(m) => set({ meals: m })} />
        </section>
      )}

      {name === 'stores' && (
        <section>
          <h1 class="onboard-h">Where do you shop?</h1>
          <p class="lead">Pick a chain, then find your store. Prices come from that store. You can add up to 3 stores.</p>
          <StorePicker stores={s.stores} onChange={(st) => set({ stores: st })} />
          {s.stores.length > 1 && (
            <>
              <p class="label">How should I shop?</p>
              <StoreModePicker s={s} onChange={set} />
            </>
          )}
        </section>
      )}

      {name === 'diet' && (
        <section>
          <h1 class="onboard-h">What do you eat?</h1>
          <DietPicker diet={s.diet} onChange={(v) => set({ diet: v })} />
          <p class="label">Anything you never want to see?</p>
          <DislikesPicker dislikes={s.dislikes} onChange={(v) => set({ dislikes: v })} />
        </section>
      )}

      <div class="onboard-bottom">
        <button class="btn-primary wide" disabled={!canGo} onClick={next}>
          {step === STEPS.length - 1 ? 'Make my plan' : 'Next'}
        </button>
        {!canGo && <p class="hint center">Pick at least one store to continue.</p>}
      </div>
    </Screen>
  );
}
