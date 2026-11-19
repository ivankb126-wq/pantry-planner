// "Add to Home Screen" guide and the offline notice.

import { useEffect, useState } from 'preact/hooks';
import { readPref, writePref } from '../lib/prefs';
import { IconClose } from '../ui/icons';
import { Sheet } from '../ui/kit';

/** True when the app runs from the home screen (not inside Safari). */
export function isInstalled(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function OfflineBar() {
  const online = useOnline();
  useEffect(() => {
    document.body.classList.toggle('is-offline', !online);
  }, [online]);
  if (online) return null;
  return (
    <div class="offline-bar" role="status">
      Offline. Using the prices saved on your phone.
    </div>
  );
}

function ShareIcon() {
  return (
    <svg class="inline-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share button">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

export function InstallSteps() {
  return (
    <>
      <ol class="install-steps">
        <li>
          In Safari, tap the <strong>Share</strong> button <ShareIcon /> at the bottom of the screen.
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong> in the top right corner.
        </li>
        <li>
          Open <strong>Pantry</strong> from your home screen. It opens full screen and works without internet.
        </li>
      </ol>
      <p class="sub">
        The home screen app keeps its own data, separate from Safari. To bring your plan, ratings and pantry along: in Safari go to Settings, <strong>Back up my data</strong>, then in the new app go to Settings, <strong>Restore a backup</strong> and pick that file.
      </p>
    </>
  );
}

const KEY = 'install.dismissed';

/** A card on the Plan screen until the app is on the home screen (or dismissed). */
export function InstallCard() {
  const [hidden, setHidden] = useState(() => isInstalled() || readPref<boolean>(KEY) === true);
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    writePref(KEY, true);
    setHidden(true);
  };
  return (
    <>
      <section class="install-card" aria-label="Add to Home Screen">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="44" height="44" />
        <span class="grow">
          <strong>Put Pantry Planner on your home screen</strong>
          <small>Opens like an app and works offline in the shop.</small>
        </span>
        <button class="btn-small" onClick={() => setOpen(true)}>
          How
        </button>
        <button class="icon-btn small" aria-label="Hide this tip" onClick={dismiss}>
          <IconClose size={16} />
        </button>
      </section>
      {open && (
        <Sheet title="Add to Home Screen" onClose={() => setOpen(false)}>
          <InstallSteps />
          <button
            class="btn-primary wide"
            onClick={() => {
              setOpen(false);
              dismiss();
            }}
          >
            Got it
          </button>
        </Sheet>
      )}
    </>
  );
}
