import { toast } from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import { toTypeToggles } from '../../feed/activity-feed-counts.helpers';
import { scaleWindowStart, toFeedQuery, typeSelectionKeys } from '../../feed/activity-feed-filters.helpers';
import { toFeedDayModels } from '../../feed/activity-feed-rows.helpers';
import { ACTIVITY_FEED_PAGE_LIMIT } from '../../feed/activity-feed.constants';
import { useActivityFeedPages } from '../../feed/use-activity-feed-pages';
import { useActivityLiveRefresh } from '../../feed/use-activity-live-refresh';
import { useActivityOverview } from '../../feed/use-activity-overview';
import { createActivityFeedSource } from '../../feed-source/feed-source.helpers';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import { createHistorySource } from '../../history-source/history-source.helpers';
import type { HistorySource } from '../../history-source/history-source.types';
import { useActivityRangePicker } from '../ActivityToolbar/use-activity-range-picker';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from './activity-screen.constants';
import { toFeedEndMark, toFeedResolvedView, toOverviewRange } from './activity-screen.helpers';
import { useActivityChart } from './use-activity-chart';
import { useActivityFailureMenu } from './use-activity-failure-menu';
import { useActivityFilters } from './use-activity-filters';
import { useActivityOpenLine } from './use-activity-open-line';

/**
 * Owns the Activity screen (activity-ui-design-v2.md): the filters the chart
 * and toolbar edit, the feed pages and the overview they read, the live
 * refresh of both, the chart drag, the failure menu, the open line with its
 * ↑ / ↓ / Esc keys, and "Pin this moment".
 *
 * @param feedSource The feed port; the shared Wails source when omitted.
 * @param historySource The port that carries the recorder subscription.
 * @param activitySource The port that pins a moment.
 * @returns Everything the dumb screen renders and the callbacks it wires.
 */
export function useActivityScreen(
  feedSource: ActivityFeedSource = createActivityFeedSource(),
  historySource: HistorySource = createHistorySource(),
  activitySource: ActivitySource = createActivitySource(),
) {
  // 1. Refs

  // 2. State
  const [isPinning, setIsPinning] = useState(false);
  const { filters, setFilters, onRangeChange, onClearRange, ...filterCallbacks } = useActivityFilters();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useMemo(() => toFeedQuery(filters, '', ACTIVITY_FEED_PAGE_LIMIT), [filters]);
  const pages = useActivityFeedPages(feedSource, query);
  const overviewRange = toOverviewRange(filters);
  const overviewRead = useActivityOverview(feedSource, filters.scale, overviewRange.fromMs, overviewRange.toMs, filters.origin);

  // 5. Derived State (useMemo)
  const failureMenu = useActivityFailureMenu(overviewRead.overview, filters, setFilters);
  const { openKey, ...openLine } = useActivityOpenLine(pages.days, { isOpen: failureMenu.isFailureMenuShown, onClose: failureMenu.onFailureMenuEscape });
  const days = useMemo(() => toFeedDayModels(pages.days, openKey, filters.anchorMs), [filters.anchorMs, openKey, pages.days]);
  const rangeField = useActivityRangePicker(filters, onRangeChange, onClearRange);
  const chart = useActivityChart(overviewRead.overview, overviewRead.status, filters, setFilters);
  const windowStartMs = scaleWindowStart(filters.scale, filters.anchorMs);

  // 6. Callbacks (useCallback calling pure helpers)
  const { refreshLive } = pages;
  const { refresh: refreshOverview } = overviewRead;
  const onLive = useCallback(() => {
    refreshLive();
    refreshOverview();
  }, [refreshLive, refreshOverview]);

  const onRetry = useCallback(() => {
    pages.retry();
    overviewRead.retry();
  }, [overviewRead, pages]);

  const pin = useCallback(() => {
    setIsPinning(true);
    void activitySource
      .pinMoment()
      .then(() => toast.success(ACTIVITY_PIN_SUCCESS_MESSAGE))
      .catch(() => toast.danger(ACTIVITY_PIN_FAILURE_MESSAGE))
      .finally(() => setIsPinning(false));
  }, [activitySource]);

  // 7. Effects
  useActivityLiveRefresh(historySource, onLive);

  return {
    scale: filters.scale,
    origin: filters.origin,
    rangeField,
    windowStartMs,
    nowMs: filters.anchorMs,
    typeToggles: toTypeToggles(overviewRead.overview),
    typeKeys: typeSelectionKeys(filters.types),
    failuresOnly: filters.failuresOnly,
    ...failureMenu,
    feed: {
      status: pages.status,
      resolvedView: toFeedResolvedView(query, pages.days),
      days,
      hasMore: pages.hasMore,
      isLoadingMore: pages.isLoadingMore,
      endMark: toFeedEndMark(filters),
    },
    ...openLine,
    isPinning,
    ...filterCallbacks,
    ...chart,
    onRetry,
    pin,
  };
}
