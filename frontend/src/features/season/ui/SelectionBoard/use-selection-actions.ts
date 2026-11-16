import { toast } from '@heroui/react';
import { useCallback } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { ConfirmSelectionResult } from '../../../../shared/contracts/season.types';
import { SELECTION_CONFIRM_ERROR_MESSAGE } from './selection-board.constants';
import { formatConfirmSuccess, runDesktopAction } from './selection-board.helpers';
import type { SelectionCommandHandlers } from './selection-board.types';

/**
 * useSelectionActions turns the board's season commands into what the UI calls:
 * a consideration edit, the reconciliation with its success/danger toast, and
 * the four desktop actions (open/copy page, open/copy folder). The commands
 * themselves, and the season reads they refresh, belong to `useSelectionMutations`;
 * nothing here derives or filters the view.
 *
 * @param commands The consideration and confirmation commands.
 * @returns The consideration and confirm handlers plus the four desktop actions.
 */
export function useSelectionActions({ setConsideration, confirmSelection }: SelectionCommandHandlers) {
  // 6. Callbacks
  const onSetConsideration = useCallback(
    (rowId: string, consideration: string) => void setConsideration(rowId, consideration),
    [setConsideration],
  );
  const onConfirm = useCallback(async (): Promise<ConfirmSelectionResult> => {
    const result = await confirmSelection();
    if (result.status === 'ok') {
      toast.success(formatConfirmSuccess(result.approved, result.rejected));
    } else {
      toast.danger(result.status || SELECTION_CONFIRM_ERROR_MESSAGE);
    }
    return result;
  }, [confirmSelection]);
  const onOpenPage = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.openAnimePage, animeId), []);
  const onCopyPage = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.copyAnimePage, animeId, 'Page URL copied to clipboard'), []);
  const onOpenFolder = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.openAnimeFolder, animeId), []);
  const onCopyFolder = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.copyAnimeFolder, animeId, 'Folder path copied to clipboard'), []);

  return { onSetConsideration, onConfirm, onOpenPage, onCopyPage, onOpenFolder, onCopyFolder };
}
