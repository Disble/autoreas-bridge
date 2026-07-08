import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApplyScheduleResult, OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import {
  EMPTY_ORDERING_BOARD,
  ORDERING_AUTOSAVE_DEBOUNCE_MS,
  RAIL_CONTAINER_ID,
  WEEKDAYS,
} from './ordering-board.constants';
import {
  applyOrder,
  cardCounts,
  countChanges,
  duplicate as applyDuplicate,
  initialWorkingState,
  instancesIn,
  removeCard as applyRemoveCard,
  scheduledCount as computeScheduled,
  serializeDraft,
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

  // 5. Derived State (useMemo)
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
  const readOnly = board.appliedAt !== undefined;

  // 6. Callbacks
  const load = useCallback(async () => {
    const loaded = await source.getOrderingBoard();
    setBoard(loaded);
    setState(initialWorkingState(loaded));
  }, [source]);

  // Live reshuffle while dragging: `move` reorders the container map; applyOrder rejects
  // a drop that would place two clones of the same anime on one day.
  const onDragOver = useCallback((event: DragOverEvent) => {
    setState((current) => applyOrder(current, move(current.order as Record<string, string[]>, event)));
  }, []);
  const duplicate = useCallback((animeId: string) => {
    setState((current) => applyDuplicate(current, animeId));
  }, []);
  const removeCard = useCallback((key: string) => {
    setState((current) => applyRemoveCard(current, key));
  }, []);
  const onApply = useCallback(async (): Promise<ApplyScheduleResult> => {
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
  useEffect(() => {
    void load();
  }, [load]);

  // Debounced autosave of the working draft (skipped while applied/read-only).
  useEffect(() => {
    if (readOnly) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void source.saveOrderingDraft(serializeDraft(state));
    }, ORDERING_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, source, readOnly]);

  return {
    rail,
    columns,
    instances: state.instances,
    counts,
    changeCount,
    scheduledCount,
    readOnly,
    onDragOver,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
  };
}
