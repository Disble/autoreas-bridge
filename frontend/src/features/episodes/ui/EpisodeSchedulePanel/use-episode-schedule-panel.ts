import { useCallback, useMemo, useState } from 'react';
import { NO_EPISODE_SCHEDULE_ITEMS } from './episode-schedule-panel.constants';
import { createEpisodeScheduleSource, getDefaultEpisodeDay, getEpisodeEmptyStateCopy, getEpisodeFilterOptions, toEpisodeScheduleView } from './episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from './episode-schedule-panel.types';
import { useEpisodeCovers } from './use-episode-covers';
import { useEpisodeDayCounts } from './use-episode-day-counts';
import { useEpisodeDesktopActions } from './use-episode-desktop-actions';
import { useEpisodeProgressCommands } from './use-episode-progress-commands';
import { useEpisodeScheduleRequest } from './use-episode-schedule-request';

/**
 * Composes the focused schedule-query, day-count, cover, write and
 * desktop-action hooks the Today board is built from, and derives the one
 * schedule view (loading, failure, empty or ready, ADR-032 §4) its dumb
 * component renders. Backend pushes need no subscription here: the
 * `anime.changed` rule in `BRIDGE_INVALIDATIONS` refreshes both queries.
 */
export function useEpisodeSchedulePanel(props: Readonly<EpisodeSchedulePanelProps>) {
  // 1. Refs

  // 2. State
  // The current weekday, captured once at mount so the tab marker cannot move
  // mid-session. `useState` (not `useMemo`) because React only guarantees a
  // lazy initializer runs once; a memo may be recomputed at any time.
  const [todayDay] = useState(() => getDefaultEpisodeDay());

  // 3. Context/3rd Party Hooks
  const source = useMemo(() => createEpisodeScheduleSource(props.source), [props.source]);
  const schedule = useEpisodeScheduleRequest(source, props.initialDay);
  const { dayCounts, refreshDayCounts } = useEpisodeDayCounts(source);
  const covers = useEpisodeCovers(schedule.query.data ?? NO_EPISODE_SCHEDULE_ITEMS, source);
  const { openAnimePage, copyAnimePage, openAnimeFolder, copyAnimeFolder } = useEpisodeDesktopActions(source, schedule.setErrorMessage);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const filterOptions = useMemo(() => getEpisodeFilterOptions(schedule.lens === 'season'), [schedule.lens]);
  const scheduleView = toEpisodeScheduleView(schedule.query, covers, schedule.errorMessage);
  const isScheduleRefreshing = scheduleView.kind === 'ready' && scheduleView.isRefreshing;
  const emptyStateCopy = useMemo(() => getEpisodeEmptyStateCopy(schedule.lens, schedule.selectedDay), [schedule.lens, schedule.selectedDay]);

  // 6. Callbacks (useCallback calling pure helpers)
  const { refresh } = schedule;
  const onCommitted = useCallback(() => {
    refresh();
    refreshDayCounts();
  }, [refresh, refreshDayCounts]);

  const { adjustWatchedEpisodes, setAnimeState } = useEpisodeProgressCommands({ onCommitted, onError: schedule.setErrorMessage, source });

  // 7. Effects

  return {
    adjustWatchedEpisodes,
    copyAnimeFolder,
    copyAnimePage,
    dayCounts,
    emptyStateCopy,
    filterOptions,
    isScheduleRefreshing,
    lens: schedule.lens,
    openAnimeFolder,
    openAnimePage,
    scheduleView,
    selectDay: schedule.selectDay,
    selectLens: schedule.selectLens,
    selectedDay: schedule.selectedDay,
    setAnimeState,
    todayDay,
  };
}
