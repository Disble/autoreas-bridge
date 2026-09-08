import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEpisodeScheduleSource, getDefaultEpisodeDay, getEpisodeEmptyStateCopy, getEpisodeFilterOptions, toEpisodeScheduleRows } from './episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from './episode-schedule-panel.types';
import { useEpisodeCovers } from './use-episode-covers';
import { useEpisodeDayCounts } from './use-episode-day-counts';
import { useEpisodeDesktopActions } from './use-episode-desktop-actions';
import { useEpisodeProgressCommands } from './use-episode-progress-commands';
import { useEpisodeScheduleRequest } from './use-episode-schedule-request';

/**
 * Composes the focused request, day-count, cover, write and desktop-action
 * hooks the Today board is built from, and derives the view model its dumb
 * component renders.
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
  const covers = useEpisodeCovers(schedule.items, source);
  const { openAnimePage, copyAnimePage, openAnimeFolder, copyAnimeFolder } = useEpisodeDesktopActions(source, schedule.setErrorMessage);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const filterOptions = useMemo(() => getEpisodeFilterOptions(schedule.lens === 'season'), [schedule.lens]);
  const rows = useMemo(() => toEpisodeScheduleRows(schedule.items, covers), [schedule.items, covers]);
  const emptyStateCopy = useMemo(() => getEpisodeEmptyStateCopy(schedule.lens, schedule.selectedDay), [schedule.lens, schedule.selectedDay]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onCommitted = useCallback(() => {
    schedule.refresh();
    refreshDayCounts();
  }, [refreshDayCounts, schedule]);

  const { adjustWatchedEpisodes, setAnimeState } = useEpisodeProgressCommands({ onCommitted, onError: schedule.setErrorMessage, source });

  // 7. Effects
  useEffect(() => {
    // The backend pushes every committed anime change, including writes that
    // never touched this window (mobile, REST API, background downloads).
    // Without this the panel only refreshed on remount, so a mobile update
    // stayed invisible until the user navigated away and back.
    return source.subscribeAnimeChanges(onCommitted);
  }, [onCommitted, source]);

  return {
    adjustWatchedEpisodes,
    copyAnimeFolder,
    copyAnimePage,
    dayCounts,
    emptyStateCopy,
    errorMessage: schedule.errorMessage,
    filterOptions,
    isLoadingSchedule: schedule.isLoadingSchedule,
    lens: schedule.lens,
    openAnimeFolder,
    openAnimePage,
    rows,
    selectDay: schedule.selectDay,
    selectLens: schedule.selectLens,
    selectedDay: schedule.selectedDay,
    setAnimeState,
    todayDay,
  };
}
