import { useCallback, useMemo, useState } from 'react';
import type { AnimeEditorScheduleBoard, ApplyAnimeScheduleDraftCommand, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { animeEditorKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toAnimeEditorBoardQueryLoad, toAnimeScheduleSavedPlacements, toAnimeScheduleWeekView } from '../AnimeScheduleCard/anime-schedule-card.helpers';
import { resolveAnimeEditorFeedbackMessage, toEditorErrorMessage } from './anime-editor-workspace.helpers';
import type { UseAnimeEditorScheduleOptions } from './anime-editor-workspace.types';

/**
 * Owns the editor schedule board: its read through the anime module whenever
 * the selected anime changes (the Schedule card's week strip, S16), its reload
 * after an anime save, the schedule modal, the whole-draft apply and its
 * feedback. While the module starts the week strip stays loading.
 */
export function useAnimeEditorSchedule(options: Readonly<UseAnimeEditorScheduleOptions>) {
  // 1. Refs
  const source = options.source;
  const selectedAnimeId = options.selectedAnimeId;

  // 2. State
  // The board an apply answered, stamped with the read it supersedes.
  const [appliedBoard, setAppliedBoard] = useState<{ readonly read: number; readonly board: AnimeEditorScheduleBoard }>();
  const [scheduleFeedback, setScheduleFeedback] = useState<string>();
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);
  // A save's board reload shows the week strip loading until the read settles.
  const [isReloadingBoard, setIsReloadingBoard] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const boardQuery = useBridgeQuery({
    queryKey: animeEditorKeys.key('schedule-board', selectedAnimeId),
    queryFn: () => source.getAnimeEditorScheduleBoard(selectedAnimeId ?? ''),
    module: 'anime',
    enabled: selectedAnimeId !== undefined,
    gcTime: 0,
  });
  const applyMutation = useBridgeMutation({ mutationFn: (command: ApplyAnimeScheduleDraftCommand) => source.applyAnimeEditorSchedule(command) });
  const applySchedule = applyMutation.mutateAsync;

  // 5. Derived State (useMemo)
  const { data, dataUpdatedAt, error, isPlaceholderData, refetch, status } = boardQuery;
  const boardLoad = useMemo(() => toAnimeEditorBoardQueryLoad({
    isSelected: selectedAnimeId !== undefined,
    status: isReloadingBoard ? 'pending' : status,
    isPlaceholderData,
    data,
    errorMessage: status === 'error' ? toEditorErrorMessage(error) : undefined,
    appliedBoard: appliedBoard?.read === dataUpdatedAt ? appliedBoard.board : undefined,
  }), [appliedBoard, data, dataUpdatedAt, error, isPlaceholderData, isReloadingBoard, selectedAnimeId, status]);
  const scheduleBoard = boardLoad.board;
  const savedPlacements = useMemo(() => toAnimeScheduleSavedPlacements(options.selectedRecord, selectedAnimeId), [options.selectedRecord, selectedAnimeId]);
  const scheduleWeek = useMemo(() => toAnimeScheduleWeekView(boardLoad, selectedAnimeId, savedPlacements), [boardLoad, savedPlacements, selectedAnimeId]);

  // 6. Callbacks (useCallback calling pure helpers)
  /** Reads the board again for the selected anime, after an anime save changed it. */
  const reloadBoard = useCallback(async () => {
    if (selectedAnimeId === undefined) return;
    setIsReloadingBoard(true);
    try {
      await refetch();
    } finally {
      setIsReloadingBoard(false);
    }
  }, [refetch, selectedAnimeId]);
  const openSchedule = useCallback(async () => {
    if (selectedAnimeId === undefined) return;
    setScheduleFeedback(undefined);
    const read = await refetch();
    if (read.status === 'error') {
      setScheduleFeedback(toEditorErrorMessage(read.error));
      return;
    }
    const result = read.data;
    setScheduleFeedback(result?.outcome === 'error' ? resolveAnimeEditorFeedbackMessage(result, 'The schedule board could not be loaded.') : undefined);
    setIsScheduleModalOpen(result?.board !== undefined);
  }, [refetch, selectedAnimeId]);
  const onCloseSchedule = useCallback(() => setIsScheduleModalOpen(false), []);
  const onApplySchedule = useCallback(async (entries: readonly ApplyAnimeScheduleDraftEntry[]) => {
    setIsApplyingSchedule(true);
    setScheduleFeedback(undefined);
    try {
      const result = await applySchedule({ boardModifiedAt: scheduleBoard?.boardModifiedAt ?? 0, entries });
      if (result.board !== undefined) {
        // An applied board is the new authority, so the week strip follows it at once.
        setAppliedBoard({ read: dataUpdatedAt, board: result.board });
      }
      if (result.outcome === 'applied' || result.outcome === 'no_op') {
        setScheduleFeedback(undefined);
      } else {
        setScheduleFeedback(resolveAnimeEditorFeedbackMessage(result, 'No schedule changes were applied.'));
      }
      return result;
    } catch (applyError) {
      // A failed apply drops the dragged draft: the stored board is read again, then the failure shows.
      await refetch();
      setScheduleFeedback(toEditorErrorMessage(applyError));
      return undefined;
    } finally {
      setIsApplyingSchedule(false);
    }
  }, [applySchedule, dataUpdatedAt, refetch, scheduleBoard?.boardModifiedAt]);

  // 7. Effects

  return { scheduleBoard, scheduleWeek, scheduleFeedback, isScheduleModalOpen, isApplyingSchedule, openSchedule, reloadBoard, onCloseSchedule, onApplySchedule };
}
