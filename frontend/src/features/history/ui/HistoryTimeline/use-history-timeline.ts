import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import { groupEntriesByDay } from '../../../../shared/watch-history/watch-history.helpers';
import type { HistoryTimelineState } from './history-timeline.types';

/**
 * Drives HistoryTimeline: accumulates keyset pages of the global watch-history
 * log by cursor and groups the accumulated rows by local calendar day (Anime
 * History spec, "Episode Timeline Is Grouped By Day"). Fetches the first page
 * on mount and exposes `fetchNextPage` for a later slice to wire to scroll
 * (design D5a) -- deliberately does NOT use `useProgressiveListWindow`: the
 * server page IS the batch, so a client-side render-limit window would only
 * fight the accumulated page state.
 */
export function useHistoryTimeline(source: BridgeRuntimeSource = bridgeRuntimeSource): HistoryTimelineState {
  // 1. Refs
  const nextCursorRef = useRef<string | undefined>(undefined);

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const fetchPage = useCallback(
    async (cursor: string) => {
      const result = await source.getWatchHistoryPage?.(cursor);

      if (result === undefined || result.status !== 'ok') {
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      setEntries((current) => (cursor === '' ? result.items : [...current, ...result.items]));
      nextCursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== undefined);
      setIsLoading(false);
    },
    [source],
  );

  // 5. Derived State (useMemo)
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchNextPage = useCallback(() => {
    if (hasMore && nextCursorRef.current !== undefined) {
      void fetchPage(nextCursorRef.current);
    }
  }, [fetchPage, hasMore]);

  // 7. Effects
  useEffect(() => {
    void fetchPage('');
  }, [fetchPage]);

  return { groups, isLoading, hasMore, fetchNextPage };
}
