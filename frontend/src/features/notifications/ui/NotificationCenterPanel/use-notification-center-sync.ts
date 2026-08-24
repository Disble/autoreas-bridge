import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import { notificationSource } from '../../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationListRequest, NotificationRow } from '../../../../shared/contracts/notification-center.types';

/** Master-list page size requested per fetch (mirrors the store's own `defaultListLimit`). */
const NOTIFICATION_CENTER_SYNC_PAGE_LIMIT = 25;

/** Which archive view the caller currently has selected. */
export type NotificationCenterSyncView = 'active' | 'archived';

/** Everything `useNotificationCenterSync` needs from its caller. */
export interface NotificationCenterSyncInput {
  readonly source: NotificationCenterSource;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  /** Debounced free-text search (Slice 3b's filter bar); defaults to no filter for callers that predate it. */
  readonly search?: string;
  /** Runtime push stream the list live-refreshes from; defaults to the runtime-backed singleton. */
  readonly pushSource?: NotificationSource;
}

/** The accumulated master-list state `useNotificationCenterSync` exposes. */
export interface NotificationCenterSyncResult {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly totalEverRecorded: number;
  readonly degraded: boolean;
  readonly onLoadMore: () => void;
  /** Re-fetches the first page from scratch -- used after a bulk mutation (mark read / archive) commits. */
  readonly refetch: () => void;
}

/**
 * Builds one keyset page request for the filters currently applied. Shared
 * by the paginating fetch and the live refresh so the two can never drift
 * into asking the backend different questions.
 */
function toNotificationPageRequest(
  view: NotificationCenterSyncView,
  unreadOnly: boolean,
  search: string,
  cursor: string,
): NotificationListRequest {
  return {
    view,
    unreadOnly,
    search,
    sources: [],
    levels: [],
    cursor,
    limit: NOTIFICATION_CENTER_SYNC_PAGE_LIMIT,
  };
}

/**
 * Merges a freshly refreshed first page on top of the rows already
 * accumulated, de-duplicated by record id. Rows arrive newest-first, so the
 * refreshed page is the newest slice and leads; every accumulated row it
 * does not already carry keeps its place behind it.
 *
 * Merging rather than replacing is the whole point: a user who has paged
 * three times must not be thrown back to one page because a notification
 * arrived. De-duplicating by id is the other half -- the push that triggers
 * this refresh races the fetch, so the refreshed page usually already
 * contains the very record that announced itself.
 */
function mergeRefreshedRows(
  refreshed: readonly NotificationRow[],
  accumulated: readonly NotificationRow[],
): readonly NotificationRow[] {
  const refreshedIds = new Set(refreshed.map((row) => row.id));
  return [...refreshed, ...accumulated.filter((row) => !refreshedIds.has(row.id))];
}

/**
 * Owns the notification master list's keyset-cursor pagination: the initial
 * page fetch, its reload when the view/unread/search filters change, and
 * the `Table.LoadMore` near-bottom trigger -- guarded so a second near-bottom
 * signal while a fetch is already in flight, or one that arrives after the
 * backend reported no further cursor, never issues a second request
 * (design.md §9.2, task 3a.2.4).
 *
 * It also subscribes to the `notification.push` runtime event the rail badge
 * already listens to, so a record that arrives while the panel is open shows
 * up without a remount. The pushed payload is deliberately NOT appended: it
 * is a `Notification`, carrying no persisted record id, and a list keyed by
 * id cannot hold it. The subscription instead re-reads the first page under
 * the current filters and merges it in, which is also what keeps the
 * backend's own ordering and read state authoritative.
 *
 * That live refresh deliberately leaves the cursor and `hasNextPage`
 * untouched. They describe how far the user has paged, and a top-of-list
 * refresh does not move that boundary -- overwriting the cursor with page
 * one's would make the next near-bottom trigger re-fetch a page already on
 * screen.
 */
export function useNotificationCenterSync(input: Readonly<NotificationCenterSyncInput>): NotificationCenterSyncResult {
  const { source, view, unreadOnly, search = '', pushSource = notificationSource } = input;

  // 1. Refs
  const isFetchingRef = useRef(false);
  const cursorRef = useRef('');

  // 2. State
  const [rows, setRows] = useState<readonly NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalEverRecorded, setTotalEverRecorded] = useState(0);
  const [degraded, setDegraded] = useState(false);

  // 6. Callbacks (useCallback calling pure helpers)
  const fetchPage = useCallback(
    (cursor: string, mode: 'replace' | 'append') => {
      isFetchingRef.current = true;
      setIsLoading(true);

      return source
        .listNotifications(toNotificationPageRequest(view, unreadOnly, search, cursor))
        .then((page) => {
          setRows((current) => (mode === 'replace' ? page.items : [...current, ...page.items]));
          cursorRef.current = page.nextCursor ?? '';
          setHasNextPage(Boolean(page.nextCursor));
          setTotalEverRecorded(page.totalEver);
          setDegraded(page.degraded);
          setIsLoading(false);
          isFetchingRef.current = false;
        });
    },
    [source, unreadOnly, view, search],
  );

  const refreshLiveRows = useCallback(() => {
    // No loading flag and no in-flight guard on purpose: this is a
    // background refresh the user did not ask for, so it must neither blank
    // the table nor interfere with the near-bottom pagination guard.
    void source.listNotifications(toNotificationPageRequest(view, unreadOnly, search, '')).then((page) => {
      setRows((current) => mergeRefreshedRows(page.items, current));
      setTotalEverRecorded(page.totalEver);
      setDegraded(page.degraded);
    });
  }, [source, unreadOnly, view, search]);

  const onLoadMore = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage) {
      return;
    }
    void fetchPage(cursorRef.current, 'append');
  }, [fetchPage, hasNextPage]);

  const refetch = useCallback(() => {
    void fetchPage('', 'replace');
  }, [fetchPage]);

  // 7. Effects
  useEffect(() => {
    void fetchPage('', 'replace');
  }, [fetchPage]);

  useEffect(() => {
    return pushSource.subscribe(refreshLiveRows);
  }, [pushSource, refreshLiveRows]);

  return { degraded, hasNextPage, isLoading, onLoadMore, refetch, rows, totalEverRecorded };
}
