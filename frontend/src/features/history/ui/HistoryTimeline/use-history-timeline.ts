import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import type { AnimeSource } from '../../../../shared/contracts/anime-source.types';
import type { WatchHistoryEntry, WatchHistoryPageRequest } from '../../../../shared/contracts/anime.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { animeKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { groupEntriesByDay } from '../../../../shared/watch-history/watch-history.helpers';
import { toHistoryFirstPageRequest, toHistoryTimelineGroups, toHistoryTimelinePages } from './history-timeline.helpers';
import type { HistoryOlderPages, HistoryTimelineFilters, HistoryTimelineState } from './history-timeline.types';
import { useHistoryAnimeScope } from './use-history-anime-scope';

/**
 * Drives HistoryTimeline: reads keyset pages of the global watch-history log
 * and groups the shown rows by local calendar day (Anime History spec,
 * "Episode Timeline Is Grouped By Day"). The catalog resolves the active
 * Status/Type filter first (design D2): a scope of `'none'` renders the
 * filtered-empty state without spending a binding call. The first page is a
 * `useBridgeQuery` on the `anime` module, keyed by its request, so it stays
 * loading while the module starts and a filter change reads a new page
 * (design D6) while the previous rows never show for the new request. Older
 * pages load through the cursor on a near-bottom scroll (design D5a) and
 * belong to one request and one first-page load; a response for a superseded
 * request is dropped. The server page IS the batch, so no client-side
 * `useProgressiveListWindow` fights the paged rows.
 *
 * A first-page failure surfaces as `error` (design D9); a later-page failure
 * only stops further paging, so it never erases rows already on screen.
 * `fetchNextPage` is guarded against a scroll burst re-firing before the
 * in-flight page resolves, which would otherwise fetch the same cursor twice.
 *
 * @param filters The URL filters shaping the request.
 * @param source The anime port the catalog and pages are read through.
 * @returns The day groups, the paging state and the callbacks.
 */
export function useHistoryTimeline(filters: HistoryTimelineFilters, source: AnimeSource = BRIDGE_ANIME_SOURCE): HistoryTimelineState {
  // 1. Refs
  /** The request the latest render shows; an older page for another request is dropped. */
  const requestKeyRef = useRef<string | undefined>(undefined);
  /** The in-flight older-page read, so a scroll burst never fetches the same cursor twice. */
  const inFlightRef = useRef<object | undefined>(undefined);

  // 2. State
  const [older, setOlder] = useState<HistoryOlderPages | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  /** Catalog resolution gates the first page and supplies row status chips (design D2). */
  const { catalog, error: catalogError, scope } = useHistoryAnimeScope(filters.status, filters.type, source);

  // 4. Queries/Mutations
  const firstRequest = toHistoryFirstPageRequest(filters, scope);
  const firstPage = useBridgeQuery({
    queryKey: animeKeys.key('watch-history', firstRequest),
    queryFn: () => (firstRequest === undefined ? Promise.reject(new Error('no watch-history request')) : source.getWatchHistoryPage(firstRequest)),
    module: 'anime',
    enabled: firstRequest !== undefined,
  });

  // 5. Derived State (useMemo)
  const requestKey = firstRequest === undefined ? undefined : JSON.stringify(firstRequest);
  const pages = toHistoryTimelinePages({ catalogError, scope, firstPage, older, requestKey });
  const groups = useMemo(
    () => (catalog === undefined ? [] : toHistoryTimelineGroups(groupEntriesByDay(pages.entries), catalog)),
    [catalog, pages.entries],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const loadOlderPage = useCallback(
    (request: WatchHistoryPageRequest, key: string, firstPageAt: number, entries: readonly WatchHistoryEntry[], cursor: string) => {
      const read = {};
      inFlightRef.current = read;
      source
        .getWatchHistoryPage({ ...request, cursor })
        .then(
          (page) => ({ entries: [...entries, ...page.items], nextCursor: page.nextCursor }),
          () => ({ entries, nextCursor: undefined }),
        )
        .then((next) => {
          if (requestKeyRef.current === key) {
            setOlder({ requestKey: key, firstPageAt, ...next });
          }
        })
        .finally(() => {
          if (inFlightRef.current === read) {
            inFlightRef.current = undefined;
          }
        });
    },
    [source],
  );

  const fetchNextPage = useCallback(() => {
    if (inFlightRef.current !== undefined || pages.cursor === undefined || firstRequest === undefined || requestKey === undefined) {
      return;
    }

    loadOlderPage(firstRequest, requestKey, firstPage.dataUpdatedAt, pages.entries, pages.cursor);
  }, [firstPage.dataUpdatedAt, firstRequest, loadOlderPage, pages.cursor, pages.entries, requestKey]);

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
    requestKeyRef.current = requestKey;
  }, [requestKey]);

  return { groups, isLoading: pages.isLoading, hasMore: pages.cursor !== undefined, error: pages.error, fetchNextPage, onScroll };
}
