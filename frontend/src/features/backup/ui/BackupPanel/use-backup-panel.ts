import { useCallback, useMemo } from 'react';
import { BRIDGE_BACKUP_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { classifyExportOutcome, describeExportError } from './backup-panel.helpers';
import type { BackupExportSource } from './backup-panel.types';

/**
 * Owns the backup export run: it is the only file in this feature that
 * calls into the backup runtime source, through one bridge mutation. Guards
 * against firing a second export while one is already in flight.
 */
export function useBackupPanel(source: BackupExportSource = BRIDGE_BACKUP_SOURCE) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const exportMutation = useBridgeMutation({ mutationFn: () => source.exportBackup() });

  // 5. Derived State (useMemo)
  const isExporting = exportMutation.isPending;
  const result = exportMutation.data ?? null;
  const errorMessage = exportMutation.isError ? describeExportError(exportMutation.error) : null;
  const status = useMemo(
    () => classifyExportOutcome({ isExporting, result, errorMessage }),
    [isExporting, result, errorMessage],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const { mutate } = exportMutation;
  const onExport = useCallback(() => {
    if (isExporting) {
      return;
    }

    mutate();
  }, [isExporting, mutate]);

  // 7. Effects

  return {
    status,
    result,
    errorMessage,
    onExport,
  };
}
