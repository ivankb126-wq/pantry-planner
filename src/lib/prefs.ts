// Small per-device conveniences (last chosen store and similar). Real user
// data (plans, pantry, ratings) will live in IndexedDB from milestone 4.

const PREFIX = 'pantry-planner:';

export function readPref<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the app still works, it just forgets.
  }
}
