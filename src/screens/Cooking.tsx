// Cooking mode: one step per screen, big text, screen kept awake, timers.

import { useEffect, useRef, useState } from 'preact/hooks';
import { cookedOutsidePlan, rate, ratingOf, setCooked } from '../app/actions';
import { RECIPE_BY_ID } from '../app/catalog';
import { mealPortions, takenText } from '../app/pantry';
import { portionsFor, scaledIngredients } from '../app/planning';
import { back, go } from '../app/router';
import { type Amount, useApp } from '../app/state';
import { scaleStep, stepText, stepTip } from '../lib/nutrition';
import { IconClose, IconThumbDown, IconThumbUp } from '../ui/icons';
import { Empty, Screen, Sheet } from '../ui/kit';
import { fold } from './pickers';

/**
 * The main wait in a step: the longest time it mentions ("Stir 1 minute, then
 * simmer 20 to 25 minutes" -> 20).
 */
export function stepMinutes(text: string): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:to|-|–)\s*\d+(?:[.,]\d+)?)?\s*(minutes?|mins?|hours?|hrs?|h)\b/gi)) {
    const n = Number(m[1].replace(',', '.'));
    const mins = /^h/i.test(m[2]) ? n * 60 : n;
    if (mins > 0 && mins <= 360 && (best == null || mins > best)) best = mins;
  }
  return best;
}

function useWakeLock(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const get = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
        if (live) setOn(!!lock);
        lock?.addEventListener('release', () => live && setOn(false));
      } catch {
        if (live) setOn(false);
      }
    };
    void get();
    const vis = () => document.visibilityState === 'visible' && void get();
    document.addEventListener('visibilitychange', vis);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', vis);
      void lock?.release().catch(() => undefined);
    };
  }, []);
  return on;
}

function beep(): void {
  try {
    navigator.vibrate?.([300, 150, 300]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.4, 0.8].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    // no sound available
  }
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Timer({ minutes }: { minutes: number }) {
  const [total, setTotal] = useState(minutes * 60);
  const [left, setLeft] = useState(minutes * 60);
  const [endAt, setEndAt] = useState<number | null>(null);
  const rang = useRef(false);

  useEffect(() => {
    if (endAt == null) return;
    const tick = () => {
      const s = Math.max(0, (endAt - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0 && !rang.current) {
        rang.current = true;
        setEndAt(null);
        beep();
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endAt]);

  const running = endAt != null;
  const start = () => {
    rang.current = false;
    setEndAt(Date.now() + left * 1000);
  };
  const pause = () => setEndAt(null);
  const addMinute = () => {
    setTotal(total + 60);
    if (running) setEndAt(endAt + 60_000);
    else setLeft(left + 60);
  };
  const reset = () => {
    setEndAt(null);
    setTotal(minutes * 60);
    setLeft(minutes * 60);
  };

  const r = 64;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const done = left <= 0;
  return (
    <div class="timer">
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
        <circle cx="75" cy="75" r={r} fill="none" stroke="#33224D" stroke-width="10" />
        <circle cx="75" cy="75" r={r} fill="none" stroke={done ? '#3DE3D0' : '#FF9A3C'} stroke-width="10" stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - frac)} transform="rotate(-90 75 75)" />
      </svg>
      <div class="timer-text" role="timer" aria-live="off">
        <strong>{done ? 'Done' : mmss(left)}</strong>
        <small>of {mmss(total)}</small>
      </div>
      <div class="timer-btns">
        {done ? (
          <button class="btn-teal-outline" onClick={reset}>
            Again
          </button>
        ) : running ? (
          <button class="btn-teal-outline" onClick={pause}>
            Pause
          </button>
        ) : (
          <button class="btn-teal" onClick={start}>
            {left < total ? 'Resume' : `Start ${minutes} min timer`}
          </button>
        )}
        <button class="btn-ghost" onClick={addMinute}>
          +1 min
        </button>
      </div>
    </div>
  );
}

export function Cooking({ id, mealParam }: { id: string; mealParam: string | null }) {
  const d = useApp();
  const r = RECIPE_BY_ID.get(id);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState<{ taken: Amount[]; undo?: () => void } | null>(null);
  const awake = useWakeLock();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  if (!r) {
    return (
      <Screen tabs={false}>
        <Empty title="Recipe not found" action="Back" onAction={() => back('plan')} />
      </Screen>
    );
  }
  const mealIndex = mealParam != null && d.plan?.meals[Number(mealParam)]?.recipeId === id ? Number(mealParam) : null;
  const n = r.steps.length;
  // A plan meal is cooked for its eaters plus any later leftover or batch meals.
  const portions = Math.max(1, Math.round(mealIndex != null ? mealPortions(d.plan!, mealIndex, d.settings) : portionsFor(d.settings)));
  const factor = portions / r.servings;
  const text = scaleStep(stepText(r.steps[step]), factor);
  const rawTip = stepTip(r.steps[step]);
  const tip = rawTip && scaleStep(rawTip, factor);
  const mins = stepMinutes(text);
  const ings = scaledIngredients(r, portions);
  const lower = fold(text);
  const used = ings.filter((i) => {
    const words = fold(i.name).split(/[\s,()]+/).filter((w) => w.length > 3);
    return words.some((w) => lower.includes(w.replace(/s$/, '')));
  });

  const finish = () => {
    if (mealIndex != null) {
      const already = d.plan!.cooked.includes(mealIndex);
      const taken = already ? [] : setCooked(mealIndex, true);
      setFinished({ taken, undo: already ? undefined : () => setCooked(mealIndex, false) });
    } else setFinished(cookedOutsidePlan(id));
  };

  return (
    <Screen tabs={false} glow="orange">
      <div class="cook-top">
        <button class="icon-btn" aria-label="Close cooking mode" onClick={() => back('plan')}>
          <IconClose />
        </button>
        <span class="cook-count">
          Step {step + 1} of {n}
        </span>
        <span class={`screen-on${awake ? ' on' : ''}`}>{awake ? 'Screen on' : ''}</span>
      </div>
      <div class="progress-segs" aria-hidden="true">
        {r.steps.map((_, i) => (
          <span key={i} class={i < step ? 'done' : i === step ? 'now' : ''} />
        ))}
      </div>
      <h1 class="cook-recipe">{r.title}</h1>
      <p class={`cook-step${text.length > 160 ? ' long' : ''}`} aria-live="polite">
        {text}
      </p>
      {tip && (
        <p class="step-tip">
          <strong>Tip</strong> {tip}
        </p>
      )}
      {used.length > 0 && (
        <div class="chip-wrap static">
          {used.map((i) => (
            <span key={i.id} class="pill static">
              {i.display} {i.name.toLowerCase()}
            </span>
          ))}
        </div>
      )}
      {mins != null && <Timer key={`${step}-${mins}`} minutes={mins} />}
      {step < n - 1 && (
        <div class="next-card">
          <small>NEXT</small>
          <p>{scaleStep(stepText(r.steps[step + 1]), factor)}</p>
        </div>
      )}

      <div class="cook-bar">
        <button class="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        {step < n - 1 ? (
          <button class="btn-primary grow" onClick={() => setStep(step + 1)}>
            Next step
          </button>
        ) : (
          <button class="btn-primary grow" onClick={finish}>
            Done, enjoy!
          </button>
        )}
      </div>

      {finished && <RateSheet id={id} title={r.title} taken={finished.taken} undo={finished.undo} onClose={() => go('plan')} />}
    </Screen>
  );
}

function RateSheet({ id, title, taken, undo, onClose }: { id: string; title: string; taken: Amount[]; undo?: () => void; onClose: () => void }) {
  const d = useApp();
  const current = ratingOf(d, id);
  const [undone, setUndone] = useState(false);
  return (
    <Sheet title={`How was ${title}?`} sub="Your answer helps the next plans." onClose={onClose}>
      {taken.length > 0 && (
        <div class="taken-card">
          <p>
            <strong>Taken from your pantry:</strong> {takenText(taken)}.
          </p>
          {undo &&
            (undone ? (
              <span class="hint">Put back. The meal is not marked cooked.</span>
            ) : (
              <button
                class="link-btn"
                onClick={() => {
                  undo();
                  setUndone(true);
                }}
              >
                Undo
              </button>
            ))}
        </div>
      )}
      <div class="rate-row">
        <button
          class={`round-btn big${current && !current.up ? ' on-pink' : ''}`}
          aria-label="Not again soon"
          onClick={() => {
            rate(id, false, '8weeks');
            onClose();
          }}
        >
          <IconThumbDown size={28} />
        </button>
        <button
          class={`round-btn big teal${current?.up ? ' on-teal' : ''}`}
          aria-label="Loved it"
          onClick={() => {
            rate(id, true);
            onClose();
          }}
        >
          <IconThumbUp size={28} />
        </button>
      </div>
      <button class="btn-ghost wide" onClick={onClose}>
        Skip
      </button>
    </Sheet>
  );
}
