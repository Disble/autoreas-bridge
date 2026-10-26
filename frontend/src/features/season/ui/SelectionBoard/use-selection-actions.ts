import { toast } from '@heroui/react';
import { useCallback } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { ConfirmSelectionResult, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { SELECTION_CONFIRM_ERROR_MESSAGE } from './selection-board.constants';
import { formatConfirmSuccess, runDesktopAction } from './selection-board.helpers';

/**
 * useSelectionActions owns every write the board can trigger: a consideration
 * edit, the reconciliation with its success/danger toast, and the four desktop
 * actions (open/copy page, open/copy folder). Every call goes through the season
 * store or the runtime bridge; nothing here derives or filters the view.
 *
 * @param source The season port the store writes through.
 * @returns The consideration and confirm handlers plus the four desktop actions.
 */
export function useSelectionActions(source: SeasonSource) {
  // 3. Context/3rd Party Hooks
  const setConsideration = useSeasonStore((state) => state.setConsideration);
  const confirmSelection = useSeasonStore((state) => state.confirmSelection);

  // 6. Callbacks
  const onSetConsideration = useCallback(
    (rowId: string, consideration: string) => void setConsideration(source, rowId, consideration),
    [setConsideration, source],
  );
  const onConfirm = useCallback(async (): Promise<ConfirmSelectionResult> => {
    const result = await confirmSelection(source);
    if (result.status === 'ok') {
      toast.success(formatConfirmSuccess(result.approved, result.rejected));
    } else {
      toast.danger(result.status || SELECTION_CONFIRM_ERROR_MESSAGE);
    }
    return result;
  }, [confirmSelection, source]);
  const onOpenPage = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.openAnimePage, animeId), []);
  const onCopyPage = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.copyAnimePage, animeId, 'Page URL copied to clipboard'), []);
  const onOpenFolder = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.openAnimeFolder, animeId), []);
  const onCopyFolder = useCallback((animeId: string) => runDesktopAction(bridgeRuntimeSource.copyAnimeFolder, animeId, 'Folder path copied to clipboard'), []);

  return { onSetConsideration, onConfirm, onOpenPage, onCopyPage, onOpenFolder, onCopyFolder };
}
