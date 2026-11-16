import { useCallback, useEffect, useState } from 'react';
import { episodesKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { getDefaultEpisodeDay, getDefaultLensSelection, getInitialEpisodeSelection, toVisibleCommandFailure } from './episode-schedule-panel.helpers';
import type { EpisodeCommandFailure, EpisodeScheduleSource, EpisodeViewLens } from './episode-schedule-panel.types';

/**
 * Owns which slice of the schedule is being looked at — the selected day and
 * lens — and the query that fills it: `useBridgeQuery`, gated on the `episodes`
 * module, keyed by the day (`episodesKeys.key('schedule', day)`), refreshed on
 * `anime.changed` by the `BRIDGE_INVALIDATIONS` rule.
 *
 * The query stays pending until the season probe chose a day (`enabled`) and
 * while the episodes module starts, so an unresolved board is never reported
 * as "resolved and empty" (that showed creation guidance for anime the user
 * already has, and S9's "Nothing scheduled" during startup).
 *
 * It also keeps the last rejected row write, stamped with when it was raised,
 * so it shows until the schedule loads again.
 *
 * @param source The schedule port the rows are read through.
 * @param initialDay A caller-supplied day, which also skips the season probe.
 * @returns The selection, the schedule query, the visible write failure, and the refresh.
 */
export function useEpisodeScheduleRequest(source: EpisodeScheduleSource, initialDay?: string) {
  // 1. Refs

  // 2. State
  const [selectedDay, setSelectedDay] = useState(initialDay ?? '');
  const [lens, setLens] = useState<EpisodeViewLens>('daily');
  const [commandFailure, setCommandFailure] = useState<EpisodeCommandFailure | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: episodesKeys.key('schedule', selectedDay),
    queryFn: () => source.getEpisodeSchedule(selectedDay),
    module: 'episodes',
    enabled: selectedDay !== '',
  });

  // 5. Derived State (useMemo)
  const { dataUpdatedAt, refetch } = query;
  const errorMessage = toVisibleCommandFailure(commandFailure, dataUpdatedAt);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const setErrorMessage = useCallback((message: string) => {
    setCommandFailure({ message, raisedAt: Date.now() });
  }, []);

  const selectDay = useCallback((day: string) => {
    setSelectedDay(day);
  }, []);

  const selectLens = useCallback((nextLens: EpisodeViewLens) => {
    setLens(nextLens);
    setSelectedDay(getDefaultLensSelection(nextLens));
  }, []);

  // 7. Effects
  useEffect(() => {
    if (initialDay !== undefined) {
      return;
    }
    let isActive = true;
    void source
      .getSeasonMode()
      .then((enabled) => {
        if (!isActive) {
          return;
        }
        setLens(enabled ? 'season' : 'daily');
        setSelectedDay(getInitialEpisodeSelection({ isSeasonMode: enabled }));
      })
      .catch(() => {
        if (isActive) {
          setLens('daily');
          // Also pick the daily default. Without it the selected day stays
          // blank, the schedule query never runs, and the panel waits forever.
          setSelectedDay(getDefaultEpisodeDay());
        }
      });
    return () => {
      isActive = false;
    };
  }, [initialDay, source]);

  return { selectedDay, lens, query, errorMessage, setErrorMessage, refresh, selectDay, selectLens };
}
