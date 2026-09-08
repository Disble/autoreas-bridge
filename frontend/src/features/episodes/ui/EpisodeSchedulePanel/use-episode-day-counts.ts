import { useCallback, useEffect, useState } from 'react';
import type { EpisodeDayCount, EpisodeScheduleSource } from './episode-schedule-panel.types';

/**
 * Loads the per-weekday badge counts and hands back a way to re-read them.
 *
 * A failed read degrades to no badges rather than to an error: the counts are a
 * decoration on the day tabs, and losing them must not take the schedule down
 * with them.
 *
 * @param source The schedule port the counts are read through.
 * @returns The current counts and the refresh a committed write triggers.
 */
export function useEpisodeDayCounts(source: EpisodeScheduleSource) {
  // 1. Refs

  // 2. State
  const [dayCounts, setDayCounts] = useState<readonly EpisodeDayCount[]>([]);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const refreshDayCounts = useCallback(() => {
    void source
      .getEpisodeDayCounts()
      .then((counts) => {
        setDayCounts(counts);
      })
      .catch(() => {
        setDayCounts([]);
      });
  }, [source]);

  // 7. Effects
  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-derived-state -- Day counts come from an async backend query and are not derivable from the local render state.
    refreshDayCounts();
  }, [refreshDayCounts]);

  return { dayCounts, refreshDayCounts };
}
