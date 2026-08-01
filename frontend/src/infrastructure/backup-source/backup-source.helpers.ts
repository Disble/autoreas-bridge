import { ConfirmBackupImport, ExportBackup, PreviewBackupImport } from '../../../wailsjs/go/main/App';
import { BACKUP_SOURCE_STATE } from './backup-source.constants';
import type { BackupSource } from './backup-source.types';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed backup source. Unlike the other
 * sources, a missing binding rejects rather than degrading to a safe
 * default: there is no meaningful zero-value export or import result, so the
 * feature hooks treat "runtime unavailable" as the same error path as any
 * other export/import failure.
 */
function createBackupSource(): BackupSource {
  if (BACKUP_SOURCE_STATE.sharedSource !== null) {
    return BACKUP_SOURCE_STATE.sharedSource;
  }

  BACKUP_SOURCE_STATE.sharedSource = {
    exportBackup() {
      return invokeGoBinding('ExportBackup', ExportBackup, () => Promise.reject(new Error('Backup runtime unavailable')));
    },
    previewBackupImport() {
      return invokeGoBinding('PreviewBackupImport', PreviewBackupImport, () => Promise.reject(new Error('Backup runtime unavailable')));
    },
    confirmBackupImport(bundleChecksum) {
      return invokeGoBinding(
        'ConfirmBackupImport',
        () => ConfirmBackupImport(bundleChecksum),
        () => Promise.reject(new Error('Backup runtime unavailable')),
      );
    },
  };

  return BACKUP_SOURCE_STATE.sharedSource;
}

/** Shared backup source singleton used across feature hooks. */
export const backupSource = createBackupSource();
