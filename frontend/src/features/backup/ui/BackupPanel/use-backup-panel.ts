import { useCallback, useMemo, useState } from 'react';
import { backupSource } from '../../../../infrastructure/backup-source/backup-source.helpers';
import { classifyExportOutcome, describeExportError } from './backup-panel.helpers';
import type { BackupExportResultDTO } from '../../../../infrastructure/backup-source/backup-source.types';
import type { BackupExportSource } from './backup-panel.types';

/**
 * Owns the backup export run: it is the only file in this feature that
 * calls into the backup runtime source. Guards against firing a second
 * export while one is already in flight.
 */
export function useBackupPanel(source: BackupExportSource = backupSource) {
  // 1. Refs

  // 2. State
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<BackupExportResultDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const status = useMemo(
    () => classifyExportOutcome({ isExporting, result, errorMessage }),
    [isExporting, result, errorMessage],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onExport = useCallback(() => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);
    void source
      .exportBackup()
      .then((next) => {
        setResult(next);
      })
      .catch((error: unknown) => {
        setErrorMessage(describeExportError(error));
      })
      .finally(() => {
        setIsExporting(false);
      });
  }, [isExporting, source]);

  // 7. Effects

  return {
    status,
    result,
    errorMessage,
    onExport,
  };
}
