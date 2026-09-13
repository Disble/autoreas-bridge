import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import type { WatchHistoryEntry } from '../../../../shared/contracts/anime.types';
import { groupEntriesByDay } from '../../../../shared/watch-history/watch-history.helpers';
import type { HistoryTimelineState } from './history-timeline.types';

/**
 * Drives HistoryTimeline: accumulates keyset pages of the global watch-history
 * log by cursor and groups the accumulated rows by local calendar day (Anime
 * History spec, "Episode Timeline Is Grouped By Day"). Fetches the first page
 * on mount; `onScroll` fetches the next page on a near-bottom scroll (design
 * D5a) -- deliberately does NOT use `useProgressiveListWindow`: the server
 * page IS the batch, so a client-side render-limit window would only fight
 * the accumulated page state. A first-page failure surfaces as `error`
 * (design D9); a later-page failure only stops further paging, so it never
 * erases rows already on screen. `fetchNextPage` is guarded against a scroll
 * burst re-firing before the in-flight page resolves, which would otherwise
 * fetch the same cursor twice and duplicate rows.
 */
export function useHistoryTimeline(source: BridgeRuntimeSource = bridgeRuntimeSource): HistoryTimelineState {
  // 1. Refs
  const nextCursorRef = useRef<string | undefined>(undefined);
  /** Guards `fetchNextPage` against a scroll burst re-firing before the in-flight page resolves. */
  const isFetchingRef = useRef(false);

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const fetchPage = useCallback(
    async (cursor: string) => {
      isFetchingRef.current = true;
      const result = await source.getWatchHistoryPage?.({ search: '', animeIds: [], watchedFromMs: 0, watchedToMs: 0, order: 'newest', cursor, limit: 0 });
      const isFirstPage = cursor === '';

      if (result === undefined || result.status !== 'ok') {
        setHasMore(false);
        setIsLoading(false);
        if (isFirstPage) {
          setError(new Error(result?.message ?? 'Watch history request failed'));
        }
        isFetchingRef.current = false;
        return;
      }

      setEntries((current) => (isFirstPage ? result.items : [...current, ...result.items]));
      nextCursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== undefined);
      setIsLoading(false);
      if (isFirstPage) {
        setError(undefined);
      }
      isFetchingRef.current = false;
    },
    [source],
  );

  // 5. Derived State (useMemo)
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore || nextCursorRef.current === undefined) {
      return;
    }

    void fetchPage(nextCursorRef.current);
  }, [fetchPage, hasMore]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;

      if (!isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        return;
      }

      fetchNextPage();
    },
    [fetchNextPage],
  );

  // 7. Effects
  useEffect(() => {
    void fetchPage('');
  }, [fetchPage]);

  return { groups, isLoading, hasMore, error, fetchNextPage, onScroll };
}
