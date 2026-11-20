// Saving a backup file, and the gentle reminder to do it now and then.

import { addDays } from '../planner/evaluate';
import { daysBetween, zagrebToday } from '../lib/format';
import { getPhotos } from './photos';
import { type AppData, exportBackup, update } from './state';

export type BackupResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * On the iPhone this opens the share sheet ("Save to Files"), which also
 * works from the home screen app. Elsewhere the file is downloaded.
 */
export async function saveBackup(): Promise<BackupResult> {
  const today = zagrebToday();
  const name = `pantry-planner-backup-${today}.json`;
  const file = new File([exportBackup(getPhotos())], name, { type: 'application/json' });
  const done = (r: BackupResult) => {
    update((d) => {
      d.lastBackupOn = today;
    });
    return r;
  };
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Pantry Planner backup' });
      return done('shared');
    } catch (e) {
      return (e as Error).name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return done('downloaded');
}

/** Remind every two weeks once there is something worth keeping. */
export function backupDue(d: AppData, today: string): boolean {
  const worth = d.history.length + d.ratings.length + d.favourites.length + d.pantry.length + Object.keys(d.notes).length;
  if (worth < 3) return false;
  if (d.backupSnoozedUntil && today < d.backupSnoozedUntil) return false;
  return !d.lastBackupOn || daysBetween(d.lastBackupOn, today) >= 14;
}

export function snoozeBackup(): void {
  update((d) => {
    d.backupSnoozedUntil = addDays(zagrebToday(), 7);
  });
}
