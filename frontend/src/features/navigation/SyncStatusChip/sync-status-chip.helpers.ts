import type { AsyncView } from '../../../shared/query/async-view/async-view.types';
import type { SyncStatusChipState } from './sync-status-chip.types';

/**
 * Maps the SQLite status string to the HeroUI chip tone.
 * This keeps semantic UI decisions out of the presentational component.
 */
export function getSQLiteStatusTone(sqliteStatus: string): 'success' | 'danger' {
  const normalizedStatus = sqliteStatus.toLowerCase();

  return normalizedStatus.includes('ok') || normalizedStatus.includes('open') ? 'success' : 'danger';
}

/**
 * Turns the SQLite status read into what the chip shows: nothing while it
 * loads, the status in its tone once read, and the failure message in danger
 * when the read failed, so a broken database never shows as healthy.
 */
export function toSyncStatusChipState(view: AsyncView<string>): SyncStatusChipState | null {
  if (view.kind === 'ready') {
    return { status: view.data, statusTone: getSQLiteStatusTone(view.data) };
  }
  if (view.kind === 'failure') {
    return { status: view.message, statusTone: 'danger' };
  }
  return null;
}
