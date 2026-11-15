import { useCallback } from 'react';
import type { ActivityChartScale, ActivityFeedOrigin, ActivityFeedType } from '../../../shared/contracts/activity-feed.types';
import type { ActivityFeedSource } from '../../../shared/contracts/activity.types';
import { toAsyncView } from '../../../shared/query/async-view/async-view.helpers';
import { activityKeys } from '../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../shared/query/use-bridge-query/use-bridge-query';
import { toActivityQueryStatus } from './activity-feed-query.helpers';

/**
 * Owns the overview read through `useBridgeQuery` on the `observability`
 * module: the chart of one scale, whose bars count what the table shows
 * (origin, sections and failures-only), and the per-type counts of a range and
 * origin, read again when any of them changes and on `refresh`. A failed
 * refresh keeps the counts on screen. Drawn bars stay while a new read runs.
 *
 * @param source The feed port.
 * @param scale The chart scale.
 * @param fromMs The range start, or 0 for the scale's window.
 * @param toMs The range end, or 0 for now.
 * @param origin The origin filter.
 * @param types The selected sections the bars count.
 * @param failuresOnly Whether the bars count only failed lines.
 * @returns The request status, the overview, and the refresh and retry callbacks.
 */
export function useActivityOverview(
  source: ActivityFeedSource,
  scale: ActivityChartScale,
  fromMs: number,
  toMs: number,
  origin: ActivityFeedOrigin,
  types: readonly ActivityFeedType[],
  failuresOnly: boolean,
) {
  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: activityKeys.key('overview', scale, fromMs, toMs, origin, types, failuresOnly),
    queryFn: () => source.getOverview(scale, fromMs, toMs, origin, types, failuresOnly),
    module: 'observability',
  });

  // 5. Derived State (useMemo)
  // Bars already drawn (a previous range's placeholder, or a failed refresh's last answer) stay ready.
  const status = toActivityQueryStatus(toAsyncView(query, () => false), query.data !== undefined, query.isFetching);

  // 6. Callbacks (useCallback calling pure helpers)
  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { status, overview: query.data, refresh, retry: refresh };
}
