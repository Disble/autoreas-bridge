import { useCallback, useEffect, useState } from 'react';
import { getDefaultEpisodeDay, getDefaultLensSelection, getInitialEpisodeSelection } from './episode-schedule-panel.helpers';
import type { EpisodeScheduleItem, EpisodeScheduleSource, EpisodeViewLens } from './episode-schedule-panel.types';

/**
 * Owns which slice of the schedule is being looked at — the selected day and
 * lens — and the request that fills it, including whether that request has
 * resolved.
 *
 * `isLoadingSchedule` starts true and stays true until a request settles,
 * because before the season probe answers there is no day to request yet.
 * Reporting "resolved and empty" in that window is what made an unresolved
 * board show creation guidance for anime the user already has.
 *
 * @param source The schedule port the rows are read through.
 * @param initialDay A caller-supplied day, which also skips the season probe.
 * @returns The selection, the loaded rows, the request state, and the refresh.
 */
export function useEpisodeScheduleRequest(source: EpisodeScheduleSource, initialDay?: string) {
  // 1. Refs

  // 2. State
  const [selectedDay, setSelectedDay] = useState(initialDay ?? '');
  const [lens, setLens] = useState<EpisodeViewLens>('daily');
  const [items, setItems] = useState<readonly EpisodeScheduleItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    if (selectedDay === '') {
      return;
    }
    setErrorMessage('');
    setIsLoadingSchedule(true);
    void source
      .getEpisodeSchedule(selectedDay)
      .then((nextItems) => {
        setItems(nextItems);
      })
      .catch(() => {
        setErrorMessage('Could not load episode schedule.');
      })
      .finally(() => {
        setIsLoadingSchedule(false);
      });
  }, [selectedDay, source]);

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
          // blank, no schedule request is ever made, and the panel waits on a
          // request that will never start.
          setSelectedDay(getDefaultEpisodeDay());
        }
      });
    return () => {
      isActive = false;
    };
  }, [initialDay, source]);

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-derived-state -- The selected day is interactive UI state that starts from runtime defaults and then diverges through user selection.
    refresh();
  }, [refresh]);

  return { selectedDay, lens, items, errorMessage, setErrorMessage, isLoadingSchedule, refresh, selectDay, selectLens };
}
