import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@heroui/react';
import { createEpisodeScheduleSource, getEpisodeFilterOptions, getDefaultLensSelection, getInitialEpisodeSelection, toEpisodeScheduleRows } from './episode-schedule-panel.helpers';
import type { EpisodeCommandResult, EpisodeDayCount, EpisodeScheduleItem, EpisodeSchedulePanelProps, EpisodeViewLens, CoverEntry } from './episode-schedule-panel.types';


/**
 * Loads the selected episode schedule and exposes backend episode commands.
 */
export function useEpisodeSchedulePanel(props: Readonly<EpisodeSchedulePanelProps>) {
  // 1. Refs
  const fetchedCoverIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [selectedDay, setSelectedDay] = useState(props.initialDay ?? '');
  const [lens, setLens] = useState<EpisodeViewLens>('daily');
  const [items, setItems] = useState<readonly EpisodeScheduleItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [covers, setCovers] = useState<ReadonlyMap<string, CoverEntry>>(new Map());
  const [dayCounts, setDayCounts] = useState<readonly EpisodeDayCount[]>([]);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const source = useMemo(() => createEpisodeScheduleSource(props.source), [props.source]);
  const filterOptions = useMemo(() => getEpisodeFilterOptions(lens === 'season'), [lens]);
  const rows = useMemo(() => toEpisodeScheduleRows(items, covers), [items, covers]);

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(() => {
    if (selectedDay === '') {
      return;
    }
    setErrorMessage('');
    void source
      .getEpisodeSchedule(selectedDay)
      .then((nextItems) => {
        setItems(nextItems);
      })
      .catch(() => {
        setErrorMessage('Could not load episode schedule.');
      });
  }, [selectedDay, source]);

  const selectDay = useCallback((day: string) => {
    setSelectedDay(day);
  }, []);

  const selectLens = useCallback((nextLens: EpisodeViewLens) => {
    setLens(nextLens);
    setSelectedDay(getDefaultLensSelection(nextLens));
  }, []);

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

  const adjustWatchedEpisodes = useCallback(
    async (animeID: string, delta: number, base: number) => {
      setErrorMessage('');
      const result = await source.adjustWatchedEpisodes(animeID, delta, base);
      if (result.status !== 'ok') {
        setErrorMessage(result.message ?? 'Could not update episode progress.');
        return;
      }
      refresh();
      refreshDayCounts();
    },
    [refresh, refreshDayCounts, source],
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
      refreshDayCounts();
    },
    [refresh, refreshDayCounts, source],
  );

  const runDesktopAction = useCallback(async (action: (animeID: string) => Promise<EpisodeCommandResult>, animeID: string, successToast?: string) => {
    setErrorMessage('');
    const result = await action(animeID);
    if (result.status !== 'ok') {
      setErrorMessage(result.message ?? 'Could not run anime desktop action.');
      return;
    }
    if (successToast !== undefined) {
      toast.success(successToast);
    }
  }, []);

  const openAnimePage = useCallback((animeID: string) => runDesktopAction(source.openAnimePage, animeID), [runDesktopAction, source.openAnimePage]);
  const copyAnimePage = useCallback((animeID: string) => runDesktopAction(source.copyAnimePage, animeID, 'Page URL copied to clipboard'), [runDesktopAction, source.copyAnimePage]);
  const openAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.openAnimeFolder, animeID), [runDesktopAction, source.openAnimeFolder]);
  const copyAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.copyAnimeFolder, animeID, 'Folder path copied to clipboard'), [runDesktopAction, source.copyAnimeFolder]);

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
        setLens(enabled ? 'season' : 'daily');
        setSelectedDay(getInitialEpisodeSelection({ isSeasonMode: enabled }));
      })
      .catch(() => {
        if (isActive) {
          setLens('daily');
        }
      });
    return () => {
      isActive = false;
    };
  }, [props.initialDay, source]);

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-derived-state -- The selected day is interactive UI state that starts from runtime defaults and then diverges through user selection.
    refresh();
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-derived-state -- Day counts come from an async backend query and are not derivable from the local render state.
    refreshDayCounts();
  }, [refreshDayCounts]);

  useEffect(() => {
    // The backend pushes every committed anime change, including writes that
    // never touched this window (mobile, REST API, background downloads).
    // Without this the panel only refreshed on remount, so a mobile update
    // stayed invisible until the user navigated away and back.
    return source.subscribeAnimeChanges(() => {
      refresh();
      refreshDayCounts();
    });
  }, [refresh, refreshDayCounts, source]);

  useEffect(() => {
    const idsToFetch: string[] = [];

    for (const item of items) {
      if (!item.hasCover || fetchedCoverIdsRef.current.has(item.animeId)) {
        continue;
      }

      idsToFetch.push(item.animeId);
    }

    if (idsToFetch.length === 0) {
      return;
    }

    for (const animeID of idsToFetch) {
      fetchedCoverIdsRef.current.add(animeID);
    }

    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Cover placeholders are async fetch state keyed by freshly loaded items, so the loading map must update when the fetched schedule changes.
    setCovers((previous) => {
      const next = new Map(previous);
      for (const animeID of idsToFetch) {
        next.set(animeID, { status: 'loading' });
      }
      return next;
    });

    for (const animeID of idsToFetch) {
      void source
        .getAnimeCover(animeID)
        .then((cover) => {
          setCovers((previous) => {
            const next = new Map(previous);
            next.set(animeID, cover.source === 'cover' && cover.dataUrl !== undefined ? { dataUrl: cover.dataUrl, status: 'cover' } : { status: 'placeholder' });
            return next;
          });
        })
        .catch(() => {
          setCovers((previous) => {
            const next = new Map(previous);
            next.set(animeID, { status: 'placeholder' });
            return next;
          });
        });
    }
  }, [items, source]);

  return {
    adjustWatchedEpisodes,
    copyAnimeFolder,
    copyAnimePage,
    dayCounts,
    errorMessage,
    filterOptions,
    lens,
    openAnimeFolder,
    openAnimePage,
    rows,
    selectDay,
    selectLens,
    selectedDay,
    setAnimeState,
  };
}
