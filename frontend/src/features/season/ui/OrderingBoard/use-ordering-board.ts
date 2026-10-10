import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useEffect } from 'react';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { ApplyScheduleResult, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS, ORDERING_DUPLICATE_WEEKDAY_ERROR } from './ordering-board.constants';
import {
  applyOrder,
  duplicate as applyDuplicate,
  hasDuplicateWeekdayPlacements,
  removeCard as applyRemoveCard,
  serializeDraft,
  shouldCancelForbiddenWeekdayHover,
} from './ordering-board.helpers';
import { useOrderingBoardDerived } from './use-ordering-board-derived';
import { useOrderingBoardDesktopActions } from './use-ordering-board-desktop-actions';
import { useOrderingBoardLoad } from './use-ordering-board-load';
import { useOrderingBoardStoreBindings } from './use-ordering-board-store-bindings';

/**
 * useOrderingBoard drives the weekday scheduling board on @dnd-kit/react: it loads the
 * board into an editable working state (per-container instance keys), reshuffles it live
 * as cards are dragged via the `move` helper (rejecting a second copy on one day),
 * exposes Duplicate/Delete, and autosaves the draft (debounced). Apply saves + reconciles
 * the schedule; Reopen makes an applied board editable again. All derivation is pure.
 */
export function useOrderingBoard(source: SeasonSource = seasonSource) {
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
  const { meta, rail, columns, counts, changeCount, scheduledCount, hasInvalidWeekdayPlacements } =
    useOrderingBoardDerived({ board, state, seasonAnimes });
  const desktopActions = useOrderingBoardDesktopActions();

  // 5. Derived State
  // A past season (viewed from history) locks the board just like an applied one.
  const readOnly = typeof board.appliedAt === 'number' || isPastSeason;

  // 6. Callbacks
  // Live reshuffle while dragging: block forbidden same-anime weekday hovers first, then
  // let `move` project valid targets; applyOrder remains the invariant backstop.
  const onDragOver = useCallback((event: DragOverEvent) => {
    if (shouldCancelForbiddenWeekdayHover(state, event)) {
      event.preventDefault();
      return;
    }
    setState((current) => applyOrder(current, move(current.order as Record<string, string[]>, event)));
  }, [state, setState]);
  // Stryker disable ArrayDeclaration: these deps arrays are mutation-equivalent to `[]`: both
  // closures capture only the stable `useState` setter from use-ordering-board-load.ts plus their
  // own argument via functional updates, and `[setState]` never changes because the setter
  // identity is stable, so it behaves exactly like `[]` and no test can observe the difference.
  const duplicate = useCallback((animeId: string) => {
    setState((current) => applyDuplicate(current, animeId));
  }, [setState]);
  const removeCard = useCallback((key: string) => {
    setState((current) => applyRemoveCard(current, key));
  }, [setState]);
  // Stryker restore ArrayDeclaration
  const onApply = useCallback(async (): Promise<ApplyScheduleResult> => {
    if (hasDuplicateWeekdayPlacements(state)) {
      return { status: ORDERING_DUPLICATE_WEEKDAY_ERROR, applied: 0, failed: [] };
    }
    await source.saveOrderingDraft(serializeDraft(state));
    const result = await source.applySchedule();
    await load();
    return result;
  }, [source, state, load]);
  const onReset = useCallback(() => {
    void load();
  }, [load]);
  const onReopen = useCallback(async () => {
    await source.reopenOrdering();
    await load();
  }, [source, load]);
  const onCloseSeason = useCallback(() => {
    void closeSeason(source);
  }, [closeSeason, source]);

  // 7. Effects
  // Grade + desktop actions come from the season selection rows; load them once.
  useEffect(() => {
    void ensureAnimesLoaded(source);
  }, [ensureAnimesLoaded, source]);

  // Debounced autosave of the working draft (skipped while applied/read-only).
  useEffect(() => {
    if (readOnly || hasInvalidWeekdayPlacements) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void source.saveOrderingDraft(serializeDraft(state));
    }, ORDERING_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, source, readOnly, hasInvalidWeekdayPlacements]);

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
    ...desktopActions,
  };
}
