// Scan a barcode to add a product to the pantry. The camera reads the
// barcode, the shops' price lists say what it is and how big the package is.
// Barcodes the shops do not list can be taught once and are remembered.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { barcodeListLoaded, lookupBarcode, rememberBarcode } from '../app/barcodes';
import { INGREDIENTS, INGREDIENT_LIST, ingName } from '../app/catalog';
import { stock } from '../app/pantry';
import { go } from '../app/router';
import { update } from '../app/state';
import { barcodeKey } from '../lib/barcodes';
import { formatAmount } from '../lib/format';
import type { IngredientInfo } from '../lib/nutrition';
import { IconClose, IconSearch } from '../ui/icons';
import { Screen, Toast, useToast } from '../ui/kit';
import { fold } from './pickers';

type Found = { code: string; ingredient: string; size: number; name: string };
type Phase = { kind: 'camera' } | { kind: 'looking'; code: string } | { kind: 'found'; hit: Found } | { kind: 'unknown'; code: string };

export function Scan() {
  const [phase, setPhase] = useState<Phase>({ kind: 'camera' });
  const [camError, setCamError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [toast, setToast] = useToast<string>();

  const look = async (code: string) => {
    setPhase({ kind: 'looking', code });
    const hit = await lookupBarcode(code);
    setPhase(hit ? { kind: 'found', hit: { code, ...hit } } : { kind: 'unknown', code });
  };

  const added = (ingredient: string, amount: number) => {
    update((x) => stock(x, [{ ingredient, amount }]));
    setToast(`${ingName(ingredient)} added to your pantry.`);
    setTyped('');
    setPhase({ kind: 'camera' });
  };

  return (
    <Screen glow="teal" tabs={false}>
      <div class="mode-top">
        <h1>Scan a barcode</h1>
        <a class="icon-btn" href="#/pantry" aria-label="Close scanner">
          <IconClose />
        </a>
      </div>

      {phase.kind === 'camera' && (
        <>
          {camError ? <p class="notice">{camError}</p> : <Camera onCode={look} onError={setCamError} />}
          <form
            class="scan-type"
            onSubmit={(e) => {
              e.preventDefault();
              if (barcodeKey(typed)) void look(typed);
              else setToast('That number is not a full barcode. Check the digits under the lines.');
            }}
          >
            <label htmlFor="code">Or type the number under the barcode</label>
            <div class="scan-type-row">
              <input id="code" inputMode="numeric" autoComplete="off" placeholder="13 digits" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
              <button class="btn-small btn-primary" type="submit" disabled={typed.replace(/\D/g, '').length < 8}>
                Find
              </button>
            </div>
          </form>
        </>
      )}

      {phase.kind === 'looking' && (
        <div class="card loading-card" aria-busy="true">
          <div class="spinner" aria-hidden="true" />
          <p>Looking up {phase.code}...</p>
        </div>
      )}

      {phase.kind === 'found' && <FoundCard hit={phase.hit} onAdd={added} onAgain={() => setPhase({ kind: 'camera' })} />}

      {phase.kind === 'unknown' && (
        <TeachCard
          code={phase.code}
          onAdd={(ing, amount) => {
            rememberBarcode(phase.code, ing, amount);
            added(ing, amount);
          }}
          onAgain={() => setPhase({ kind: 'camera' })}
        />
      )}

      <button class="btn-ghost wide" onClick={() => go('pantry')}>
        Done
      </button>
      {toast && <Toast>{toast}</Toast>}
    </Screen>
  );
}

/** Live camera view that reports the first barcode it reads. */
function Camera({ onCode, onError }: { onCode: (code: string) => void; onError: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError('This browser cannot use the camera here. Type the number under the barcode instead.');
        return;
      }
      try {
        const [scanner, media] = await Promise.all([
          import('../app/scanner'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }),
        ]);
        stream = media;
        if (stopped || !video.current) return stop();
        video.current.srcObject = media;
        await video.current.play();
        setReady(true);
        const tick = async () => {
          const v = video.current;
          if (stopped || !v || !ctx) return;
          if (v.videoWidth) {
            // A strip across the middle is enough and reads faster.
            const w = Math.min(960, v.videoWidth);
            const scale = w / v.videoWidth;
            const h = Math.round(v.videoHeight * scale * 0.5);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, v.videoHeight * 0.25, v.videoWidth, v.videoHeight * 0.5, 0, 0, w, h);
            const code = await scanner.readFrame(ctx.getImageData(0, 0, w, h)).catch(() => null);
            if (code && barcodeKey(code) && !stopped) {
              navigator.vibrate?.(60);
              stop();
              onCode(code);
              return;
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      } catch (e) {
        stop();
        const name = (e as { name?: string }).name;
        onError(
          name === 'NotAllowedError'
            ? 'The camera is not allowed. On iPhone: Settings, then Safari (or the app), then Camera, Allow. Or type the number under the barcode.'
            : 'The camera could not start. Type the number under the barcode instead.',
        );
      }
    })();
    return stop;
  }, []);

  return (
    <div class="scan-view">
      <video ref={video} playsInline muted autoPlay aria-label="Camera" />
      <div class="scan-frame" aria-hidden="true" />
      <p class="scan-hint">{ready ? 'Hold the barcode inside the frame' : 'Starting the camera...'}</p>
    </div>
  );
}

function FoundCard({ hit, onAdd, onAgain }: { hit: Found; onAdd: (ingredient: string, amount: number) => void; onAgain: () => void }) {
  const ing = INGREDIENTS[hit.ingredient];
  const [packs, setPacks] = useState(1);
  if (!ing) return null;
  return (
    <section class="card scan-found">
      <p class="kicker">Found</p>
      <h2>{ing.name}</h2>
      {hit.name && <p class="sub">{hit.name}</p>}
      <div class="stepper-row">
        <span>Packs of {formatAmount(hit.size, ing.unit)}</span>
        <div class="stepper2">
          <button aria-label="Fewer packs" disabled={packs <= 1} onClick={() => setPacks(packs - 1)}>
            −
          </button>
          <span aria-live="polite">{packs}</span>
          <button aria-label="More packs" onClick={() => setPacks(packs + 1)}>
            +
          </button>
        </div>
      </div>
      <div class="sheet-btns">
        <button class="btn-ghost" onClick={onAgain}>
          Scan again
        </button>
        <button class="btn-primary" onClick={() => onAdd(hit.ingredient, hit.size * packs)}>
          Add {formatAmount(hit.size * packs, ing.unit)}
        </button>
      </div>
    </section>
  );
}

/** A barcode no shop lists: pick what it is once, and it is remembered. */
function TeachCard({ code, onAdd, onAgain }: { code: string; onAdd: (ingredient: string, amount: number) => void; onAgain: () => void }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<IngredientInfo | null>(null);
  const [amount, setAmount] = useState(0);
  const matches = useMemo(() => {
    const f = fold(q.trim());
    return f ? INGREDIENT_LIST.filter((i) => fold(i.name).includes(f)).slice(0, 6) : [];
  }, [q]);

  if (pick) {
    const step = pick.unit === 'piece' ? 1 : pick.packages[0] && pick.packages[0] <= 250 ? pick.packages[0] : 50;
    return (
      <section class="card scan-found">
        <p class="kicker">Barcode {code}</p>
        <h2>{pick.name}</h2>
        <div class="stepper-row">
          <span>Package size</span>
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
        <p class="sub">The app remembers this barcode, so next time it knows it.</p>
        <div class="sheet-btns">
          <button class="btn-ghost" onClick={() => setPick(null)}>
            Back
          </button>
          <button class="btn-primary" onClick={() => onAdd(pick.id, amount)}>
            Add {formatAmount(amount, pick.unit)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section class="card scan-found">
      <p class="kicker">Barcode {code}</p>
      {barcodeListLoaded() ? (
        <>
          <h2>Not in the shops' lists</h2>
          <p class="sub">The price lists only have food the app uses in recipes. If it is one of those, say what it is.</p>
        </>
      ) : (
        <>
          <h2>Could not check this barcode</h2>
          <p class="sub">The barcode list needs the internet the first time. Try again when you are online, or say what it is.</p>
        </>
      )}
      <label class="search">
        <IconSearch size={20} />
        <input placeholder="What is it? (rice, milk...)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      <ul class="pick-list">
        {matches.map((i) => (
          <li key={i.id}>
            <button
              onClick={() => {
                setPick(i);
                setAmount(i.packages[0] ?? (i.unit === 'piece' ? 1 : 500));
              }}
            >
              {i.name}
            </button>
          </li>
        ))}
      </ul>
      <button class="btn-ghost wide" onClick={onAgain}>
        Scan something else
      </button>
    </section>
  );
}
