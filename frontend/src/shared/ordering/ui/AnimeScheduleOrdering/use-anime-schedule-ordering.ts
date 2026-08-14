import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useMemo, useState } from 'react';
import {
  applyOrdering,
  duplicateOrderingCard,
  removeOrderingCard,
  shouldBlockDuplicateHover,
} from '../../ordering.helpers';
import { buildInitialAnimeScheduleOrderingState } from './anime-schedule-ordering.helpers';
import type { AnimeScheduleOrderingProps, AnimeScheduleOrderingState, AnimeScheduleOrderingViewModel } from './anime-schedule-ordering.types';
import { countAnimeScheduleChanges, createAnimeScheduleApplyEntries, partitionCreateSubmit, validateAnimeScheduleDraft } from './anime-schedule-payload.helpers';
import { useAnimeScheduleColumns } from './use-anime-schedule-columns';
import { useAnimeScheduleDraftSync } from './use-anime-schedule-draft-sync';

/**
 * Owns the shared anime schedule draft, drag projection, validation, reset, and
 * changed-record-only apply payload generation for the editor schedule modal.
 *
 * Column projection and prop synchronization live in their own hooks. They were
 * split out on 2026-08-14 because this function held 19 hook calls in one body
 * and breached the complexity gate; the three groups never shared anything but
 * the draft state and its setter.
 */
export function useAnimeScheduleOrdering(props: Readonly<AnimeScheduleOrderingProps>): AnimeScheduleOrderingViewModel {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<AnimeScheduleOrderingState>(() => buildInitialAnimeScheduleOrderingState(props));

  // 3. Context/3rd Party Hooks
  const { columns, weekdayColumns, specialColumns, stagingCards, stagedAnimeCount } = useAnimeScheduleColumns(props.board, state);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const validationMessage = useMemo(() => validateAnimeScheduleDraft(state), [state]);
  const changeCount = useMemo(() => countAnimeScheduleChanges(props.board, state), [props.board, state]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onDragOver = useCallback((event: DragOverEvent) => {
    if (shouldBlockDuplicateHover(state, event)) {
      event.preventDefault();
      return;
    }
    setState((current) => applyOrdering(current, move(current.order as Record<string, string[]>, event)));
  }, [state]);
  const onDuplicate = useCallback((animeId: string) => {
    setState((current) => duplicateOrderingCard(current, animeId));
  }, []);
  const onRemove = useCallback((key: string) => {
    setState((current) => removeOrderingCard(current, key));
  }, []);
  const onReset = useCallback(() => {
    setState(buildInitialAnimeScheduleOrderingState(props));
  }, [props]);
  const onApply = useCallback(async () => {
    if (validationMessage !== undefined) {
      return;
    }
    if (props.onApplyCreateSubmit !== undefined) {
      await props.onApplyCreateSubmit(partitionCreateSubmit(props.board, state));
      return;
    }
    await props.onApply?.(createAnimeScheduleApplyEntries(props.board, state));
  }, [props, state, validationMessage]);
  const canRemove = useCallback((animeId: string) => Object.values(state.instances).filter((instance) => instance.animeId === animeId).length > 1, [state.instances]);
  const getOverlayName = useCallback((id: string | number) => state.instances[String(id)]?.name ?? '', [state.instances]);

  // 7. Effects
  useAnimeScheduleDraftSync(props, setState);

  return {
    columns,
    weekdayColumns,
    specialColumns,
    stagingCards,
    stagedAnimeCount,
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
