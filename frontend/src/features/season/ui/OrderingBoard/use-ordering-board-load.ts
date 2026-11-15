import { useCallback, useMemo, useState } from 'react';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { seasonKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { useSeasonOrderingSnapshot } from '../../../../shared/season/use-season-ordering-snapshot';
import { EMPTY_ORDERING_BOARD } from './ordering-board.constants';
import {
  fetchLiveOrderingBoard,
  toLiveOrderingError,
  toLoadedWorkingState,
  toOrderingBoardHistory,
  toStoredOrderingBoard,
} from './ordering-board.helpers';
import type { OrderingBoardLoadParams, OrderingBoardLoadResult, OrderingBoardSync, WorkingState } from './ordering-board.types';

/**
 * Loads the live schedule (with its saved draft restored), or one past season's
 * stored closure snapshot, into the board's editable working state. Both reads
 * run through `useBridgeQuery` on the season module; the live board keeps no
 * cache once unmounted, so every mount reads it fresh. A newly loaded board, and
 * every completed `load`, rebuilds the working state. A source that cannot read
 * the stored board is reported as a failure, never as a season that recorded
 * nothing, and a failed live read is reported, never shown as an empty board.
 * @returns The loaded board, working state and its setter, historical load flags and error, the live read error, and `load`.
 */
export function useOrderingBoardLoad({ source, viewSeasonId }: Readonly<OrderingBoardLoadParams>): OrderingBoardLoadResult {
  // 2. State
  const [synced, setSynced] = useState<OrderingBoardSync | null>(null);
  const [state, setState] = useState<WorkingState>({ order: {}, instances: {} });
  const [generation, setGeneration] = useState(0);

  // 4. Queries/Mutations
  const live = useBridgeQuery({
    queryKey: seasonKeys.key('ordering-board'),
    queryFn: () => fetchLiveOrderingBoard(source),
    module: 'season',
    enabled: viewSeasonId === null,
    gcTime: 0,
  });
  const snapshot = useSeasonOrderingSnapshot(viewSeasonId, source);

  // 5. Derived State
  const storedBoard = useMemo(() => (snapshot.kind === 'ready' ? toStoredOrderingBoard(snapshot.data) : null), [snapshot]);
  const loaded = viewSeasonId === null ? (live.data ?? null) : storedBoard;
  // `board` stays the applied schedule, the baseline changes are counted against;
  // only the editable state starts from the saved draft.
  if (loaded !== null && (loaded !== synced?.board || generation !== synced.generation)) {
    setSynced({ board: loaded, generation });
    setState(toLoadedWorkingState(viewSeasonId, loaded));
  }
  const history = toOrderingBoardHistory(viewSeasonId, source.fetchSeasonOrderingSnapshot !== undefined, snapshot);
  const liveError = toLiveOrderingError(viewSeasonId, toAsyncView(live));
  const isLiveLoading = viewSeasonId === null && live.status === 'pending';

  // 6. Callbacks
  const { refetch } = live;
  const load = useCallback(async () => {
    await refetch();
    setGeneration((current) => current + 1);
  }, [refetch]);

  return { board: synced?.board ?? EMPTY_ORDERING_BOARD, state, setState, ...history, isLiveLoading, liveError, load };
}
