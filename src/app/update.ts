// App updates: a home-screen app on a phone can stay open in the background
// for days and keep running an old version. When it comes back to the front,
// ask for a new version; once one has taken over, reload, but only on a
// screen where nothing is lost (never while cooking, shopping, scanning, in
// the meal prep session or halfway through the first setup).

import { getData, isLoaded } from './state';
import { parseHash } from './router';

const SAFE = new Set(['plan', 'recipes', 'recipe', 'shopping', 'pantry', 'recap', 'settings']);

export function safeToReload(hash: string, onboarded: boolean): boolean {
  return onboarded && SAFE.has(parseHash(hash).name);
}

export function watchForUpdates(reg: ServiceWorkerRegistration): void {
  const sw = navigator.serviceWorker;
  // The first install also takes control: that is not an update.
  let waiting = false;
  const hadController = !!sw.controller;
  const tryReload = () => {
    if (waiting && document.visibilityState === 'visible' && safeToReload(location.hash, isLoaded() && getData().settings.onboarded)) location.reload();
  };
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    waiting = true;
    tryReload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (waiting) tryReload();
    else reg.update().catch(() => undefined);
  });
  // Left the cooking screen: now is a good moment.
  window.addEventListener('hashchange', tryReload);
}
