import type { DragOverEvent } from '@dnd-kit/react';
import { move } from '@dnd-kit/helpers';
import { useCallback, useState } from 'react';
import {
  applyOrder,
  duplicate as applyDuplicate,
  removeCard as applyRemoveCard,
  shouldCancelForbiddenWeekdayHover,
} from './ordering-board.helpers';
import type { OrderingBoardEdits, OrderingBoardEditsParams } from './ordering-board.types';

/**
 * Owns the user's edits to the working state — the live drag reshuffle, Duplicate and
 * Remove — and whether any happened since the board last loaded. Only an edit arms
 * the autosave, so a loaded (or still loading) board is never written back over the
 * saved draft.
 * @returns The edit handlers, the edit flag, and `clearEdits` for a reload.
 */
export function useOrderingBoardEdits({ state, setState }: Readonly<OrderingBoardEditsParams>): OrderingBoardEdits {
  // 2. State
  const [hasEdits, setHasEdits] = useState(false);

  // 6. Callbacks
  // Live reshuffle while dragging: block forbidden same-anime weekday hovers first, then
  // let `move` project valid targets; applyOrder remains the invariant backstop.
  const onDragOver = useCallback((event: DragOverEvent) => {
    if (shouldCancelForbiddenWeekdayHover(state, event)) {
      event.preventDefault();
      return;
    }
    setState((current) => applyOrder(current, move(current.order as Record<string, string[]>, event)));
    setHasEdits(true);
  }, [state, setState]);
  // Stryker disable ArrayDeclaration: these deps arrays are mutation-equivalent to `[]`: the
  // closures capture only stable `useState` setters (use-ordering-board-load.ts and this hook's
  // own) plus their argument via functional updates, and `[setState]` never changes because the
  // setter identity is stable, so it behaves exactly like `[]` and no test can observe the difference.
  const duplicate = useCallback((animeId: string) => {
    setState((current) => applyDuplicate(current, animeId));
    setHasEdits(true);
  }, [setState]);
  const removeCard = useCallback((key: string) => {
    setState((current) => applyRemoveCard(current, key));
    setHasEdits(true);
  }, [setState]);
  const clearEdits = useCallback(() => {
    setHasEdits(false);
  }, []);
  // Stryker restore ArrayDeclaration

  return { hasEdits, clearEdits, onDragOver, duplicate, removeCard };
}
