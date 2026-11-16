import type { BackupSource } from '../../shared/contracts/backup.types';

/** Module-local singleton container for the shared backup source. */
export const BACKUP_SOURCE_STATE: { sharedSource: BackupSource | null } = {
  sharedSource: null,
};
