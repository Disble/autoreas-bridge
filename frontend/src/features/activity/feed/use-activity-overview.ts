import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityChartScale, ActivityFeedOrigin, ActivityOverview } from '../feed-source/feed.types';
import type { ActivityReadStatus } from './activity-feed.types';

/**
 * Owns the overview read: the chart of one scale and the per-type counts of a
 * range and origin, read again when any of them changes and on `refresh`. A
 * failed refresh keeps the counts on screen. Drawn bars stay while a new read runs.
 *
 * @param source The feed port.
 * @param scale The chart scale.
 * @param fromMs The range start, or 0 for the scale's window.
 * @param toMs The range end, or 0 for now.
 * @param origin The origin filter.
 * @returns The request status, the overview, and the refresh and retry callbacks.
 */
export function useActivityOverview(source: ActivityFeedSource, scale: ActivityChartScale, fromMs: number, toMs: number, origin: ActivityFeedOrigin) {
  // 1. Refs
  const requestIdRef = useRef(0);

  // 2. State
  const [status, setStatus] = useState<ActivityReadStatus>('loading');
  const [overview, setOverview] = useState<ActivityOverview | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const read = useCallback(
    (isRefresh: boolean) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      // Bars already drawn stay while a new range or origin is read, so a chart selection never flashes the skeleton.
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      source
        .getOverview(scale, fromMs, toMs, origin)
        .then((view) => {
          if (requestId === requestIdRef.current) {
            setOverview(view);
            setStatus('ready');
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current && !isRefresh) {
            setStatus('failed');
          }
        });
    },
    [fromMs, origin, scale, source, toMs],
  );

  const refresh = useCallback(() => read(true), [read]);
  const retry = useCallback(() => read(false), [read]);

  // 7. Effects
  useEffect(() => {
    read(false);
  }, [read]);

  return { status, overview, refresh, retry };
}
