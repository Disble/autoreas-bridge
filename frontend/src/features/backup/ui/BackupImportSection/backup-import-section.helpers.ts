import {
  BACKUP_IMPORT_APPLYING_LABEL,
  BACKUP_IMPORT_GROUP_LABELS,
  BACKUP_IMPORT_NO_KNOWN_GROUPS_MESSAGE,
  BACKUP_IMPORT_PREVIEWING_LABEL,
  BACKUP_IMPORT_PREVIEW_LABEL,
  BACKUP_IMPORT_UNKNOWN_ERROR_MESSAGE,
} from './backup-import-section.constants';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../infrastructure/backup-source';
import type { BackupImportPhase, ImportPhaseInput, ImportPreviewSummary } from './backup-import-section.types';

/** Resolves a group name to its human-readable label, falling back to the raw name. */
function labelFor(name: string): string {
  return BACKUP_IMPORT_GROUP_LABELS[name] ?? name;
}

/** Resolves the primary action's label from the current phase. */
export function primaryActionLabel(phase: BackupImportPhase): string {
  if (phase === 'previewing') {
    return BACKUP_IMPORT_PREVIEWING_LABEL;
  }
  if (phase === 'applying') {
    return BACKUP_IMPORT_APPLYING_LABEL;
  }
  return BACKUP_IMPORT_PREVIEW_LABEL;
}

/**
 * Classifies the section's current phase from its raw state. Busy always
 * wins over a stale preview or result; a cancelled dialog reports back to
 * `idle` rather than `previewed`, since there is nothing to confirm.
 */
export function classifyImportPhase(input: ImportPhaseInput): BackupImportPhase {
  if (input.isApplying) {
    return 'applying';
  }
  if (input.isPreviewing) {
    return 'previewing';
  }
  if (input.errorMessage !== null) {
    return 'failed';
  }
  if (input.result !== null) {
    return 'applied';
  }
  if (input.preview !== null) {
    return input.preview.cancelled ? 'idle' : 'previewed';
  }
  return 'idle';
}

/**
 * Builds the disclosure lines a preview must show before confirmation: what
 * will be applied, what the bundle omits (left untouched, never emptied),
 * what this build ignores, and what changed since the bundle's format
 * version.
 */
export function summarizeImportPreview(preview: BackupImportPreviewDTO): ImportPreviewSummary {
  const groupLines =
    preview.groups.length === 0
      ? [BACKUP_IMPORT_NO_KNOWN_GROUPS_MESSAGE]
      : preview.groups.map((group) => `${group.recordCount} ${labelFor(group.name)}`);

  // Load-bearing: an absent group is left untouched, not emptied. This line
  // is the UI half of "omission is not deletion" -- deleting this branch
  // would make an absent group render identically to a carried one.
  const untouchedLine =
    preview.absentGroups.length === 0
      ? null
      : `Left untouched: ${preview.absentGroups.map(labelFor).join(', ')}`;

  const ignoredLine =
    preview.unknownGroups.length === 0 ? null : `Ignored (unknown to this build): ${preview.unknownGroups.join(', ')}`;

  return {
    groupLines,
    untouchedLine,
    ignoredLine,
    versionNoteLines: preview.versionNotes,
  };
}

/** Turns a caught import error into a user-facing English message. */
function describeThrownImportError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return BACKUP_IMPORT_UNKNOWN_ERROR_MESSAGE;
}

/**
 * Describes the apply outcome: a full success names what was imported, a
 * partial failure names the failed group, the committed and unattempted
 * groups, and the restore point path. When no result exists at all -- the
 * call itself was rejected, e.g. by a gate failure before the restore point
 * -- falls back to the thrown error's message, or a generic one for a blank
 * or non-Error rejection.
 */
export function describeImportOutcome(result: BackupImportResultDTO | null, error: unknown): string {
  if (result === null) {
    return describeThrownImportError(error);
  }
  if (result.failedGroup === '') {
    const parts = result.importedGroups.map((group) => `${group.recordCount} ${labelFor(group.name)}`);
    return parts.length === 0 ? 'Import applied nothing.' : `Imported ${parts.join(', ')}.`;
  }

  const committed = result.importedGroups.map((group) => labelFor(group.name));
  const unattempted = result.unattemptedGroups.map(labelFor);
  return (
    `Import failed at ${labelFor(result.failedGroup)}. ` +
    `Committed: ${committed.length === 0 ? 'nothing' : committed.join(', ')}. ` +
    `Unattempted: ${unattempted.length === 0 ? 'none' : unattempted.join(', ')}. ` +
    `Restore point: ${result.restorePointPath}.`
  );
}
