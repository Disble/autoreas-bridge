import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApplyScheduleResult, OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { EMPTY_ORDERING_BOARD, ORDERING_AUTOSAVE_DEBOUNCE_MS } from './ordering-board.constants';
import {
  countChanges,
  initialWorkingState,
  moveToDay as applyMoveToDay,
  moveWithinDay as applyMoveWithinDay,
  returnToRail as applyReturnToRail,
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

  // 5. Derived State (useMemo)
  const changeCount = useMemo(() => countChanges(board, state.columns, state.rail), [board, state]);
  const readOnly = board.appliedAt !== undefined;

  // 6. Callbacks
  const load = useCallback(async () => {
    const loaded = await source.getOrderingBoard();
    setBoard(loaded);
    setState(initialWorkingState(loaded));
  }, [source]);

  const moveToDay = useCallback((animeId: string, day: string) => {
    setState((current) => applyMoveToDay(current, animeId, day));
  }, []);
  const moveWithinDay = useCallback((animeId: string, direction: 'up' | 'down') => {
    setState((current) => applyMoveWithinDay(current, animeId, direction));
  }, []);
  const returnToRail = useCallback((animeId: string) => {
    setState((current) => applyReturnToRail(current, animeId));
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
    readOnly,
    moveToDay,
    moveWithinDay,
    returnToRail,
    onApply,
    onReset,
    onReopen,
  };
}
