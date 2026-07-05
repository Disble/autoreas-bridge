import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { preferencesSource } from '../../../../infrastructure/preferences-source';
import { CHAPTER_RUNTIME_UNAVAILABLE_RESULT } from './chapter-schedule-panel.constants';
import { getChapterFilterOptions, getInitialChapterSelection, toChapterScheduleRows } from './chapter-schedule-panel.helpers';
import type { ChapterCommandResult, ChapterScheduleItem, ChapterSchedulePanelProps, ChapterScheduleSource } from './chapter-schedule-panel.types';


/**
 * Loads the selected chapter schedule and exposes backend chapter commands.
 */
export function useChapterSchedulePanel(props: Readonly<ChapterSchedulePanelProps>) {
  // 1. Refs

  // 2. State
  const [selectedDay, setSelectedDay] = useState(props.initialDay ?? '');
  const [isSeasonMode, setIsSeasonMode] = useState(false);
  const [items, setItems] = useState<readonly ChapterScheduleItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const source = useMemo<ChapterScheduleSource>(
    () =>
      props.source ?? {
        adjustWatchedChapters: bridgeRuntimeSource.adjustWatchedChapters ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
        copyAnimeFolder: bridgeRuntimeSource.copyAnimeFolder ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
        copyAnimePage: bridgeRuntimeSource.copyAnimePage ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
        getChapterSchedule: bridgeRuntimeSource.getChapterSchedule ?? (() => Promise.resolve([])),
        getSeasonMode: preferencesSource.getSeasonMode,
        openAnimeFolder: bridgeRuntimeSource.openAnimeFolder ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
        openAnimePage: bridgeRuntimeSource.openAnimePage ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
        setAnimeState: bridgeRuntimeSource.setAnimeState ?? (() => Promise.resolve(CHAPTER_RUNTIME_UNAVAILABLE_RESULT)),
      },
    [props.source],
  );
  const filterOptions = useMemo(() => getChapterFilterOptions(isSeasonMode), [isSeasonMode]);
  const rows = useMemo(() => toChapterScheduleRows(items), [items]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    if (selectedDay === '') {
      return;
    }
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

  const runDesktopAction = useCallback(async (action: (animeID: string) => Promise<ChapterCommandResult>, animeID: string) => {
    setErrorMessage('');
    const result = await action(animeID);
    if (result.status !== 'ok') {
      setErrorMessage(result.message ?? 'Could not run anime desktop action.');
    }
  }, []);

  const openAnimePage = useCallback((animeID: string) => runDesktopAction(source.openAnimePage, animeID), [runDesktopAction, source.openAnimePage]);
  const copyAnimePage = useCallback((animeID: string) => runDesktopAction(source.copyAnimePage, animeID), [runDesktopAction, source.copyAnimePage]);
  const openAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.openAnimeFolder, animeID), [runDesktopAction, source.openAnimeFolder]);
  const copyAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.copyAnimeFolder, animeID), [runDesktopAction, source.copyAnimeFolder]);

  // 7. Effects
  useEffect(() => {
    if (props.initialDay !== undefined) {
      return;
    }
    let isActive = true;
    void source
      .getSeasonMode()
      .then((enabled) => {
        if (!isActive) {
          return;
        }
        setIsSeasonMode(enabled);
        setSelectedDay(getInitialChapterSelection({ isSeasonMode: enabled }));
      })
      .catch(() => {
        if (isActive) {
          setIsSeasonMode(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [props.initialDay, source]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    adjustWatchedChapters,
    copyAnimeFolder,
    copyAnimePage,
    errorMessage,
    filterOptions,
    isSeasonMode,
    openAnimeFolder,
    openAnimePage,
    rows,
    selectDay,
    selectedDay,
    setAnimeState,
  };
}
