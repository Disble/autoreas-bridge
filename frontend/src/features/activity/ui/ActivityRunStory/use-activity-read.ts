import { useCallback } from 'react';
import type { ActivitySource } from '../../../../shared/contracts/activity.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { activityKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import type { ActivityRead, ActivityReader, ActivityReadName, ActivityReadState } from './activity-run-story.types';
import { isActivityReadGone, toActivityQueryRead } from './activity-time.helpers';

/**
 * Owns the read of an id that is always present.
 *
 * @param source The Activity port.
 * @param id What to read.
 * @param reader Reads one id; a stable, module-level function.
 * @param name What the reader reads, which keys its query.
 * @returns The current read and "Try again".
 */
export function useActivityRead<K extends string | number, T>(source: ActivitySource, id: K, reader: ActivityReader<K, T>, name: ActivityReadName): ActivityReadState<T>;
/**
 * Owns the read of an id that may be absent.
 *
 * @param source The Activity port.
 * @param id What to read; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @param name What the reader reads, which keys its query.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useActivityRead<K extends string | number, T>(
  source: ActivitySource,
  id: K | undefined,
  reader: ActivityReader<K, T>,
  name: ActivityReadName,
): ActivityReadState<T, undefined>;
/**
 * Owns one by-id read through `useBridgeQuery` on the `observability` module:
 * one read per id and per "Try again", loading until its own answer arrives
 * (and while the module starts), failed once the read or the module failed.
 * Without an id nothing is read.
 *
 * @param source The Activity port.
 * @param id What to read; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @param name What the reader reads, which keys its query.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useActivityRead<K extends string | number, T>(
  source: ActivitySource,
  id: K | undefined,
  reader: ActivityReader<K, T>,
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
