import { useCallback, useMemo, useState } from 'react';
import { episodesKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { useSeasonMode } from '../../../../shared/season/season-mode/use-season-mode';
import { getDefaultLensSelection, toInitialEpisodeLens, toVisibleCommandFailure } from './episode-schedule-panel.helpers';
import type { EpisodeCommandFailure, EpisodeLensSelection, EpisodeScheduleSource, EpisodeViewLens } from './episode-schedule-panel.types';

/**
 * Owns which slice of the schedule is being looked at — the selected day and
 * lens — and the query that fills it: `useBridgeQuery`, gated on the `episodes`
 * module, keyed by the day (`episodesKeys.key('schedule', day)`), refreshed on
 * `anime.changed` by the `BRIDGE_INVALIDATIONS` rule.
 *
 * The initial lens and day follow season mode (`useSeasonMode`, module
 * `season`) until the user picks a lens or a day: the season lens on Ver hoy
 * while a season is open, the daily lens on today's weekday when none is open
 * or season mode failed. The query stays pending until a day is chosen
 * (`enabled`) and while the episodes module starts, so an unresolved board is
 * never reported as "resolved and empty" (that showed creation guidance for
 * anime the user already has, and S9's "Nothing scheduled" during startup).
 *
 * It also keeps the last rejected row write, stamped with when it was raised,
 * so it shows until the schedule loads again.
 *
 * @param source The schedule port the rows are read through.
 * @param initialDay A caller-supplied day on the daily lens, which also skips the season read.
 * @returns The selection, the schedule query, the visible write failure, and the refresh.
 */
export function useEpisodeScheduleRequest(source: EpisodeScheduleSource, initialDay?: string) {
  // 1. Refs

  // 2. State
  const [userSelection, setUserSelection] = useState<EpisodeLensSelection | undefined>(undefined);
  const [commandFailure, setCommandFailure] = useState<EpisodeCommandFailure | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const seasonMode = useSeasonMode(source, initialDay === undefined);
  const initialSelection = useMemo(() => toInitialEpisodeLens(seasonMode, initialDay), [seasonMode, initialDay]);
  const selection = userSelection ?? initialSelection;
  const lens = selection?.lens ?? 'daily';
  const selectedDay = selection?.day ?? '';
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

  const selectDay = useCallback(
    (day: string) => {
      setUserSelection({ lens, day });
    },
    [lens],
  );

  const selectLens = useCallback((nextLens: EpisodeViewLens) => {
    setUserSelection({ lens: nextLens, day: getDefaultLensSelection(nextLens) });
  }, []);

  // 7. Effects

  return { selectedDay, lens, query, errorMessage, setErrorMessage, refresh, selectDay, selectLens };
}
