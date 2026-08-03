import { useCallback, useMemo, useState } from 'react';
import { backupSource } from '../../../../infrastructure/backup-source/backup-source.helpers';
import { classifyImportPhase, describeImportOutcome } from './backup-import-section.helpers';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../infrastructure/backup-source/backup-source.types';
import type { BackupImportSource } from './backup-import-section.types';

/**
 * Owns the backup import run: it is the only file in this feature that calls
 * into the backup runtime source for import. Guards against firing a second
 * preview or a second confirm while one is already in flight, and against
 * confirming before a preview exists.
 */
export function useBackupImport(source: BackupImportSource = backupSource) {
  // 1. Refs

  // 2. State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [preview, setPreview] = useState<BackupImportPreviewDTO | null>(null);
  const [result, setResult] = useState<BackupImportResultDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const phase = useMemo(
    () => classifyImportPhase({ isPreviewing, isApplying, preview, result, errorMessage }),
    [isPreviewing, isApplying, preview, result, errorMessage],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onPreview = useCallback(() => {
    if (isPreviewing || isApplying) {
      return;
    }

    setIsPreviewing(true);
    setErrorMessage(null);
    setResult(null);
    void source
      .previewBackupImport()
      .then((dto) => {
        setPreview(dto.cancelled ? null : dto);
      })
      .catch((error: unknown) => {
        setPreview(null);
        setErrorMessage(describeImportOutcome(null, error));
      })
      .finally(() => {
        setIsPreviewing(false);
      });
  }, [isPreviewing, isApplying, source]);

  const onConfirm = useCallback(() => {
    if (preview === null || isApplying || isPreviewing) {
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);
    void source
      .confirmBackupImport(preview.bundleChecksum)
      .then((dto) => {
        setResult(dto);
        setErrorMessage(dto.errorMessage === '' ? null : dto.errorMessage);
      })
      .catch((error: unknown) => {
        setErrorMessage(describeImportOutcome(null, error));
      })
      .finally(() => {
        setIsApplying(false);
      });
  }, [preview, isApplying, isPreviewing, source]);

  const onCancel = useCallback(() => {
    setPreview(null);
    setErrorMessage(null);
  }, []);

  // 7. Effects

  return {
    phase,
    preview,
    result,
    errorMessage,
    onPreview,
    onConfirm,
    onCancel,
  };
}
