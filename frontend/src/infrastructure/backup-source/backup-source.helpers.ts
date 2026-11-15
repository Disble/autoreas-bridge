import { ConfirmBackupImport, ExportBackup, GetSQLiteStatus, PreviewBackupImport } from '../../../wailsjs/go/desktop/App';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { BACKUP_SOURCE_STATE } from './backup-source.constants';
import type { BackupSource } from '../../shared/contracts/backup.types';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed backup source over the backup module's
 * bindings. Unlike the older sources, a missing binding rejects rather than
 * degrading to a safe default: there is no meaningful zero-value status,
 * export or import result, so the feature hooks treat "runtime unavailable" as
 * the same error path as any other failure. A coded binding failure (the
 * backup module still starting or failed, or a service error) rejects as a
 * `BridgeError` whose message is the plain text the UI shows.
 */
function createBackupSource(): BackupSource {
  if (BACKUP_SOURCE_STATE.sharedSource !== null) {
    return BACKUP_SOURCE_STATE.sharedSource;
  }

  BACKUP_SOURCE_STATE.sharedSource = {
    getSQLiteStatus() {
      return withBridgeErrors(
        invokeGoBinding('GetSQLiteStatus', GetSQLiteStatus, () =>
          Promise.reject(createBridgeError('unavailable', 'the GetSQLiteStatus binding is not attached')),
        ),
      );
    },
    exportBackup() {
      return withBridgeErrors(invokeGoBinding('ExportBackup', ExportBackup, () => Promise.reject(new Error('Backup runtime unavailable'))));
    },
    previewBackupImport() {
      return withBridgeErrors(
        invokeGoBinding('PreviewBackupImport', PreviewBackupImport, () => Promise.reject(new Error('Backup runtime unavailable'))),
      );
    },
    confirmBackupImport(bundleChecksum) {
      return withBridgeErrors(
        invokeGoBinding(
          'ConfirmBackupImport',
          () => ConfirmBackupImport(bundleChecksum),
          () => Promise.reject(new Error('Backup runtime unavailable')),
        ),
      );
    },
  };

  return BACKUP_SOURCE_STATE.sharedSource;
}

/** Shared backup source singleton used across feature hooks. */
export const backupSource = createBackupSource(); // eslint-disable-line dharness/role-file-shape
