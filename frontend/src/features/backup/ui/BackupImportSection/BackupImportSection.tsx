import { Button } from '@heroui/react';
import { BACKUP_IMPORT_CANCEL_LABEL, BACKUP_IMPORT_CONFIRM_LABEL, BACKUP_IMPORT_DESTRUCTIVE_WARNING } from './backup-import-section.constants';
import { describeImportOutcome, primaryActionLabel, summarizeImportPreview } from './backup-import-section.helpers';
import { useBackupImport } from './use-backup-import';

/**
 * Options "Backup" tab body: the desktop-only backup import flow -- preview
 * a bundle, review what it would do, then confirm or cancel. Presentation-
 * only, wired entirely from `useBackupImport()`.
 */
export function BackupImportSection() {
  const { phase, preview, result, errorMessage, onPreview, onConfirm, onCancel } = useBackupImport();
  const isBusy = phase === 'previewing' || phase === 'applying';
  const previewSummary = preview ? summarizeImportPreview(preview) : null;

  return (
    <div className="flex flex-col gap-3">
      {phase !== 'previewed' ? (
        <Button isDisabled={isBusy} variant="primary" onPress={onPreview}>
          {primaryActionLabel(phase)}
        </Button>
      ) : null}

      {phase === 'previewed' && previewSummary ? (
        <div className="flex flex-col gap-2 text-sm text-muted">
          {previewSummary.groupLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {previewSummary.untouchedLine ? <p>{previewSummary.untouchedLine}</p> : null}
          {previewSummary.ignoredLine ? <p>{previewSummary.ignoredLine}</p> : null}
          {previewSummary.versionNoteLines.map((note) => (
            <p key={note}>{note}</p>
          ))}
          <p className="text-danger">{BACKUP_IMPORT_DESTRUCTIVE_WARNING}</p>
          <div className="flex gap-2">
            <Button variant="danger" onPress={onConfirm}>
              {BACKUP_IMPORT_CONFIRM_LABEL}
            </Button>
            <Button variant="secondary" onPress={onCancel}>
              {BACKUP_IMPORT_CANCEL_LABEL}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'failed' ? (
        <p className="text-sm text-danger">{result ? describeImportOutcome(result, errorMessage) : errorMessage}</p>
      ) : null}
      {phase === 'applied' && result ? <p className="text-sm text-muted">{describeImportOutcome(result, null)}</p> : null}
    </div>
  );
}
