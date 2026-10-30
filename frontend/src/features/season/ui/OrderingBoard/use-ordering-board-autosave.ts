import { useEffect } from 'react';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS } from './ordering-board.constants';
import { serializeDraft } from './ordering-board.helpers';
import type { OrderingBoardAutosaveParams } from './ordering-board.types';

/**
 * Autosaves the working draft (debounced) once the user edited it. A loaded, or
 * still loading, board is never written back over the saved draft, and a
 * read-only or invalid board is never saved at all.
 */
export function useOrderingBoardAutosave({ source, state, hasEdits, readOnly, hasInvalidWeekdayPlacements }: Readonly<OrderingBoardAutosaveParams>): void {
  // 7. Effects
  useEffect(() => {
    if (!hasEdits || readOnly || hasInvalidWeekdayPlacements) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void source.saveOrderingDraft(serializeDraft(state));
    }, ORDERING_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, source, hasEdits, readOnly, hasInvalidWeekdayPlacements]);
}
