import type { BackupSource } from '../../../shared/contracts/backup.types';

/** The one binding the chip reads: the backup module's SQLite status ping. */
export type SQLiteStatusSource = Pick<BackupSource, 'getSQLiteStatus'>;

/** What the chip shows once the status read settled. */
export interface SyncStatusChipState {
  readonly status: string;
  readonly statusTone: 'success' | 'danger';
}
