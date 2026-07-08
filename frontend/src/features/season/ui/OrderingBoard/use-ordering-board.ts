import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApplyScheduleResult, OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { EMPTY_ORDERING_BOARD, ORDERING_AUTOSAVE_DEBOUNCE_MS } from './ordering-board.constants';
import {
  cardCount,
  countChanges,
  decodeSortableId,
  duplicate as applyDuplicate,
  initialWorkingState,
  locationFor,
  moveClone as applyMoveClone,
  removeCard as applyRemoveCard,
  serializeDraft,
} from './ordering-board.helpers';
import type { SortableData, WorkingState } from './ordering-board.types';

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
  const [activeId, setActiveId] = useState<string | null>(null);

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
  // Total cards per anime (rail + all days) — the delete guard disables removing the last one.
  const cardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const card of [...state.rail, ...Object.values(state.columns).flat()]) {
      seen.add(card.animeId);
    }
    for (const animeId of seen) {
      counts[animeId] = cardCount(state, animeId);
    }
    return counts;
  }, [state]);
  const readOnly = board.appliedAt !== undefined;
  // The card under the pointer during a drag — rendered in the DragOverlay for a clean preview.
  const activeCard = useMemo(() => {
    if (activeId === null) {
      return null;
    }
    const { animeId } = decodeSortableId(activeId);
    return [...state.rail, ...Object.values(state.columns).flat()].find((c) => c.animeId === animeId) ?? null;
  }, [activeId, state]);

  // 6. Callbacks
  const load = useCallback(async () => {
    const loaded = await source.getOrderingBoard();
    setBoard(loaded);
    setState(initialWorkingState(loaded));
  }, [source]);

  const moveClone = useCallback((animeId: string, source: string, target: string, index: number) => {
    setState((current) => applyMoveClone(current, animeId, source, target, index));
  }, []);
  // dnd-kit drop → moveClone. The dragged card's id encodes its source container; the
  // drop target is either a sortable card (its container + index) or an empty column /
  // rail droppable (append). Drag sets both day and order.
  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);
  const onDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over === null) {
      return;
    }
    const { animeId, location: source } = decodeSortableId(String(active.id));
    const overSortable = (over.data.current as SortableData | undefined)?.sortable;
    const target = overSortable === undefined ? locationFor(String(over.id)) : locationFor(overSortable.containerId);
    const index = overSortable === undefined ? Number.MAX_SAFE_INTEGER : overSortable.index;
    setState((current) => applyMoveClone(current, animeId, source, target, index));
  }, []);
  const duplicate = useCallback((animeId: string) => {
    setState((current) => applyDuplicate(current, animeId));
  }, []);
  const removeCard = useCallback((animeId: string, location: string) => {
    setState((current) => applyRemoveCard(current, animeId, location));
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
    cardCounts,
    readOnly,
    activeCard,
    moveClone,
    onDragStart,
    onDragEnd,
    duplicate,
    removeCard,
    onApply,
    onReset,
    onReopen,
    onCloseSeason,
  };
}
