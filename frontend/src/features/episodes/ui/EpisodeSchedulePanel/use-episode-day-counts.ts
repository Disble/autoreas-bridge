import { useCallback } from 'react';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { episodesKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { toDayBadgeCounts } from './episode-schedule-panel.helpers';
import type { EpisodeScheduleSource } from './episode-schedule-panel.types';

/**
 * Reads the per-weekday badge counts through `useBridgeQuery`, gated on the
 * `episodes` module, and hands back a way to re-read them. An `anime.changed`
 * event refreshes them through the `BRIDGE_INVALIDATIONS` rule.
 *
 * The counts are a decoration on the day tabs: while they load or after their
 * read failed the tabs carry no badges, and the schedule view (not this hook)
 * shows the module's loading or failure state.
 *
 * @param source The schedule port the counts are read through.
 * @returns The counts to badge and the refresh a committed write triggers.
 */
export function useEpisodeDayCounts(source: EpisodeScheduleSource) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: episodesKeys.key('day-counts'),
    queryFn: () => source.getEpisodeDayCounts(),
    module: 'episodes',
  });

  // 5. Derived State (useMemo)
  const dayCounts = toDayBadgeCounts(toAsyncView(query));

  // 6. Callbacks (useCallback calling pure helpers)
  const { refetch } = query;
  const refreshDayCounts = useCallback(() => {
    void refetch();
  }, [refetch]);

  // 7. Effects

  return { dayCounts, refreshDayCounts };
}
