import { toast } from '@heroui/react';
import { useCallback, useMemo } from 'react';
import type { ActivitySource } from '../../../../shared/contracts/activity.types';
import { countFailures, toTypeToggles } from '../../feed/activity-feed-counts.helpers';
import { scaleWindowStart, toFeedQuery, typeSelectionKeys } from '../../feed/activity-feed-filters.helpers';
import { toFeedDayModels } from '../../feed/activity-feed-rows.helpers';
import { ACTIVITY_FEED_PAGE_LIMIT } from '../../feed/activity-feed.constants';
import { useActivityFeedPages } from '../../feed/use-activity-feed-pages';
import { useActivityLiveRefresh } from '../../feed/use-activity-live-refresh';
import { useActivityOverview } from '../../feed/use-activity-overview';
import { BRIDGE_ACTIVITY_FEED_SOURCE, BRIDGE_ACTIVITY_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import type { ActivityFeedSource } from '../../../../shared/contracts/activity.types';
import { createHistorySource } from '../../history-source/history-source.helpers';
import type { HistorySource } from '../../history-source/history-source.types';
import { useActivityRangePicker } from '../ActivityToolbar/use-activity-range-picker';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from './activity-screen.constants';
import { toFeedEndMark, toFeedResolvedView, toOverviewRange } from './activity-screen.helpers';
import { useActivityChart } from './use-activity-chart';
import { useActivityFilters } from './use-activity-filters';
import { useActivityOpenLine } from './use-activity-open-line';

/**
 * Owns the Activity screen (activity-ui-design-v2.md): the filters the chart
 * and toolbar edit, the feed pages and the overview they read, the live
 * refresh of both, the chart drag, the failure switch, the open line with its
 * ↑ / ↓ / Esc keys, and "Pin this moment".
 *
 * @param feedSource The feed port; the shared bridge source when omitted.
 * @param historySource The port that carries the recorder subscription.
 * @param activitySource The port that pins a moment.
 * @returns Everything the dumb screen renders and the callbacks it wires.
 */
export function useActivityScreen(
  feedSource: ActivityFeedSource = BRIDGE_ACTIVITY_FEED_SOURCE,
  historySource: HistorySource = createHistorySource(),
  activitySource: ActivitySource = BRIDGE_ACTIVITY_SOURCE,
) {
  // 1. Refs

  // 2. State
  const { filters, setFilters, onRangeChange, onClearRange, ...filterCallbacks } = useActivityFilters();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const pinMutation = useBridgeMutation({
    mutationFn: () => activitySource.pinMoment(),
    onSuccess: () => toast.success(ACTIVITY_PIN_SUCCESS_MESSAGE),
    onError: () => toast.danger(ACTIVITY_PIN_FAILURE_MESSAGE),
  });
  const query = useMemo(() => toFeedQuery(filters, '', ACTIVITY_FEED_PAGE_LIMIT), [filters]);
  const pages = useActivityFeedPages(feedSource, query);
  const overviewRange = toOverviewRange(filters);
  const overviewRead = useActivityOverview(feedSource, filters.scale, overviewRange.fromMs, overviewRange.toMs, filters.origin, filters.types, filters.failuresOnly);

  // 5. Derived State (useMemo)
  const { openKey, ...openLine } = useActivityOpenLine(pages.days);
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

  const { mutate: pinMoment } = pinMutation;
  const pin = useCallback(() => {
    pinMoment();
  }, [pinMoment]);

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
    failureCount: countFailures(overviewRead.overview, filters.types),
    feed: {
      status: pages.status,
      resolvedView: toFeedResolvedView(query, pages.days),
      days,
      hasMore: pages.hasMore,
      isLoadingMore: pages.isLoadingMore,
      endMark: toFeedEndMark(filters),
    },
    ...openLine,
    isPinning: pinMutation.isPending,
    ...filterCallbacks,
    ...chart,
    onRetry,
    pin,
  };
}
