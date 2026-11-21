// Keeps the screen on while cooking or shopping (where the phone supports it).

import { useEffect, useState } from 'preact/hooks';

export function useWakeLock(): boolean {
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
