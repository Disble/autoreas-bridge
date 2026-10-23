import type { Key } from '@heroui/react';
import { useCallback, useState } from 'react';
import { createInitialFilters, fromCalendarRange, setFilterOrigin, setFilterRange, setFilterScale, toggleFeedTypes } from '../../feed/activity-feed-filters.helpers';
import type { ActivityCalendarRange, ActivityFeedFilters } from '../../feed/activity-feed.types';
import type { ActivityChartScale } from '../../feed-source/feed.types';

/**
 * Owns the filters the chart and toolbar edit: the scale, origin, types and
 * range, each change re-anchored at the current time.
 *
 * @returns The filters, their setter for the chart drag and failure menu, and the toolbar callbacks.
 */
export function useActivityFilters() {
  // 1. Refs

  // 2. State
  const [filters, setFilters] = useState<ActivityFeedFilters>(() => createInitialFilters(Date.now()));

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onScaleChange = useCallback((keys: Set<Key>) => {
    // The scale switch disallows an empty selection, so it always reports one scale.
    const [scale] = keys;
    setFilters((current) => setFilterScale(current, scale as ActivityChartScale, Date.now()));
  }, []);
  const onOriginChange = useCallback((keys: Set<Key>) => setFilters((current) => setFilterOrigin(current, keys, Date.now())), []);
  const onTypesChange = useCallback((keys: Set<Key>) => setFilters((current) => toggleFeedTypes(current, keys, Date.now())), []);
  const onCalendarChange = useCallback((value: ActivityCalendarRange) => {
    setFilters((current) => setFilterRange(current, fromCalendarRange(value), Date.now()));
  }, []);
  const onClearRange = useCallback(() => setFilters((current) => setFilterRange(current, undefined, Date.now())), []);

  // 7. Effects

  return { filters, setFilters, onScaleChange, onOriginChange, onTypesChange, onCalendarChange, onClearRange };
}
