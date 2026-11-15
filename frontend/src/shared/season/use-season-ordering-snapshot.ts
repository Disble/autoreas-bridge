import { useMemo } from 'react';
import type { SeasonOrderingSnapshot, SeasonSource } from '../contracts/season.types';
import { toAsyncView } from '../query/async-view/async-view.helpers';
import type { AsyncView } from '../query/async-view/async-view.types';
import { seasonKeys } from '../query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../query/use-bridge-query/use-bridge-query';

/**
 * Reads the board a closed season stored at close, one query per season under
 * `seasonKeys.key('ordering-snapshot', seasonId)`, so the ordering board, the
 * Daily board history and the Overview lineup share one read. Nothing is read
 * while no closed season is viewed or the source cannot read the snapshot; the
 * view stays `loading` then, and the caller decides what an unreadable source
 * means. While another season's read runs the view is `loading`, never the
 * previous season's board. The view keeps its identity until the read changes.
 *
 * @param seasonId The closed season being viewed, or null for the open one.
 * @param source The season port slice the snapshot is read through.
 * @returns The snapshot read as one async view.
 */
export function useSeasonOrderingSnapshot(
  seasonId: string | null,
  source: Pick<SeasonSource, 'fetchSeasonOrderingSnapshot'>,
): AsyncView<SeasonOrderingSnapshot> {
  // 4. Queries/Mutations
  const { status, data, error, isFetching, isPlaceholderData } = useBridgeQuery({
    queryKey: seasonKeys.key('ordering-snapshot', seasonId),
    // Runs only while `enabled` holds, which guarantees both values.
    queryFn: () => source.fetchSeasonOrderingSnapshot!(seasonId!),
    module: 'season',
    enabled: seasonId !== null && source.fetchSeasonOrderingSnapshot !== undefined,
  });

  // 5. Derived State
  return useMemo(
    () => (isPlaceholderData ? { kind: 'loading' } : toAsyncView({ status, data, error, isFetching })),
    [status, data, error, isFetching, isPlaceholderData],
  );
}
