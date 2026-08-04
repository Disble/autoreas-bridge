import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE } from './solo-anime-download-panel.constants';
import {
  countSoloAnimeDownloadReadiness,
  getSoloAnimeDownloadEmptyMessage,
  getSoloAnimeDownloadOptions,
  toSoloAnimeDownloadOption,
} from './solo-anime-download-panel.helpers';
import type { SoloAnimeDownloadFilter, SoloAnimeDownloadState } from './solo-anime-download-panel.types';

/**
 * useSoloAnimeDownloadPanel loads the catalog, owns search/filter/selection
 * state, windows the rail, and calls the one-off anime download binding. The TSX
 * remains dumb: no Wails calls, no effects, no data shaping.
 */
export function useSoloAnimeDownloadPanel(
  downloadSource: DownloadRuntimeSource = downloadRuntimeSource,
) {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<SoloAnimeDownloadState>({
    items: [],
    query: '',
    filter: 'ready',
    selectedAnimeID: undefined,
    status: 'loading',
    errorMessage: undefined,
  });
  const [retryCount, setRetryCount] = useState(0);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const options = useMemo(
    () => getSoloAnimeDownloadOptions(state.items, state.query, state.filter),
    [state.items, state.query, state.filter],
  );
  const counts = useMemo(
    () => countSoloAnimeDownloadReadiness(state.items, state.query),
    [state.items, state.query],
  );
  const emptyMessage = useMemo(
    () => getSoloAnimeDownloadEmptyMessage(state.filter, state.query, counts),
    [counts, state.filter, state.query],
  );
  // Selection resolves against the whole catalog, not the visible tab, so
  // switching tabs or typing a search never silently drops what the user picked.
  const selected = useMemo(() => {
    const item = state.items.find((candidate) => candidate.animeId === state.selectedAnimeID);
    return item === undefined ? undefined : toSoloAnimeDownloadOption(item);
  }, [state.items, state.selectedAnimeID]);
  const canTrigger = useMemo(
    () => selected !== undefined && selected.ready && state.status !== 'triggering',
    [selected, state.status],
  );
  const listWindow = useProgressiveListWindow(options.length);
  const visibleOptions = useMemo(
    () => options.slice(0, listWindow.visibleCount),
    [options, listWindow.visibleCount],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onQueryChange = useCallback((query: string) => {
    setState((previous) => ({ ...previous, query }));
  }, []);

  const onFilterChange = useCallback((value: string) => {
    const filter: SoloAnimeDownloadFilter = value === 'blocked' ? 'blocked' : 'ready';
    setState((previous) => ({ ...previous, filter }));
  }, []);

  const onSelectAnime = useCallback((animeID: string) => {
    setState((previous) => ({ ...previous, selectedAnimeID: animeID, status: 'ready', errorMessage: undefined }));
  }, []);

  const onRetry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const onTriggerDownload = useCallback(async () => {
    const selectedItem = state.items.find((candidate) => candidate.animeId === state.selectedAnimeID);

    if (selectedItem === undefined || !selectedItem.ready) {
      return;
    }

    setState((previous) => ({ ...previous, status: 'triggering', errorMessage: undefined }));

    try {
      const response = await downloadSource.triggerAnimeDownload(selectedItem.animeId);
      if (response === 'ok') {
        setState((previous) => ({ ...previous, status: 'success' }));
        return;
      }
      if (response === SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE) {
        setState((previous) => ({ ...previous, status: 'already-in-progress' }));
        return;
      }
      setState((previous) => ({ ...previous, status: 'trigger-error', errorMessage: response }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'trigger-error',
        errorMessage: toErrorMessage(error, 'Failed to start anime download'),
      }));
    }
  }, [downloadSource, state.items, state.selectedAnimeID]);

  // 7. Effects
  useEffect(() => {
    let active = true;

    downloadSource.listDownloadReadiness()
      .then((snapshot) => {
        if (!active) {
          return;
        }
        setState((previous) => ({ ...previous, items: snapshot.items, status: 'ready', errorMessage: undefined }));
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setState((previous) => ({
          ...previous,
          items: [],
          status: 'readiness-error',
          errorMessage: toErrorMessage(error, 'Failed to load animes'),
        }));
      });

    return () => {
      active = false;
    };
  }, [downloadSource, retryCount]);

  return {
    status: state.status,
    query: state.query,
    filter: state.filter,
    options: visibleOptions,
    counts,
    emptyMessage,
    selected,
    errorMessage: state.errorMessage,
    canTrigger,
    listWindow,
    onRetry,
    onQueryChange,
    onFilterChange,
    onSelectAnime,
    onTriggerDownload,
  };
}
