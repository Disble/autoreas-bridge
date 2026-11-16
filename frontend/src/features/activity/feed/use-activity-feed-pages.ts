import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityFeedQuery } from '../../../shared/contracts/activity-feed.types';
import type { ActivityFeedSource } from '../../../shared/contracts/activity.types';
import { isNearListBottom } from '../../../shared/helpers/progressive-list.helpers';
import { activityKeys } from '../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../shared/query/use-bridge-query/use-bridge-query';
import { shouldLoadOlderFeedPage, toActivityFeedPageStatus } from './activity-feed-query.helpers';
import { mergeFeedDays, toShownFeedPage } from './activity-feed-rows.helpers';
import type { ActivityFeedWindow } from './activity-feed.types';

/**
 * Owns the feed's paged reads for one query: the first page through
 * `useBridgeQuery` on the `observability` module, read again whenever the
 * query changes and on a live refresh; older pages read through the cursor
 * once the page nears its bottom (the feed flows with the page, so the
 * document is what scrolls), kept below a refreshed first page without
 * shrinking the loaded window (ADR-012, live variant). An older page read
 * under an older query is dropped when it resolves. A failed older page or
 * live refresh keeps the rows on screen.
 *
 * @param source The feed port.
 * @param query The first-page query, or undefined to read nothing (no type selected).
 * @returns The request status, the loaded days, the paging state and the callbacks.
 */
export function useActivityFeedPages(source: ActivityFeedSource, query: ActivityFeedQuery | undefined) {
  // 1. Refs
  const queryRef = useRef(query);
  const loadingMoreRef = useRef<ActivityFeedQuery | undefined>(undefined);

  // 2. State
  const [olderWindow, setOlderWindow] = useState<ActivityFeedWindow | undefined>();
  const [loadingMoreFor, setLoadingMoreFor] = useState<ActivityFeedQuery | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const firstPage = useBridgeQuery({
    queryKey: activityKeys.key('feed', query),
    queryFn: () => (query === undefined ? Promise.resolve({ days: [], nextCursor: '' }) : source.searchFeed(query)),
    module: 'observability',
    enabled: query !== undefined,
  });

  // 5. Derived State (useMemo)
  const isLoadingMore = query !== undefined && loadingMoreFor === query;
  const shown = toShownFeedPage(query === undefined ? undefined : firstPage.data, firstPage.dataUpdatedAt, olderWindow?.query === query ? olderWindow : undefined);
  const status = toActivityFeedPageStatus(query !== undefined, firstPage);

  // 6. Callbacks (useCallback calling pure helpers)
  const loadOlderPage = useCallback(
    (older: ActivityFeedQuery, firstPageAt: number, days: ActivityFeedWindow['days'], cursor: string) => {
      loadingMoreRef.current = older;
      setLoadingMoreFor(older);
      source
        .searchFeed({ ...older, cursor })
        .then((view) => {
          if (queryRef.current === older) {
            setOlderWindow({ query: older, firstPageAt, days: mergeFeedDays(days, view.days), cursor: view.nextCursor });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (loadingMoreRef.current === older) {
            loadingMoreRef.current = undefined;
            setLoadingMoreFor(undefined);
          }
        });
    },
    [source],
  );

  const { refetch } = firstPage;
  const refreshLive = useCallback(() => {
    if (query !== undefined) {
      void refetch();
    }
  }, [query, refetch]);

  const retry = useCallback(() => {
    setOlderWindow(undefined);
    void refetch();
  }, [refetch]);

  const onPageScroll = useCallback(() => {
    const isNearBottom = isNearListBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
    // A cursor exists only after a query read a page, so the query check never fails first.
    if (shouldLoadOlderFeedPage(shown.cursor, loadingMoreRef.current === query, isNearBottom) && query !== undefined) {
      loadOlderPage(query, firstPage.dataUpdatedAt, shown.days, shown.cursor);
    }
  }, [firstPage.dataUpdatedAt, loadOlderPage, query, shown.cursor, shown.days]);

  // 7. Effects
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    window.addEventListener('scroll', onPageScroll, { passive: true });
    return () => window.removeEventListener('scroll', onPageScroll);
  }, [onPageScroll]);

  return { status, days: shown.days, hasMore: shown.cursor !== '', isLoadingMore, refreshLive, retry };
}
