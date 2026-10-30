import { useCallback, useEffect } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { ApplyScheduleResult, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { ORDERING_DUPLICATE_WEEKDAY_ERROR, ORDERING_EMPTY_DRAFT } from './ordering-board.constants';
import { hasDuplicateWeekdayPlacements, serializeDraft } from './ordering-board.helpers';
import { useOrderingBoardDerived } from './use-ordering-board-derived';
import { useOrderingBoardAutosave } from './use-ordering-board-autosave';
import { useOrderingBoardEdits } from './use-ordering-board-edits';
import { useOrderingBoardDesktopActions } from './use-ordering-board-desktop-actions';
import { useOrderingBoardLoad } from './use-ordering-board-load';
import { useOrderingBoardStoreBindings } from './use-ordering-board-store-bindings';

/**
 * useOrderingBoard drives the weekday scheduling board on @dnd-kit/react: it loads the
 * board into an editable working state (per-container instance keys), reshuffles it live
 * as cards are dragged via the `move` helper (rejecting a second copy on one day),
 * exposes Duplicate/Delete, and autosaves the draft (debounced) once the user edits it; a
 * reload restores that draft. Apply saves + reconciles the schedule; Reset discards the
 * draft; Reopen makes an applied board editable again. All derivation is pure.
 * Covers resolve once per anime on the loaded board.
 *
 * @param source The season port the board reads and writes through.
 * @param coverSource The port each card's cover is resolved through.
 */
export function useOrderingBoard(source: SeasonSource = seasonSource, coverSource: SeasonCoverSource = bridgeRuntimeSource) {
  // 3. Context/3rd Party Hooks
  const {
    closeSeason,
    readOnly: isPastSeason,
    viewSeasonId,
    seasonAnimes,
    ensureAnimesLoaded,
    errorMessage,
  } = useOrderingBoardStoreBindings();
  const { board, state, setState, isHistoricalLoading, historicalRecorded, historicalError, load } = useOrderingBoardLoad({ source, viewSeasonId });
  const { meta, animeIds, rail, columns, counts, changeCount, scheduledCount, hasInvalidWeekdayPlacements } =
    useOrderingBoardDerived({ board, state, seasonAnimes });
  const { hasEdits, clearEdits, onDragOver, duplicate, removeCard } = useOrderingBoardEdits({ state, setState });
  const desktopActions = useOrderingBoardDesktopActions();
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  // 5. Derived State
  // A past season (viewed from history) locks the board just like an applied one.
  const readOnly = typeof board.appliedAt === 'number' || isPastSeason;

  // 6. Callbacks
  const onApply = useCallback(async (): Promise<ApplyScheduleResult> => {
    if (hasDuplicateWeekdayPlacements(state)) {
      return { status: ORDERING_DUPLICATE_WEEKDAY_ERROR, applied: 0, failed: [] };
    }
    await source.saveOrderingDraft(serializeDraft(state));
    const result = await source.applySchedule();
    clearEdits();
    await load();
    return result;
  }, [source, state, load, clearEdits]);
  // Reset clears the saved draft too, or the reload would restore the edits it discards.
  const onReset = useCallback(() => {
    clearEdits();
    void source.saveOrderingDraft(ORDERING_EMPTY_DRAFT).then(load);
  }, [source, load, clearEdits]);
  const onReopen = useCallback(async () => {
    await source.reopenOrdering();
    clearEdits();
    await load();
  }, [source, load, clearEdits]);
  const onCloseSeason = useCallback(() => {
    void closeSeason(source);
  }, [closeSeason, source]);

  // 7. Effects
  // Grade + desktop actions come from the season selection rows; load them once.
  useEffect(() => {
    void ensureAnimesLoaded(source);
  }, [ensureAnimesLoaded, source]);
  useOrderingBoardAutosave({ source, state, hasEdits, readOnly, hasInvalidWeekdayPlacements });

  return {
    rail,
    columns,
    meta,
    instances: state.instances,
    counts,
    changeCount,
    scheduledCount,
    hasInvalidWeekdayPlacements,
    readOnly,
    isPastSeason,
    isHistoricalLoading,
    historicalRecorded,
    historicalError,
    errorMessage,
    onDragOver,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
    getCoverThumb,
    ...desktopActions,
  };
}
