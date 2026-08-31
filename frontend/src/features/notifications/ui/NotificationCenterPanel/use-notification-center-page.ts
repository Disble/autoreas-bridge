import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationListRequest, NotificationRow } from '../../../../shared/contracts/notification-center.types';

/** Master-list page size requested per fetch (mirrors the store's own `defaultListLimit`). */
const NOTIFICATION_CENTER_PAGE_LIMIT = 25;

/** Which archive view the caller currently has selected. */
export type NotificationCenterSyncView = 'active' | 'archived';

/**
 * The empty set both facet filters default to. It is a module constant rather
 * than an inline `[]` because it feeds a `useCallback` dependency list: a
 * fresh literal on every render would rebuild `fetchPage` and re-fetch the
 * first page forever.
 */
export const NO_FACET_FILTER: readonly string[] = [];

/** The filters one page request is built from, independent of where in the keyset the cursor sits. */
interface NotificationPageFilters {
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  readonly search: string;
  readonly levels: readonly string[];
  readonly sources: readonly string[];
}

/** Everything `useNotificationCenterPage` needs to build the query it pages through. */
export interface NotificationCenterPageInput {
  readonly source: NotificationCenterSource;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
  readonly search: string;
  readonly levels: readonly string[];
  readonly sources: readonly string[];
}

/** The paged master-list state `useNotificationCenterPage` owns. */
export interface NotificationCenterPageResult {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly totalEverRecorded: number;
  readonly degraded: boolean;
  readonly onLoadMore: () => void;
  /** Re-fetches the first page from scratch -- used after a bulk mutation (mark read / archive) commits. */
  readonly refetch: () => void;
  /** Re-reads the first page under the current filters and merges it in, leaving the cursor where it was. */
  readonly refreshTopPage: () => void;
  /**
   * Rewrites the accumulated rows with a pure transition. It is how the live
   * layer above edits what is on screen without a round trip -- dropping the
   * records an archive event named, stamping a read state the detail pane
   * committed -- while every fetch concern stays in here.
   */
  readonly transformRows: (transition: (current: readonly NotificationRow[]) => readonly NotificationRow[]) => void;
}

/**
 * Builds one keyset page request for the filters currently applied. Shared
 * by the paginating fetch and the live refresh so the two can never drift
 * into asking the backend different questions.
 */
function toNotificationPageRequest(filters: Readonly<NotificationPageFilters>, cursor: string): NotificationListRequest {
  return {
    view: filters.view,
    unreadOnly: filters.unreadOnly,
    search: filters.search,
    sources: filters.sources,
    levels: filters.levels,
    cursor,
    limit: NOTIFICATION_CENTER_PAGE_LIMIT,
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
 * Owns the notification master list's keyset-cursor pagination and nothing
 * else: the initial page fetch, its reload when the view/unread/search
 * filters change, the scroll-near-bottom trigger `useNotificationCenterPanel`
 * raises -- guarded so a second near-bottom signal while a fetch is already in
 * flight, or one that arrives after the backend reported no further cursor,
 * never issues a second request (design.md §9.2, task 3a.2.4) -- and the
 * top-of-list refresh a live event asks for.
 *
 * That guard prevents CONCURRENT fetches and nothing more, which is why the
 * trigger above it MUST be a user gesture. It never stopped the removed
 * `Table.LoadMore` sentinel from asking again the instant the appended page
 * changed the collection.
 *
 * It knows nothing about runtime events. `useNotificationCenterSync` composes
 * this hook with those subscriptions; the two were one hook until the second
 * subscription pushed it past the complexity gate, which was the gate naming
 * a seam that was already there.
 *
 * `refreshTopPage` deliberately leaves the cursor and `hasNextPage`
 * untouched. They describe how far the user has paged, and a top-of-list
 * refresh does not move that boundary -- overwriting the cursor with page
 * one's would make the next near-bottom trigger re-fetch a page already on
 * screen. It also sets no loading flag and takes no in-flight guard: it is a
 * background refresh the user did not ask for, so it must neither blank the
 * table nor interfere with the near-bottom pagination guard.
 */
export function useNotificationCenterPage(input: Readonly<NotificationCenterPageInput>): NotificationCenterPageResult {
  const { source, view, unreadOnly, search, levels, sources } = input;

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
        .listNotifications(toNotificationPageRequest({ view, unreadOnly, search, levels, sources }, cursor))
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
    [source, unreadOnly, view, search, levels, sources],
  );

  const refreshTopPage = useCallback(() => {
    void source.listNotifications(toNotificationPageRequest({ view, unreadOnly, search, levels, sources }, '')).then((page) => {
      setRows((current) => mergeRefreshedRows(page.items, current));
      setTotalEverRecorded(page.totalEver);
      setDegraded(page.degraded);
    });
  }, [source, unreadOnly, view, search, levels, sources]);

  const onLoadMore = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage) {
      return;
    }
    void fetchPage(cursorRef.current, 'append');
  }, [fetchPage, hasNextPage]);

  const refetch = useCallback(() => {
    void fetchPage('', 'replace');
  }, [fetchPage]);

  const transformRows = useCallback((transition: (current: readonly NotificationRow[]) => readonly NotificationRow[]) => {
    setRows(transition);
  }, []);

  // 7. Effects
  useEffect(() => {
    void fetchPage('', 'replace');
  }, [fetchPage]);

  return { degraded, hasNextPage, isLoading, onLoadMore, refetch, refreshTopPage, rows, totalEverRecorded, transformRows };
}
