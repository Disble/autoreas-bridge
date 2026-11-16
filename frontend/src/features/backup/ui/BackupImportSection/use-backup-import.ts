import { useCallback, useMemo, useState } from 'react';
import { loadKeymapOverrides } from '../../../../shared/keyboard/keymap-load.helpers';
import { BRIDGE_BACKUP_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { KEYMAP_BACKUP_GROUP_NAME } from './backup-import-section.constants';
import { classifyImportPhase, describeImportOutcome } from './backup-import-section.helpers';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../shared/contracts/backup.types';
import type { BackupImportSource } from './backup-import-section.types';

/**
 * Owns the backup import run: it is the only file in this feature that calls
 * into the backup runtime source for import, through one bridge mutation per
 * step (preview, confirm). Guards against firing a second
 * preview or a second confirm while one is already in flight, and against
 * confirming before a preview exists. A confirm whose imported groups name
 * `keyboard_keymap` also reloads the live keyboard store (design D2), so a
 * restored keymap resolves through the running dispatcher, the `?` overlay,
 * and the Settings → Shortcuts panel with no restart.
 */
export function useBackupImport(source: BackupImportSource = BRIDGE_BACKUP_SOURCE) {
  // 1. Refs

  // 2. State
  const [preview, setPreview] = useState<BackupImportPreviewDTO | null>(null);
  const [result, setResult] = useState<BackupImportResultDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const previewMutation = useBridgeMutation({
    mutationFn: () => source.previewBackupImport(),
    onSuccess: (dto: BackupImportPreviewDTO) => {
      setPreview(dto.cancelled ? null : dto);
    },
    onError: (error: unknown) => {
      setPreview(null);
      setErrorMessage(describeImportOutcome(null, error));
    },
  });
  const confirmMutation = useBridgeMutation({
    mutationFn: (bundleChecksum: string) => source.confirmBackupImport(bundleChecksum),
    onSuccess: (dto: BackupImportResultDTO) => {
      setResult(dto);
      setErrorMessage(dto.errorMessage === '' ? null : dto.errorMessage);
      if (dto.importedGroups.some((group) => group.name === KEYMAP_BACKUP_GROUP_NAME)) {
        void loadKeymapOverrides();
      }
    },
    onError: (error: unknown) => {
      setErrorMessage(describeImportOutcome(null, error));
    },
  });

  // 5. Derived State (useMemo)
  const isPreviewing = previewMutation.isPending;
  const isApplying = confirmMutation.isPending;
  const phase = useMemo(
    () => classifyImportPhase({ isPreviewing, isApplying, preview, result, errorMessage }),
    [isPreviewing, isApplying, preview, result, errorMessage],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const { mutate: previewMutate } = previewMutation;
  const { mutate: confirmMutate } = confirmMutation;
  const onPreview = useCallback(() => {
    if (isPreviewing || isApplying) {
      return;
    }

    setErrorMessage(null);
    setResult(null);
    previewMutate();
  }, [isPreviewing, isApplying, previewMutate]);

  const onConfirm = useCallback(() => {
    if (preview === null || isApplying || isPreviewing) {
      return;
    }

    setErrorMessage(null);
    confirmMutate(preview.bundleChecksum);
  }, [preview, isApplying, isPreviewing, confirmMutate]);

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
