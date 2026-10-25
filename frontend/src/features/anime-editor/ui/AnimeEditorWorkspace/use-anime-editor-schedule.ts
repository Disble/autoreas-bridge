import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { ANIME_SCHEDULE_BOARD_IDLE_LOAD } from '../AnimeScheduleCard/anime-schedule-card.constants';
import { toAnimeScheduleBoardLoad, toAnimeScheduleSavedPlacements, toAnimeScheduleWeekView } from '../AnimeScheduleCard/anime-schedule-card.helpers';
import type { AnimeScheduleBoardLoad } from '../AnimeScheduleCard/anime-schedule-card.types';
import { resolveAnimeEditorFeedbackMessage, toEditorErrorMessage } from './anime-editor-workspace.helpers';
import type { UseAnimeEditorScheduleOptions } from './anime-editor-workspace.types';

/**
 * Owns the editor schedule board: its eager read whenever the selected anime
 * changes (the Schedule card's week strip, S16), its reload after an anime
 * save, the schedule modal, the whole-draft apply and its feedback. Only the
 * latest read may settle the board.
 */
export function useAnimeEditorSchedule(options: Readonly<UseAnimeEditorScheduleOptions>) {
  // 1. Refs
  // The latest board read; only its answer may settle the board.
  const boardRead = useRef<object | undefined>(undefined);
  const source = options.source;
  const selectedAnimeId = options.selectedAnimeId;

  // 2. State
  const [boardLoad, setBoardLoad] = useState<AnimeScheduleBoardLoad>(ANIME_SCHEDULE_BOARD_IDLE_LOAD);
  const [scheduleFeedback, setScheduleFeedback] = useState<string>();
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const scheduleBoard = boardLoad.board;
  const savedPlacements = useMemo(() => toAnimeScheduleSavedPlacements(options.selectedRecord, selectedAnimeId), [options.selectedRecord, selectedAnimeId]);
  const scheduleWeek = useMemo(() => toAnimeScheduleWeekView(boardLoad, selectedAnimeId, savedPlacements), [boardLoad, savedPlacements, selectedAnimeId]);

  // 6. Callbacks (useCallback calling pure helpers)
  // Stryker disable ArrayDeclaration: equivalent: `source` is the module-level runtime source, or a
  // test fake, fixed for the hook's lifetime, so `[source]` and `[]` memoize the same callback.
  /**
   * Reads the board for `animeId` into the week strip; a failure shows in the
   * card. With no anime selected yet the strip stays idle: the selection never
   * returns to none once an anime is picked.
   */
  const loadBoard = useCallback(async (animeId: string | undefined) => {
    if (animeId === undefined) return;
    const read = {};
    boardRead.current = read;
    setBoardLoad({ status: 'loading' });
    try {
      const result = await source.getAnimeEditorScheduleBoard(animeId);
      if (boardRead.current === read) setBoardLoad(toAnimeScheduleBoardLoad(result));
    } catch (error) {
      if (boardRead.current === read) setBoardLoad({ status: 'failed', message: toEditorErrorMessage(error) });
    }
  }, [source]);
  // Stryker restore ArrayDeclaration
  /** Reads the board again for the selected anime, after an anime save changed it. */
  const reloadBoard = useCallback(() => loadBoard(selectedAnimeId), [loadBoard, selectedAnimeId]);
  const openSchedule = useCallback(async () => {
    if (selectedAnimeId === undefined) return;
    setScheduleFeedback(undefined);
    const read = {};
    boardRead.current = read;
    try {
      const result = await source.getAnimeEditorScheduleBoard(selectedAnimeId);
      if (boardRead.current === read) setBoardLoad(toAnimeScheduleBoardLoad(result));
      setScheduleFeedback(result.outcome === 'error' ? resolveAnimeEditorFeedbackMessage(result, 'The schedule board could not be loaded.') : undefined);
      setIsScheduleModalOpen(result.board !== undefined);
    } catch (error) {
      setScheduleFeedback(toEditorErrorMessage(error));
    }
  }, [selectedAnimeId, source]);
  const onCloseSchedule = useCallback(() => setIsScheduleModalOpen(false), []);
  const onApplySchedule = useCallback(async (entries: readonly ApplyAnimeScheduleDraftEntry[]) => {
    setIsApplyingSchedule(true);
    setScheduleFeedback(undefined);
    try {
      const result = await source.applyAnimeEditorSchedule({ boardModifiedAt: scheduleBoard?.boardModifiedAt ?? 0, entries });
      if (result.board !== undefined) {
        // An applied board is the new authority, so the week strip follows it at once.
        boardRead.current = {};
        setBoardLoad({ status: 'ready', board: result.board });
      }
      if (result.outcome === 'applied' || result.outcome === 'no_op') {
        setScheduleFeedback(undefined);
      } else {
        setScheduleFeedback(resolveAnimeEditorFeedbackMessage(result, 'No schedule changes were applied.'));
      }
      return result;
    } catch (error) {
      setScheduleFeedback(toEditorErrorMessage(error));
      return undefined;
    } finally {
      setIsApplyingSchedule(false);
    }
  }, [scheduleBoard?.boardModifiedAt, source]);

  // 7. Effects
  useEffect(() => {
    void loadBoard(selectedAnimeId);
  }, [loadBoard, selectedAnimeId]);

  return { scheduleBoard, scheduleWeek, scheduleFeedback, isScheduleModalOpen, isApplyingSchedule, openSchedule, reloadBoard, onCloseSchedule, onApplySchedule };
}
