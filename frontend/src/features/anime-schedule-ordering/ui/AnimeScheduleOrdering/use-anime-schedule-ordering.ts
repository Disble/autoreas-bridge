import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyAnimeScheduleOrder,
  countAnimeScheduleChanges,
  createAnimeScheduleApplyEntries,
  createAnimeScheduleOrderingState,
  duplicateAnimeScheduleCard,
  getInstancesInDestination,
  moveAnimeScheduleCard,
  removeAnimeScheduleCard,
  shouldBlockDuplicateHover,
  validateAnimeScheduleDraft,
} from './anime-schedule-ordering.helpers';
import type { AnimeScheduleOrderingProps, AnimeScheduleOrderingState, AnimeScheduleOrderingViewModel } from './anime-schedule-ordering.types';

/**
 * Owns the shared anime schedule draft, drag projection, validation, reset, and
 * changed-record-only apply payload generation for the editor schedule modal.
 */
export function useAnimeScheduleOrdering(props: Readonly<AnimeScheduleOrderingProps>): AnimeScheduleOrderingViewModel {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<AnimeScheduleOrderingState>(() => createAnimeScheduleOrderingState(props.board));

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const validationMessage = useMemo(() => validateAnimeScheduleDraft(state), [state]);
  const changeCount = useMemo(() => countAnimeScheduleChanges(props.board, state), [props.board, state]);
  const columns = useMemo(() => props.board.destinations.map((destination) => ({
    ...destination,
    cards: getInstancesInDestination(state, destination.id),
  })), [props.board.destinations, state]);
  const weekdayColumns = useMemo(() => columns.filter((column) => column.kind === 'weekday'), [columns]);
  const specialColumns = useMemo(() => columns.filter((column) => column.kind === 'special'), [columns]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onDragOver = useCallback((event: DragOverEvent) => {
    if (shouldBlockDuplicateHover(state, event)) {
      event.preventDefault();
      return;
    }
    setState((current) => applyAnimeScheduleOrder(current, move(current.order as Record<string, string[]>, event)));
  }, [state]);
  const onDuplicate = useCallback((animeId: string) => {
    setState((current) => duplicateAnimeScheduleCard(current, animeId));
  }, []);
  const onRemove = useCallback((key: string) => {
    setState((current) => removeAnimeScheduleCard(current, key));
  }, []);
  const onReset = useCallback(() => {
    setState(createAnimeScheduleOrderingState(props.board));
  }, [props.board]);
  const onApply = useCallback(async () => {
    if (validationMessage !== undefined) {
      return;
    }
    await props.onApply(createAnimeScheduleApplyEntries(props.board, state));
  }, [props, state, validationMessage]);
  const canRemove = useCallback((animeId: string) => Object.values(state.instances).filter((instance) => instance.animeId === animeId).length > 1, [state.instances]);
  const getOverlayName = useCallback((id: string | number) => state.instances[String(id)]?.name ?? '', [state.instances]);

  // 7. Effects
  useEffect(() => {
    setState(createAnimeScheduleOrderingState(props.board));
  }, [props.board]);
  useEffect(() => {
    const testDriverRef = props.testDriverRef;
    if (testDriverRef === undefined) {
      return undefined;
    }
    testDriverRef.current = {
      moveAnime(command) {
        setState((current) => moveAnimeScheduleCard(current, command));
      },
    };
    return () => {
      testDriverRef.current = undefined;
    };
  }, [props.testDriverRef]);
  useEffect(() => {
    Array.from(document.querySelectorAll<HTMLElement>('[data-origin-anime]'))
      .find((element) => element.dataset.originAnime === props.board.originAnimeId)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [props.board.originAnimeId]);

  return {
    columns,
    weekdayColumns,
    specialColumns,
    changeCount,
    validationMessage,
    onDragOver,
    onDuplicate,
    onRemove,
    onReset,
    onApply,
    canRemove,
    getOverlayName,
  };
}
