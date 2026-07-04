import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { getDefaultChapterDay, toChapterScheduleRows } from './chapter-schedule-panel.helpers';
import type { ChapterScheduleItem, ChapterSchedulePanelProps } from './chapter-schedule-panel.types';

/**
 * Loads the selected chapter schedule and exposes backend chapter commands.
 */
export function useChapterSchedulePanel(props: Readonly<ChapterSchedulePanelProps>) {
  // 1. Refs

  // 2. State
  const [selectedDay, setSelectedDay] = useState(props.initialDay ?? getDefaultChapterDay());
  const [items, setItems] = useState<readonly ChapterScheduleItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const source = useMemo(
    () =>
      props.source ?? {
        adjustWatchedChapters: bridgeRuntimeSource.adjustWatchedChapters ?? (() => Promise.resolve({ status: 'error', message: 'runtime unavailable' })),
        getChapterSchedule: bridgeRuntimeSource.getChapterSchedule ?? (() => Promise.resolve([])),
        setAnimeState: bridgeRuntimeSource.setAnimeState ?? (() => Promise.resolve({ status: 'error', message: 'runtime unavailable' })),
      },
    [props.source],
  );
  const rows = useMemo(() => toChapterScheduleRows(items), [items]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    setErrorMessage('');
    void source
      .getChapterSchedule(selectedDay)
      .then((nextItems) => {
        setItems(nextItems);
      })
      .catch(() => {
        setErrorMessage('Could not load chapter schedule.');
      });
  }, [selectedDay, source]);

  const selectDay = useCallback((day: string) => {
    setSelectedDay(day);
  }, []);

  const adjustWatchedChapters = useCallback(
    async (animeID: string, delta: number, base: number) => {
      setErrorMessage('');
      const result = await source.adjustWatchedChapters(animeID, delta, base);
      if (result.status !== 'ok') {
        setErrorMessage(result.message ?? 'Could not update chapter progress.');
        return;
      }
      refresh();
    },
    [refresh, source],
  );

  const setAnimeState = useCallback(
    async (animeID: string, estado: number, base: number) => {
      setErrorMessage('');
      const result = await source.setAnimeState(animeID, estado, base);
      if (result.status !== 'ok') {
        setErrorMessage(result.message ?? 'Could not update anime state.');
        return;
      }
      refresh();
    },
    [refresh, source],
  );

  // 7. Effects
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    adjustWatchedChapters,
    errorMessage,
    rows,
    selectDay,
    selectedDay,
    setAnimeState,
  };
}
