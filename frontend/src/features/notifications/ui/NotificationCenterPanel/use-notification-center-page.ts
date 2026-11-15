import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  NotificationCenterSource,
  NotificationListRequest,
  NotificationPage,
  NotificationRow,
} from '../../../../shared/contracts/notification-center.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import { notificationsKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';

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
  /**
   * Which state the first page is in: `loading` until it first answers (the
   * module is starting or the read is in flight), `failure` when it failed with
   * nothing to show, `ready` otherwise. A failed refresh keeps `ready` and the
   * rows on screen.
   */
  readonly listState: NotificationListState;
  readonly hasNextPage: boolean;
  readonly totalEverRecorded: number;
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

/** The state of the master list's first page, as the panel renders it. */
export type NotificationListState = 'loading' | 'failure' | 'ready';

/**
 * Every row on screen under one query: the first page they extend (by when it
 * answered), the rows and the cursor after the last. `resetPending` marks a
 * window a `refetch` asked to replace with the next first page.
 */
interface NotificationListWindow {
  readonly queryKey: string;
  readonly firstPageAt: number;
  readonly rows: readonly NotificationRow[];
  readonly cursor: string;
  readonly resetPending?: boolean;
}

/**
 * What the first-page query currently holds, as the window helpers read it.
 * `placeholder` marks the previous filters' page kept on screen while the
 * current filters' first page is read.
 */
interface NotificationFirstPage {
  readonly queryKey: string;
  readonly page: NotificationPage | undefined;
  readonly answeredAt: number;
  readonly placeholder: boolean;
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
 * The list state a first-page view resolves to: a failure with a page still
 * cached is a failed refresh, which keeps the rows on screen.
 * @param kind The first page's `toAsyncView` kind.
 * @param hasPage Whether a first page answered before.
 * @returns The list state.
 */
function toNotificationListState(kind: AsyncView<unknown>['kind'], hasPage: boolean): NotificationListState {
  if (kind === 'loading') {
    return 'loading';
  }
  return kind === 'failure' && !hasPage ? 'failure' : 'ready';
}

/**
 * Whether the window must be (re)built from the first page: none exists for
 * this query yet, or a `refetch` asked for one and a newer first page answered.
 * @param first What the first-page query holds.
 * @param loaded The window, if any.
 * @returns True when the window should be seeded from `first`.
 */
function needsNotificationWindowSeed(first: NotificationFirstPage, loaded: NotificationListWindow | undefined): boolean {
  if (first.page === undefined || first.placeholder) {
    return false;
  }
  if (loaded === undefined || loaded.queryKey !== first.queryKey) {
    return true;
  }
  return loaded.resetPending === true && loaded.firstPageAt !== first.answeredAt;
}

/**
 * The window a first page alone shows.
 * @param first What the first-page query holds.
 * @returns The window holding just that page.
 */
function seedNotificationWindow(first: NotificationFirstPage): NotificationListWindow {
  return { queryKey: first.queryKey, firstPageAt: first.answeredAt, rows: first.page?.items ?? [], cursor: first.page?.nextCursor ?? '' };
}

/**
 * The rows and cursor the list shows: the first page until a window is seeded
 * from it; then the window; and after a refresh answered a newer first page,
 * that page merged over the window without shrinking it.
 * @param first What the first-page query holds.
 * @param loaded The loaded window, if any.
 * @returns The rows and the cursor after the last one.
 */
function toShownNotificationRows(
  first: NotificationFirstPage,
  loaded: NotificationListWindow | undefined,
): { readonly rows: readonly NotificationRow[]; readonly cursor: string } {
  if (first.page === undefined) {
    return { rows: [], cursor: '' };
  }
  if (first.placeholder) {
    // The previous filters' rows, with no cursor: paging them under the
    // current filters would ask the backend a question nobody asked.
    return { rows: first.page.items, cursor: '' };
  }
  if (loaded === undefined || loaded.queryKey !== first.queryKey) {
    return { rows: first.page.items, cursor: first.page.nextCursor ?? '' };
  }
  if (loaded.firstPageAt === first.answeredAt) {
    return { rows: loaded.rows, cursor: loaded.cursor };
  }
  return { rows: mergeRefreshedRows(first.page.items, loaded.rows), cursor: loaded.cursor };
}

/**
 * Applies a row transition to what is shown, pinning the result as the window
 * over the current first page. Returns `loaded` by identity when the transition
 * moved nothing (or while the previous filters' page is a placeholder), so an
 * unchanged list does not re-render.
 * @param loaded The loaded window, if any.
 * @param first What the first-page query holds.
 * @param transition The pure row transition.
 * @returns The next window.
 */
function transformNotificationWindow(
  loaded: NotificationListWindow | undefined,
  first: NotificationFirstPage,
  transition: (current: readonly NotificationRow[]) => readonly NotificationRow[],
): NotificationListWindow | undefined {
  if (first.placeholder) {
    // The rows on screen belong to the previous filters; the page being read
    // already reflects whatever the transition would have applied.
    return loaded;
  }
  const shown = toShownNotificationRows(first, loaded);
  const rows = transition(shown.rows);
  if (rows === shown.rows) {
    return loaded;
  }
  return { queryKey: first.queryKey, firstPageAt: first.answeredAt, rows, cursor: shown.cursor, resetPending: loaded?.resetPending };
}

/**
 * Owns the notification master list's keyset-cursor pagination and nothing
 * else: the first page through `useBridgeQuery` on the `notifications` module
 * (read again when the view/unread/search/facet filters change, and on a
 * `notification.push` through `BRIDGE_INVALIDATIONS`), and the older pages the
 * scroll-near-bottom trigger `useNotificationCenterPanel` raises, read through
 * the cursor -- guarded so a second near-bottom signal while a fetch is already
 * in flight, or one that arrives after the backend reported no further cursor,
 * never issues a second request (design.md §9.2, task 3a.2.4).
 *
 * That guard prevents CONCURRENT fetches and nothing more, which is why the
 * trigger above it MUST be a user gesture. It never stopped the removed
 * `Table.LoadMore` sentinel from asking again the instant the appended page
 * changed the collection.
 *
 * It knows nothing about runtime events. `useNotificationCenterSync` composes
 * this hook with the archived-event subscription.
 *
 * A refreshed first page is merged over the pages already loaded, de-duplicated
 * by id, and leaves the cursor and `hasNextPage` untouched: they describe how
 * far the user has paged, and a top-of-list refresh does not move that
 * boundary. An older page read under an older query is dropped when it
 * resolves; a failed older page keeps the rows on screen.
 */
export function useNotificationCenterPage(input: Readonly<NotificationCenterPageInput>): NotificationCenterPageResult {
  const { source, view, unreadOnly, search, levels, sources } = input;

  // 1. Refs
  const isFetchingRef = useRef(false);
  const queryKeyRef = useRef('');
  const firstPageRef = useRef<NotificationFirstPage>({ queryKey: '', page: undefined, answeredAt: 0, placeholder: false });

  // 2. State
  const [loaded, setLoaded] = useState<NotificationListWindow | undefined>();

  // 4. Queries/Mutations
  const queryKey = notificationsKeys.key('list', view, unreadOnly, search, levels, sources);
  const firstPage = useBridgeQuery({
    queryKey,
    queryFn: () => source.listNotifications(toNotificationPageRequest({ view, unreadOnly, search, levels, sources }, '')),
    module: 'notifications',
  });

  // 5. Derived State
  const serializedKey = JSON.stringify(queryKey);
  const first: NotificationFirstPage = {
    queryKey: serializedKey,
    page: firstPage.data,
    answeredAt: firstPage.dataUpdatedAt,
    placeholder: firstPage.isPlaceholderData,
  };
  if (needsNotificationWindowSeed(first, loaded)) {
    // Adjusting state while rendering (React's documented pattern for state
    // derived from a changed input): the window is what a later refresh merges
    // over, so the list never shrinks under a `notification.push`.
    setLoaded(seedNotificationWindow(first));
  }
  const shown = toShownNotificationRows(first, loaded);
  const listState = toNotificationListState(toAsyncView(firstPage).kind, firstPage.data !== undefined);

  // 6. Callbacks (useCallback calling pure helpers)
  const { answeredAt } = first;
  const onLoadMore = useCallback(() => {
    if (isFetchingRef.current || shown.cursor === '') {
      return;
    }
    isFetchingRef.current = true;
    const requestedKey = serializedKey;
    const shownRows = shown.rows;
    source
      .listNotifications(toNotificationPageRequest({ view, unreadOnly, search, levels, sources }, shown.cursor))
      .then((page) => {
        if (queryKeyRef.current === requestedKey) {
          setLoaded({ queryKey: requestedKey, firstPageAt: answeredAt, rows: [...shownRows, ...page.items], cursor: page.nextCursor ?? '' });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        isFetchingRef.current = false;
      });
  }, [answeredAt, serializedKey, shown.cursor, shown.rows, source, view, unreadOnly, search, levels, sources]);

  const { refetch: refetchFirstPage } = firstPage;
  const refetch = useCallback(() => {
    setLoaded((current) => (current === undefined ? current : { ...current, resetPending: true }));
    void refetchFirstPage();
  }, [refetchFirstPage]);

  const refreshTopPage = useCallback(() => {
    void refetchFirstPage();
  }, [refetchFirstPage]);

  const transformRows = useCallback((transition: (current: readonly NotificationRow[]) => readonly NotificationRow[]) => {
    setLoaded((current) => transformNotificationWindow(current, firstPageRef.current, transition));
  }, []);

  // 7. Effects
  useEffect(() => {
    queryKeyRef.current = first.queryKey;
    firstPageRef.current = first;
  });

  return {
    hasNextPage: shown.cursor !== '',
    listState,
    onLoadMore,
    refetch,
    refreshTopPage,
    rows: shown.rows,
    totalEverRecorded: firstPage.data?.totalEver ?? 0,
    transformRows,
  };
}
