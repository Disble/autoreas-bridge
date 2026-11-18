import { toast } from '@heroui/react';
import { useCallback } from 'react';
import type { AnimeDesktopActionsSource } from '../../../../shared/contracts/anime-editor-source.types';
import type { ConfirmSelectionResult } from '../../../../shared/contracts/season.types';
import { useSeasonDesktopActions } from '../../desktop-actions/use-season-desktop-actions';
import { SELECTION_CONFIRM_ERROR_MESSAGE } from './selection-board.constants';
import { formatConfirmSuccess } from './selection-board.helpers';
import type { SelectionCommandHandlers } from './selection-board.types';

/**
 * useSelectionActions turns the board's season commands into what the UI calls:
 * a consideration edit, the reconciliation with its success/danger toast (a
 * rejected confirmation included, with the bridge's message), and the four
 * desktop actions (open/copy page, open/copy folder, `useSeasonDesktopActions`).
 * The commands themselves, and the season reads they refresh, belong to
 * `useSelectionMutations`; nothing here derives or filters the view.
 *
 * @param commands The consideration and confirmation commands.
 * @param desktopActionsSource The anime module's desktop-actions port.
 * @returns The consideration and confirm handlers plus the four desktop actions.
 */
export function useSelectionActions({ setConsideration, confirmSelection }: SelectionCommandHandlers, desktopActionsSource: AnimeDesktopActionsSource) {
  // 3. Context/3rd Party Hooks
  const desktopActions = useSeasonDesktopActions(desktopActionsSource);

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

  return { onSetConsideration, onConfirm, ...desktopActions };
}
