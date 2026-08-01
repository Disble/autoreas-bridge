import { BACKUP_EXPORT_UNKNOWN_ERROR_MESSAGE, BACKUP_GROUP_LABELS } from './backup-panel.constants';
import type { BackupExportResultDTO } from '../../../../infrastructure/backup-source';
import type { BackupPanelStatus, ExportOutcomeInput } from './backup-panel.types';

/**
 * Builds the one-line summary shown after a successful export: per-group
 * record counts using their human-readable labels, followed by the
 * destination path.
 */
export function summarizeExportResult(result: BackupExportResultDTO): string {
  if (result.groups.length === 0) {
    return `Exported nothing to ${result.destinationPath}`;
  }

  const parts = result.groups.map((group) => `${group.recordCount} ${BACKUP_GROUP_LABELS[group.name] ?? group.name}`);
  return `Exported ${parts.join(', ')} to ${result.destinationPath}`;
}

/**
 * Turns a caught export error into a user-facing English message. A blank or
 * non-Error value degrades to a generic message instead of surfacing
 * `undefined` or an empty string in the UI.
 */
export function describeExportError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return BACKUP_EXPORT_UNKNOWN_ERROR_MESSAGE;
}

/**
 * Classifies the panel's current view-model status from its raw state. Busy
 * always wins over a stale result or error; a cancelled dialog is reported
 * distinctly from both a completed export and a hard failure.
 */
export function classifyExportOutcome(input: ExportOutcomeInput): BackupPanelStatus {
  if (input.isExporting) {
    return 'busy';
  }
  if (input.errorMessage !== null) {
    return 'error';
  }
  if (input.result === null) {
    return 'idle';
  }
  if (input.result.cancelled) {
    return 'cancelled';
  }
  return 'success';
}
