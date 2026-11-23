// Small shared components in the Sunset Night style.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { go } from '../app/router';
import { IconBack, IconPantry, IconPlan, IconRecipes, IconShopping } from './icons';

export function Screen({ children, glow = 'pink', tabs = true }: { children: ComponentChildren; glow?: 'pink' | 'purple' | 'teal' | 'orange'; tabs?: boolean }) {
  return (
    <div class={`screen glow-${glow}${tabs ? ' with-tabs' : ''}`}>
      <div class="screen-inner">{children}</div>
    </div>
  );
}

export function TitleBar({ kicker, title, right, backTo }: { kicker?: ComponentChildren; title: string; right?: ComponentChildren; backTo?: string }) {
  return (
    <div class="titlebar">
      {backTo && (
        <a class="icon-btn" href={backTo} aria-label="Back">
          <IconBack />
        </a>
      )}
      <div class="titlebar-text">
        {kicker && <p class="kicker">{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {right && <div class="titlebar-right">{right}</div>}
    </div>
  );
}

const TABS = [
  { id: 'plan', label: 'Plan', Icon: IconPlan },
  { id: 'recipes', label: 'Recipes', Icon: IconRecipes },
  { id: 'shopping', label: 'Shopping', Icon: IconShopping },
  { id: 'pantry', label: 'Pantry', Icon: IconPantry },
];

export function TabBar({ active }: { active: string }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <a key={id} href={`#/${id}`} aria-current={active === id ? 'page' : undefined} class={active === id ? 'on' : ''}>
          <Icon />
          {label}
        </a>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div
      class={`segmented${options.length > 4 ? ' many' : ''}`}
      role="tablist"
      aria-label={label}
      // Five tabs on a small phone: each as wide as its word, so none is cut off.
      style={{ gridTemplateColumns: options.length > 4 ? `repeat(${options.length}, auto)` : `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} class={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ComponentChildren }) {
  return (
    <button class={`pill${on ? ' on' : ''}`} aria-pressed={!!on} onClick={onClick}>
      {children}
    </button>
  );
}

export function Stepper({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div class="stepper-row">
      <span>{label}</span>
      <div class="stepper2">
        <button aria-label={`Less ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <span aria-live="polite">{format ? format(value) : value}</span>
        <button aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div class="list-row">
      <span class="grow">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button role="switch" aria-checked={checked} aria-label={label} class={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

/** Bottom sheet dialog. Escape and the backdrop close it. */
export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <h2>{title}</h2>
        {sub && <p class="sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

/** The dish's photo, or a sunset scene with its emoji when there is none. */
export function DishArt({ emoji, height = 104, photo, children }: { emoji: string; height?: number; photo?: string | null; children?: ComponentChildren }) {
  if (photo) {
    return (
      <div class="dish-art has-photo" style={{ height: `${height}px` }}>
        <img class="dish-photo" src={photo} alt="" loading="lazy" decoding="async" />
        {children}
      </div>
    );
  }
  return (
    <div class="dish-art" style={{ height: `${height}px` }}>
      <svg class="dish-scene" viewBox="0 0 200 84" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <circle cx="100" cy="62" r="34" fill="#FF9A3C" />
        <rect x="60" y="52" width="80" height="3" fill="#4A1E5C" />
        <rect x="60" y="60" width="80" height="4" fill="#4A1E5C" />
        <rect x="60" y="69" width="80" height="5" fill="#4A1E5C" />
        <path d="M22 84c2-22 6-38 12-48M34 36c-8-2-14 2-18 6M34 36c6-6 14-6 18-2M34 36c-2-8 2-14 6-16" fill="none" stroke="#140B24" stroke-width="3" stroke-linecap="round" />
        <path d="M176 84c-2-18-5-30-10-40M166 44c7-2 12 1 15 5M166 44c-5-5-12-5-15-1M166 44c1-7-2-11-5-13" fill="none" stroke="#140B24" stroke-width="3" stroke-linecap="round" />
        <rect x="0" y="78" width="200" height="6" fill="#140B24" />
      </svg>
      <span class="dish-emoji" aria-hidden="true">
        {emoji}
      </span>
      {children}
    </div>
  );
}

export function Empty({ title, children, action, onAction }: { title: string; children?: ComponentChildren; action?: string; onAction?: () => void }) {
  return (
    <div class="empty-card">
      <h2>{title}</h2>
      {children && <p class="sub">{children}</p>}
      {action && (
        <button class="btn-primary" onClick={onAction ?? (() => go('settings'))}>
          {action}
        </button>
      )}
    </div>
  );
}

/** A message that hides itself after a few seconds. */
export function useToast<T>(ms = 5000): [T | null, (t: T | null) => void] {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    if (t == null) return;
    const h = setTimeout(() => setT(null), ms);
    return () => clearTimeout(h);
  }, [t]);
  return [t, setT];
}

export function Toast({ children, action, onAction }: { children: ComponentChildren; action?: string; onAction?: () => void }) {
  return (
    <div class="toast" role="status">
      <span>{children}</span>
      {action && (
        <button onClick={onAction} class="toast-btn">
          {action}
        </button>
      )}
    </div>
  );
}
