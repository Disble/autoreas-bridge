import { useMemo } from 'react';
import { RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import {
  buildOrderingCardMeta,
  cardCounts,
  countChanges,
  hasDuplicateWeekdayPlacements,
  instancesIn,
  scheduledCount as computeScheduled,
} from './ordering-board.helpers';
import type { OrderingBoardDerived, OrderingBoardDerivedParams } from './ordering-board.types';

/**
 * Derives the ordering board's render model (card metadata, rail, weekday columns,
 * counts, change and scheduled totals, weekday validity) from its working state.
 * Every derivation is memoized on the inputs it reads.
 * @returns The memoized render model.
 */
export function useOrderingBoardDerived({ board, state, seasonAnimes }: Readonly<OrderingBoardDerivedParams>): OrderingBoardDerived {
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

  return { meta, rail, columns, counts, changeCount, scheduledCount, hasInvalidWeekdayPlacements };
}
