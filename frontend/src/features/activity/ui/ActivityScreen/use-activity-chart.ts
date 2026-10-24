import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { selectionFromDrag, toChartBars, toTableSlots } from '../../feed/activity-chart.helpers';
import { setFilterRange } from '../../feed/activity-feed-filters.helpers';
import { ACTIVITY_CHART_DENSE_AFTER, ACTIVITY_SCALE_OPTIONS } from '../../feed/activity-feed.constants';
import type { ActivityChartDensity, ActivityFeedFilters, ActivityReadStatus } from '../../feed/activity-feed.types';
import type { ActivityOverview } from '../../feed-source/feed.types';
import type { ActivityChartDrag } from './activity-screen.types';

/**
 * Owns the time chart: its bars and title, and the drag across the bars that
 * previews a range while the pointer moves and sets the filter range on release.
 *
 * @param overview The overview read, or undefined while none resolved.
 * @param status The overview read status.
 * @param filters The screen filters.
 * @param setFilters Updates the screen filters on release.
 * @returns The chart model and the bar pointer callbacks.
 */
export function useActivityChart(
  overview: ActivityOverview | undefined,
  status: ActivityReadStatus,
  filters: ActivityFeedFilters,
  setFilters: Dispatch<SetStateAction<ActivityFeedFilters>>,
) {
  // 1. Refs

  // 2. State
  const [drag, setDrag] = useState<ActivityChartDrag | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  // A drag starts only on a rendered bar, so a drag always has the slots it indexes.
  const slots = useMemo(() => toTableSlots(overview?.slots ?? [], filters.types), [filters.types, overview]);
  const dragRange = drag === undefined ? undefined : selectionFromDrag(slots, drag.anchor, drag.current, undefined, filters.anchorMs);
  const bars = toChartBars(slots, filters.scale, dragRange ?? filters.range);
  const density: ActivityChartDensity = bars.length > ACTIVITY_CHART_DENSE_AFTER ? 'dense' : 'sparse';
  const title = ACTIVITY_SCALE_OPTIONS.find((option) => option.id === filters.scale)?.title ?? '';

  // 6. Callbacks (useCallback calling pure helpers)
  const onBarPointerDown = useCallback((index: number) => setDrag({ anchor: index, current: index }), []);
  const onBarPointerEnter = useCallback((index: number) => setDrag((current) => (current === undefined ? current : { anchor: current.anchor, current: index })), []);
  const onBarsPointerLeave = useCallback(() => setDrag(undefined), []);
  const onBarsPointerUp = useCallback(() => {
    if (drag === undefined) {
      return;
    }
    setDrag(undefined);
    setFilters((current) => setFilterRange(current, selectionFromDrag(slots, drag.anchor, drag.current, current.range, Date.now()), Date.now()));
  }, [drag, setFilters, slots]);

  // 7. Effects

  return { chart: { status, bars, title, density, isDragging: drag !== undefined }, onBarPointerDown, onBarPointerEnter, onBarsPointerLeave, onBarsPointerUp };
}
