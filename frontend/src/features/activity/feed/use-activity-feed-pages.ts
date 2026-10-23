import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { isNearListBottom } from '../../../shared/helpers/progressive-list.helpers';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityFeedDay, ActivityFeedQuery } from '../feed-source/feed.types';
import { mergeFeedDays, mergeLivePage } from './activity-feed-rows.helpers';
import type { ActivityReadStatus } from './activity-feed.types';

/**
 * Owns the feed's paged reads for one query: the first page, read again
 * whenever the query changes; older pages read through the cursor near the
 * bottom of the list; and a live refresh that merges a fresh first page
 * without shrinking the loaded window (ADR-012, live variant). A read started
 * under an older query is dropped when it resolves. A failed older page or
 * live refresh keeps the rows on screen.
 *
 * @param source The feed port.
 * @param query The first-page query, or undefined to read nothing (no type selected).
 * @returns The request status, the loaded days, the paging state and the callbacks.
 */
export function useActivityFeedPages(source: ActivityFeedSource, query: ActivityFeedQuery | undefined) {
  // 1. Refs
  const requestIdRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const daysRef = useRef<readonly ActivityFeedDay[]>([]);
  const cursorRef = useRef('');

  // 2. State
  const [status, setStatus] = useState<ActivityReadStatus>('loading');
  const [days, setDays] = useState<readonly ActivityFeedDay[]>([]);
  const [cursor, setCursor] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const showPage = useCallback((nextDays: readonly ActivityFeedDay[], nextCursor: string) => {
    daysRef.current = nextDays;
    cursorRef.current = nextCursor;
    setDays(nextDays);
    setCursor(nextCursor);
  }, []);

  const loadFirstPage = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    if (query === undefined) {
      showPage([], '');
      setStatus('ready');
      return;
    }
    setStatus('loading');
    source
      .searchFeed(query)
      .then((view) => {
        if (requestId === requestIdRef.current) {
          showPage(view.days, view.nextCursor);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setStatus('failed');
        }
      });
  }, [query, showPage, source]);

  const loadOlderPage = useCallback(
    (older: ActivityFeedQuery) => {
      const requestId = requestIdRef.current;
      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);
      source
        .searchFeed({ ...older, cursor: cursorRef.current })
        .then((view) => {
          if (requestId === requestIdRef.current) {
            showPage(mergeFeedDays(daysRef.current, view.days), view.nextCursor);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (requestId === requestIdRef.current) {
            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
          }
        });
    },
    [showPage, source],
  );

  const refreshLive = useCallback(() => {
    if (query === undefined) {
      return;
    }
    const requestId = requestIdRef.current;
    source
      .searchFeed(query)
      .then((view) => {
        if (requestId === requestIdRef.current) {
          const merged = mergeLivePage(daysRef.current, cursorRef.current, view);
          showPage(merged.days, merged.cursor);
          setStatus('ready');
        }
      })
      .catch(() => undefined);
  }, [query, showPage, source]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      // A cursor exists only after a query read a page, so the query check never fails first.
      if (cursorRef.current !== '' && !isLoadingMoreRef.current && isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight) && query !== undefined) {
        loadOlderPage(query);
      }
    },
    [loadOlderPage, query],
  );

  // 7. Effects
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  return { status, days, hasMore: cursor !== '', isLoadingMore, onScroll, refreshLive, retry: loadFirstPage };
}
