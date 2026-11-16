import { useCallback } from 'react';
import type { ActivityFeedSource } from '../../../shared/contracts/activity.types';
import { toAsyncView } from '../../../shared/query/async-view/async-view.helpers';
import { activityKeys } from '../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../shared/query/use-bridge-query/use-bridge-query';
import type { ActivityRead, ActivityReadName, ActivityReadState } from '../ui/ActivityRunStory/activity-run-story.types';
import { isActivityReadGone, toActivityQueryRead } from '../ui/ActivityRunStory/activity-time.helpers';
import type { DrawerFeedReader } from './drawer.types';

/**
 * Owns one by-id read over the feed port (an event by `GetActivityEvent`, a
 * change's context by `GetActivityChangeContext`, a phone report by
 * `GetActivityPhoneReport`), the same contract as `useActivityRead`: one read
 * per id and per "Try again" through `useBridgeQuery` on the `observability`
 * module, loading until its own answer arrives. Without an id nothing is read.
 *
 * @param source The feed port.
 * @param id The row key; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @param name What the reader reads, which keys its query.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useDrawerFeedRead<K extends string | number, T>(
  source: ActivityFeedSource,
  id: K | undefined,
  reader: DrawerFeedReader<K, T>,
  name: ActivityReadName,
): ActivityReadState<T, undefined> {
  // 4. Queries/Mutations
  const query = useBridgeQuery<ActivityRead<T>>({
    queryKey: activityKeys.key(name, id),
    queryFn: () => (id === undefined ? Promise.resolve<ActivityRead<T>>({ status: 'gone' }) : reader(source, id)),
    module: 'observability',
    enabled: id !== undefined,
  });

  // 5. Derived State (useMemo)
  const read = id === undefined ? undefined : toActivityQueryRead(toAsyncView(query, isActivityReadGone), query.isFetching);

  // 6. Callbacks (useCallback calling pure helpers)
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { read, retry };
}
