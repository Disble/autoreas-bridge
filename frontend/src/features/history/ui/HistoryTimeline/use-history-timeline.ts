import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import type { WatchHistoryEntry, WatchHistoryOrder, WatchHistoryPageRequest } from '../../../../shared/contracts/anime.types';
import { groupEntriesByDay } from '../../../../shared/watch-history/watch-history.helpers';
import type { HistoryTimelineState } from './history-timeline.types';

/**
 * Builds the page request this unit sends, varying only by `order` and
 * `cursor` -- Search, Status/Type, and the watched range are wired in later
 * units (design D10 Unit 4 scope guard).
 */
function buildPageRequest(order: WatchHistoryOrder, cursor: string): WatchHistoryPageRequest {
  return { search: '', animeIds: [], watchedFromMs: 0, watchedToMs: 0, order, cursor, limit: 0 };
}

/**
 * Identifies one logical request independent of its cursor (design D6): the
 * JSON of the request with an empty cursor. Two calls with the same key page
 * the SAME request, so accumulated rows survive; a changed key means the
 * request itself changed and the accumulated rows must be discarded.
 */
function buildRequestKey(order: WatchHistoryOrder): string {
  return JSON.stringify(buildPageRequest(order, ''));
}

/**
 * Drives HistoryTimeline: accumulates keyset pages of the global watch-history
 * log by cursor and groups the accumulated rows by local calendar day (Anime
 * History spec, "Episode Timeline Is Grouped By Day"). Fetches the first page
 * on mount and again whenever `order` changes; `onScroll` fetches the next
 * page on a near-bottom scroll (design D5a) -- deliberately does NOT use
 * `useProgressiveListWindow`: the server page IS the batch, so a client-side
 * render-limit window would only fight the accumulated page state.
 *
 * A change to `order` changes the request key (design D6): the accumulated
 * rows are cleared, `isLoading` is set, and a fresh generation is minted so a
 * response from a now-superseded request is dropped rather than appended to
 * the new one. A first-page failure surfaces as `error` (design D9); a
 * later-page failure only stops further paging, so it never erases rows
 * already on screen. `fetchNextPage` is guarded against a scroll burst
 * re-firing before the in-flight page resolves, which would otherwise fetch
 * the same cursor twice and duplicate rows.
 */
export function useHistoryTimeline(
  order: WatchHistoryOrder = 'newest',
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryTimelineState {
  // 1. Refs
  const nextCursorRef = useRef<string | undefined>(undefined);
  /** Guards `fetchNextPage` against a scroll burst re-firing before the in-flight page resolves. */
  const isFetchingRef = useRef(false);
  /** Bumped whenever the request key changes; a page response is applied only while its own generation is still current (design D6). */
  const generationRef = useRef(0);

  // 2. State
  const [entries, setEntries] = useState<readonly WatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const fetchPage = useCallback(
    async (cursor: string, generation: number) => {
      isFetchingRef.current = true;
      const result = await source.getWatchHistoryPage?.(buildPageRequest(order, cursor));

      if (generation !== generationRef.current) {
        // A newer request superseded this one while it was in flight; drop it.
        isFetchingRef.current = false;
        return;
      }

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
    [source, order],
  );

  // 5. Derived State (useMemo)
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);
  const requestKey = useMemo(() => buildRequestKey(order), [order]);

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMore || nextCursorRef.current === undefined) {
      return;
    }

    void fetchPage(nextCursorRef.current, generationRef.current);
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
    generationRef.current += 1;
    const generation = generationRef.current;

    nextCursorRef.current = undefined;
    setEntries([]);
    setIsLoading(true);
    setHasMore(false);
    setError(undefined);
    void fetchPage('', generation);
    // `fetchPage` is intentionally NOT listed: it also changes identity when
    // only `source` is swapped (a test-only concern), which must not, by
    // itself, reset an unrelated request. `requestKey` -- the JSON of the
    // request without its cursor (design D6) -- is the one true trigger.
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [requestKey]);

  return { groups, isLoading, hasMore, error, fetchNextPage, onScroll };
}
