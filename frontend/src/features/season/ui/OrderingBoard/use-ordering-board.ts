import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApplyScheduleResult, OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { EMPTY_ORDERING_BOARD, ORDERING_AUTOSAVE_DEBOUNCE_MS } from './ordering-board.constants';
import {
  addToDay as applyAddToDay,
  countChanges,
  initialWorkingState,
  moveClone as applyMoveClone,
  moveWithinDay as applyMoveWithinDay,
  removeFromDay as applyRemoveFromDay,
  serializeDraft,
} from './ordering-board.helpers';
import type { WorkingState } from './ordering-board.types';

/**
 * useOrderingBoard drives the weekday scheduling board: it loads the board, keeps
 * an editable working state (rail + week columns), exposes the ⋯-menu moves, and
 * autosaves the draft (debounced). Apply saves + reconciles the schedule; Reopen
 * makes an applied board editable again. All derivation is pure (helpers).
 */
export function useOrderingBoard(source: SeasonSource = seasonSource) {
  // 2. State
  const [board, setBoard] = useState<OrderingBoard>(EMPTY_ORDERING_BOARD);
  const [state, setState] = useState<WorkingState>({ rail: [], columns: {} });

  // 3. Context/3rd Party Hooks
  const closeSeason = useSeasonStore((store) => store.closeSeason);

  // 5. Derived State (useMemo)
  const changeCount = useMemo(() => countChanges(board, state.columns, state.rail), [board, state]);
  // Distinct animes on weekdays (a multi-day anime is counted once, not per clone).
  const scheduledCount = useMemo(() => {
    const ids = new Set<string>();
    for (const column of Object.values(state.columns)) {
      for (const card of column) {
        ids.add(card.animeId);
      }
    }
    return ids.size;
  }, [state]);
  const readOnly = board.appliedAt !== undefined;

  // 6. Callbacks
  const load = useCallback(async () => {
    const loaded = await source.getOrderingBoard();
    setBoard(loaded);
    setState(initialWorkingState(loaded));
  }, [source]);

  const addToDay = useCallback((animeId: string, day: string) => {
    setState((current) => applyAddToDay(current, animeId, day, Number.MAX_SAFE_INTEGER));
  }, []);
  const moveClone = useCallback((animeId: string, sourceDay: string, targetDay: string, index: number) => {
    setState((current) => applyMoveClone(current, animeId, sourceDay, targetDay, index));
  }, []);
  const moveWithinDay = useCallback((animeId: string, day: string, direction: 'up' | 'down') => {
    setState((current) => applyMoveWithinDay(current, animeId, day, direction));
  }, []);
  const removeFromDay = useCallback((animeId: string, day: string) => {
    setState((current) => applyRemoveFromDay(current, animeId, day));
  }, []);
  const onApply = useCallback(async (): Promise<ApplyScheduleResult> => {
    await source.saveOrderingDraft(serializeDraft(state.columns, state.rail));
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
      void source.saveOrderingDraft(serializeDraft(state.columns, state.rail));
    }, ORDERING_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, source, readOnly]);

  return {
    rail: state.rail,
    columns: state.columns,
    changeCount,
    scheduledCount,
    readOnly,
    addToDay,
    moveClone,
    moveWithinDay,
    removeFromDay,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
  };
}
