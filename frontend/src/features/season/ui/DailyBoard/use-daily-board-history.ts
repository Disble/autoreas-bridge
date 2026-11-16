import { useMemo } from 'react';
import type { SeasonSource } from '../../../../shared/contracts/season.types';
import { useSeasonOrderingSnapshot } from '../../../../shared/season/use-season-ordering-snapshot';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { toDailyBoardHistory } from './daily-board-history.helpers';
import type { DailyBoardHistory } from './daily-board.types';

/**
 * Reads the Daily board a closed season stored at close through the shared
 * closure snapshot query of the season the store is viewing. An open season
 * (no viewed season) is `live` and reads nothing. Another season's read never
 * shows here: the history is `loading` until the viewed season's own read
 * settles.
 *
 * @param source The season port the closure snapshot is read through.
 * @returns Where the Daily board read stands.
 */
export function useDailyBoardHistory(source: SeasonSource): DailyBoardHistory {
  // 3. Context/3rd Party Hooks
  const viewSeasonId = useSeasonStore((state) => state.viewSeasonId);

  // 4. Queries/Mutations
  const snapshot = useSeasonOrderingSnapshot(viewSeasonId, source);

  // 5. Derived State
  const canRead = source.fetchSeasonOrderingSnapshot !== undefined;
  return useMemo(() => toDailyBoardHistory(viewSeasonId, canRead, snapshot), [viewSeasonId, canRead, snapshot]);
}
