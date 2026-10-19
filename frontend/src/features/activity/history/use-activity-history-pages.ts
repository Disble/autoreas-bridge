import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { isNearListBottom } from '../../../shared/helpers/progressive-list.helpers';
import type { ActivityCalendarDay, ActivityHistoryView, ActivityLedgerDay, ActivityWhere } from '../history-source/history.types';
import type { HistorySource } from '../history-source/history-source.types';
import { ACTIVITY_HISTORY_PAGE_LIMIT } from './activity-history.constants';
import { mergeHistoryDays, whenCurrentRequest } from './activity-history.helpers';
import type { ActivityHistoryRequestStatus } from './activity-history.types';

/**
 * Owns History's paged reads for one filter: the first page (which carries
 * the 90-day calendar), read again whenever the filter changes, and older
 * days read through the cursor near the bottom of the day list. A read
 * started under an older filter is dropped when it resolves. A failed older
 * page keeps the days on screen and the next scroll tries again.
 *
 * @param source The History port.
 * @param where The filter to read.
 * @returns The request status, the raw calendar and days, the cursor state and the callbacks.
 */
export function useActivityHistoryPages(source: HistorySource, where: ActivityWhere) {
  // 1. Refs
  const requestIdRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  // 2. State
  const [status, setStatus] = useState<ActivityHistoryRequestStatus>('loading');
  const [calendarDays, setCalendarDays] = useState<readonly ActivityCalendarDay[]>([]);
  const [days, setDays] = useState<readonly ActivityLedgerDay[]>([]);
  const [cursor, setCursor] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const loadFirstPage = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    setStatus('loading');
    void source
      .searchHistory(where, '', ACTIVITY_HISTORY_PAGE_LIMIT)
      .then(
        whenCurrentRequest(requestIdRef, requestId, (view: ActivityHistoryView) => {
          setCalendarDays(view.calendar);
          setDays(view.days);
          setCursor(view.nextCursor);
          setStatus('ready');
        }),
      )
      .catch(whenCurrentRequest(requestIdRef, requestId, () => setStatus('failed')));
  }, [source, where]);

  const loadOlderPage = useCallback(() => {
    const requestId = requestIdRef.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    void source
      .searchHistory(where, cursor, ACTIVITY_HISTORY_PAGE_LIMIT)
      .then(
        whenCurrentRequest(requestIdRef, requestId, (view: ActivityHistoryView) => {
          setDays((shown) => mergeHistoryDays(shown, view.days));
          setCursor(view.nextCursor);
        }),
      )
      .catch(() => undefined)
      .finally(
        whenCurrentRequest<void>(requestIdRef, requestId, () => {
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        }),
      );
  }, [cursor, source, where]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      if (cursor !== '' && !isLoadingMoreRef.current && isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        loadOlderPage();
      }
    },
    [cursor, loadOlderPage],
  );

  // 7. Effects
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  return { status, calendarDays, days, hasMore: cursor !== '', isLoadingMore, onScroll, retry: loadFirstPage };
}
