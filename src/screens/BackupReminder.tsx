// "Time for a backup": shown on the Plan screen every two weeks.

import { useState } from 'preact/hooks';
import { backupDue, saveBackup, snoozeBackup } from '../app/backup';
import { useApp } from '../app/state';
import { daysBetween, zagrebToday } from '../lib/format';

export function BackupReminder() {
  const d = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const today = zagrebToday();
  if (msg) {
    return (
      <div class="notice" role="status">
        <span class="grow">{msg}</span>
      </div>
    );
  }
  if (!backupDue(d, today)) return null;
  const when = d.lastBackupOn ? `Your last backup was ${daysBetween(d.lastBackupOn, today)} days ago.` : 'You have not made a backup yet.';
  return (
    <section class="notice backup-note" aria-label="Backup reminder">
      <span class="grow">
        <strong>Time for a backup</strong>
        <small>{when} Your plans, ratings and pantry live only on this phone.</small>
      </span>
      <span class="backup-btns">
        <button
          class="btn-small"
          onClick={async () => {
            const r = await saveBackup();
            if (r === 'shared' || r === 'downloaded') setMsg('Backup saved. Keep it in iCloud Drive.');
            if (r === 'failed') setMsg('The backup could not be saved. Try again in Settings.');
          }}
        >
          Back up
        </button>
        <button class="link-btn" onClick={snoozeBackup}>
          Later
        </button>
      </span>
    </section>
  );
}
