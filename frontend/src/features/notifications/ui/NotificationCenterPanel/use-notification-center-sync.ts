import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCenterSource } from '../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';

/** Master-list page size requested per fetch (mirrors the store's own `defaultListLimit`). */
const NOTIFICATION_CENTER_SYNC_PAGE_LIMIT = 25;

/** Which archive view the caller currently has selected. */
export type NotificationCenterSyncView = 'active' | 'archived';

/** Everything `useNotificationCenterSync` needs from its caller. */
export interface NotificationCenterSyncInput {
  readonly source: NotificationCenterSource;
  readonly view: NotificationCenterSyncView;
  readonly unreadOnly: boolean;
}

/** The accumulated master-list state `useNotificationCenterSync` exposes. */
export interface NotificationCenterSyncResult {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly totalEverRecorded: number;
  readonly degraded: boolean;
  readonly onLoadMore: () => void;
}

/**
 * Owns the notification master list's keyset-cursor pagination: the initial
 * page fetch, its reload when the view/unread filter changes, and the
 * `Table.LoadMore` near-bottom trigger -- guarded so a second near-bottom
 * signal while a fetch is already in flight, or one that arrives after the
 * backend reported no further cursor, never issues a second request
 * (design.md §9.2, task 3a.2.4).
 */
export function useNotificationCenterSync(input: Readonly<NotificationCenterSyncInput>): NotificationCenterSyncResult {
  const { source, view, unreadOnly } = input;

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
        .listNotifications({
          view,
          unreadOnly,
          search: '',
          sources: [],
          levels: [],
          cursor,
          limit: NOTIFICATION_CENTER_SYNC_PAGE_LIMIT,
        })
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
    [source, unreadOnly, view],
  );

  const onLoadMore = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage) {
      return;
    }
    void fetchPage(cursorRef.current, 'append');
  }, [fetchPage, hasNextPage]);

  // 7. Effects
  useEffect(() => {
    void fetchPage('', 'replace');
  }, [fetchPage]);

  return { degraded, hasNextPage, isLoading, onLoadMore, rows, totalEverRecorded };
}
