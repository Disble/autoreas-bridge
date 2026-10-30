import { useMemo } from 'react';
import { RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import {
  buildOrderingCardMeta,
  cardCounts,
  countChanges,
  hasDuplicateWeekdayPlacements,
  instancesIn,
  orderingAnimeIds,
  scheduledCount as computeScheduled,
} from './ordering-board.helpers';
import type { OrderingBoardDerived, OrderingBoardDerivedParams } from './ordering-board.types';

/**
 * Derives the ordering board's render model (card metadata, anime ids, rail, weekday columns,
 * counts, change and scheduled totals, weekday validity) from its working state.
 * Every derivation is memoized on the inputs it reads.
 * @returns The memoized render model.
 */
export function useOrderingBoardDerived({ board, state, seasonAnimes }: Readonly<OrderingBoardDerivedParams>): OrderingBoardDerived {
  // 5. Derived State (useMemo)
  const meta = useMemo(() => buildOrderingCardMeta(seasonAnimes), [seasonAnimes]);
  // Keyed on the loaded board, not the working state: a drag never adds an anime,
  // so the cover lookups are planned once per load.
  const animeIds = useMemo(() => orderingAnimeIds(board), [board]);
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

  return { meta, animeIds, rail, columns, counts, changeCount, scheduledCount, hasInvalidWeekdayPlacements };
}
