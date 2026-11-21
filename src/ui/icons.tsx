// Stroke icons from the approved Sunset Night mockups.

import type { JSX } from 'preact';

type P = { size?: number; strokeWidth?: number };

function S({ size = 22, strokeWidth = 1.9, children }: P & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconPlan = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </S>
);
export const IconRecipes = (p: P) => (
  <S {...p}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </S>
);
export const IconShopping = (p: P) => (
  <S {...p}>
    <path d="M4 9h16l-1.5 10a2 2 0 0 1-2 1.7h-9a2 2 0 0 1-2-1.7z" />
    <path d="M9 9l3-5 3 5" />
  </S>
);
export const IconPantry = (p: P) => (
  <S {...p}>
    <rect x="6" y="7" width="12" height="14" rx="3" />
    <path d="M8 3h8v4H8z" />
  </S>
);
export const IconSettings = (p: P) => (
  <S {...p} strokeWidth={1.8}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </S>
);
export const IconSwap = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" />
    <path d="M20 4v5h-5M4 20v-5h5" />
  </S>
);
export const IconFlame = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-4 3-5 0 2 1 3 2 3 0-3-1-5 1-8z" />
  </S>
);
export const IconBack = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M15 5l-7 7 7 7" />
  </S>
);
export const IconChevron = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M9 5l7 7-7 7" />
  </S>
);
export const IconDown = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </S>
);
export const IconClose = (p: P) => (
  <S {...p} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IconPlus = (p: P) => (
  <S {...p} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IconCheck = (p: P) => (
  <S {...p} strokeWidth={2.5}>
    <path d="M5 12l5 5 9-10" />
  </S>
);
export const IconSearch = (p: P) => (
  <S {...p} strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </S>
);
export const IconClock = (p: P) => (
  <S {...p} strokeWidth={2}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </S>
);
export const IconSun = (p: P) => (
  <S {...p} strokeWidth={2}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
  </S>
);
export const IconThumbUp = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M7 10v10M7 10l4-7c1.7 0 3 1.3 3 3v3h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" />
    <path d="M3 10h4v10H3z" />
  </S>
);
export const IconThumbDown = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M7 14V4M7 14l4 7c1.7 0 3-1.3 3-3v-3h5a2 2 0 0 0 2-2.3l-1.2-7A2 2 0 0 0 17.8 4H7" />
    <path d="M3 4h4v10H3z" />
  </S>
);
export function IconHeart({ size = 22, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}
export const IconLeaf = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M12 21c-5 0-8-4-8-9 4 0 7 2 8 5 1-3 4-5 8-5 0 5-3 9-8 9z" />
    <path d="M12 17V5M9 7l3-3 3 3" />
  </S>
);
export const IconTag = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.5" />
  </S>
);
export const IconShare = (p: P) => (
  <S {...p}>
    <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
    <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
  </S>
);
export const IconSnow = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />
  </S>
);
export const IconBarcode = (p: P) => (
  <S {...p} strokeWidth={2}>
    <path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13 8v8M17 8v8" />
  </S>
);
