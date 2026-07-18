import { useCallback, useState } from 'react';
import type { ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { resolveAnimeEditorFeedbackMessage, toEditorErrorMessage } from './anime-editor-workspace.helpers';
import type { UseAnimeEditorScheduleOptions } from './anime-editor-workspace.types';

/** Owns schedule-modal loading, whole-draft apply, refreshed authority, and feedback. */
export function useAnimeEditorSchedule(options: Readonly<UseAnimeEditorScheduleOptions>) {
  // 1. Refs
  const source = options.source;

  // 2. State
  const [scheduleBoard, setScheduleBoard] = useState<Awaited<ReturnType<typeof options.source.getAnimeEditorScheduleBoard>>['board']>();
  const [scheduleFeedback, setScheduleFeedback] = useState<string>();
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const openSchedule = useCallback(async () => {
    if (options.selectedAnimeId === undefined) return;
    setScheduleFeedback(undefined);
    try {
      const result = await source.getAnimeEditorScheduleBoard(options.selectedAnimeId);
      setScheduleBoard(result.board);
      setScheduleFeedback(result.outcome === 'error' ? resolveAnimeEditorFeedbackMessage(result, 'The schedule board could not be loaded.') : undefined);
      setIsScheduleModalOpen(result.board !== undefined);
    } catch (error) {
      setScheduleFeedback(toEditorErrorMessage(error));
    }
  }, [options.selectedAnimeId, source]);
  const onCloseSchedule = useCallback(() => setIsScheduleModalOpen(false), []);
  const onApplySchedule = useCallback(async (entries: readonly ApplyAnimeScheduleDraftEntry[]) => {
    setIsApplyingSchedule(true);
    setScheduleFeedback(undefined);
    try {
      const result = await source.applyAnimeEditorSchedule({ boardModifiedAt: scheduleBoard?.boardModifiedAt ?? 0, entries });
      if (result.board !== undefined) setScheduleBoard(result.board);
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

  return { scheduleBoard, scheduleFeedback, isScheduleModalOpen, isApplyingSchedule, openSchedule, onCloseSchedule, onApplySchedule };
}
