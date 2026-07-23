import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { ApplyScheduleResult, OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { runDesktopAction } from '../SelectionBoard/selection-board.helpers';
import {
  EMPTY_ORDERING_BOARD,
  ORDERING_AUTOSAVE_DEBOUNCE_MS,
  ORDERING_DUPLICATE_WEEKDAY_ERROR,
  RAIL_CONTAINER_ID,
  WEEKDAYS,
} from './ordering-board.constants';
import {
  applyOrder,
  buildOrderingCardMeta,
  cardCounts,
  countChanges,
  duplicate as applyDuplicate,
  hasDuplicateWeekdayPlacements,
  initialWorkingState,
  instancesIn,
  removeCard as applyRemoveCard,
  scheduledCount as computeScheduled,
  serializeDraft,
  shouldCancelForbiddenWeekdayHover,
} from './ordering-board.helpers';
import type { WorkingState } from './ordering-board.types';

/**
 * useOrderingBoard drives the weekday scheduling board on @dnd-kit/react: it loads the
 * board into an editable working state (per-container instance keys), reshuffles it live
 * as cards are dragged via the `move` helper (rejecting a second copy on one day),
 * exposes Duplicate/Delete, and autosaves the draft (debounced). Apply saves + reconciles
 * the schedule; Reopen makes an applied board editable again. All derivation is pure.
 */
export function useOrderingBoard(source: SeasonSource = seasonSource) {
  // 2. State
  const [board, setBoard] = useState<OrderingBoard>(EMPTY_ORDERING_BOARD);
  const [state, setState] = useState<WorkingState>({ order: {}, instances: {} });

  // 3. Context/3rd Party Hooks
  const closeSeason = useSeasonStore((store) => store.closeSeason);
  const isPastSeason = useSeasonStore((store) => store.readOnly);
  const seasonAnimes = useSeasonStore((store) => store.seasonAnimes);
  const ensureAnimesLoaded = useSeasonStore((store) => store.ensureAnimesLoaded);

  // 5. Derived State (useMemo)
  const meta = useMemo(() => buildOrderingCardMeta(seasonAnimes), [seasonAnimes]);
  const rail = useMemo(() => instancesIn(state, RAIL_CONTAINER_ID), [state]);
  const columns = useMemo(() => {
    const grouped: Record<string, ReturnType<typeof instancesIn>> = {};
    for (const day of WEEKDAYS) {
      grouped[day] = instancesIn(state, day);
    }
    return grouped;
  }, [state]);
  const counts = useMemo(() => cardCounts(state), [state]);
  const changeCount = useMemo(() => countChanges(board, state), [board, state]);
  const scheduledCount = useMemo(() => computeScheduled(state), [state]);
  const hasInvalidWeekdayPlacements = useMemo(() => hasDuplicateWeekdayPlacements(state), [state]);
  // A past season (viewed from history) locks the board just like an applied one.
  const readOnly = typeof board.appliedAt === 'number' || isPastSeason;

  // 6. Callbacks
  const load = useCallback(async () => {
    const loaded = await source.getOrderingBoard();
    setBoard(loaded);
    setState(initialWorkingState(loaded));
  }, [source]);

  // Live reshuffle while dragging: block forbidden same-anime weekday hovers first, then
  // let `move` project valid targets; applyOrder remains the invariant backstop.
  const onDragOver = useCallback((event: DragOverEvent) => {
    if (shouldCancelForbiddenWeekdayHover(state, event)) {
      event.preventDefault();
      return;
    }
    setState((current) => applyOrder(current, move(current.order as Record<string, string[]>, event)));
  }, [state]);
  const duplicate = useCallback((animeId: string) => {
    setState((current) => applyDuplicate(current, animeId));
  }, []);
  const removeCard = useCallback((key: string) => {
    setState((current) => applyRemoveCard(current, key));
  }, []);
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
  const onOpenPage = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.openAnimePage, animeId), []);
  const onCopyPage = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.copyAnimePage, animeId, 'Page URL copied to clipboard'), []);
  const onOpenFolder = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.openAnimeFolder, animeId), []);
  const onCopyFolder = useCallback((animeId: string) => void runDesktopAction(bridgeRuntimeSource.copyAnimeFolder, animeId, 'Folder path copied to clipboard'), []);

  // 7. Effects
  useEffect(() => {
    void load();
  }, [load]);

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
    onDragOver,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
    onOpenPage,
    onCopyPage,
    onOpenFolder,
    onCopyFolder,
  };
}
