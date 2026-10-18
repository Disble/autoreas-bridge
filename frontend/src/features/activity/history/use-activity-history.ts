import { useCallback, useMemo, useState } from 'react';
import type { Key } from '@heroui/react';
import { createHistorySource } from '../history-source/history-source.helpers';
import type { ActivityWhere } from '../history-source/history.types';
import type { HistorySource } from '../history-source/history-source.types';
import { ACTIVITY_DEFAULT_WHERE } from './activity-history.constants';
import { findCalendarGaps, toActivityWhere, toCalendarModel, toHistoryItems, toHistoryResolvedView } from './activity-history.helpers';
import { useActivityHistoryPages } from './use-activity-history-pages';

/**
 * Owns the History tab: the "where it happened" filter, the paged reads of
 * that filter (`useActivityHistoryPages`), and the drawable calendar, day
 * list and resolved view derived from them. Changing the filter reads its
 * first page again.
 *
 * @param source The History port; the shared Wails source when omitted.
 * @returns The filter, the request status, the drawable calendar and day list, and their callbacks.
 */
export function useActivityHistory(source: HistorySource = createHistorySource()) {
  // 1. Refs

  // 2. State
  const [where, setWhere] = useState<ActivityWhere>(ACTIVITY_DEFAULT_WHERE);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { status, calendarDays, days, hasMore, isLoadingMore, onScroll, retry } = useActivityHistoryPages(source, where);

  // 5. Derived State (useMemo)
  const calendar = useMemo(() => toCalendarModel(calendarDays), [calendarDays]);
  const items = useMemo(() => toHistoryItems(days, findCalendarGaps(calendarDays), hasMore), [days, calendarDays, hasMore]);
  const resolvedView = toHistoryResolvedView(where, days, calendarDays);

  // 6. Callbacks (useCallback calling pure helpers)
  const onWhereChange = useCallback((keys: Set<Key>) => setWhere((current) => toActivityWhere(keys, current)), []);

  const showAll = useCallback(() => setWhere(ACTIVITY_DEFAULT_WHERE), []);

  // 7. Effects

  return { where, status, calendar, items, resolvedView, isLoadingMore, onScroll, onWhereChange, showAll, retry };
}
