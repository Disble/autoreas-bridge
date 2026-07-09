import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import { SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE } from './solo-anime-download-panel.constants';
import { getSoloAnimeDownloadOptions } from './solo-anime-download-panel.helpers';
import type { SoloAnimeDownloadState } from './solo-anime-download-panel.types';

/**
 * useSoloAnimeDownloadPanel loads the catalog, owns search/selection state, and
 * calls the one-off anime download binding. The TSX remains dumb: no Wails
 * calls, no effects, no data shaping.
 */
export function useSoloAnimeDownloadPanel(
  animeSource: BridgeRuntimeSource = bridgeRuntimeSource,
  downloadSource: DownloadRuntimeSource = downloadRuntimeSource,
) {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<SoloAnimeDownloadState>({
    items: [],
    query: '',
    selectedAnimeID: undefined,
    status: 'loading',
    errorMessage: undefined,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const options = useMemo(() => getSoloAnimeDownloadOptions(state.items, state.query), [state.items, state.query]);
  const selected = useMemo(
    () => options.find((option) => option.id === state.selectedAnimeID),
    [options, state.selectedAnimeID],
  );
  const canTrigger = useMemo(
    () => selected !== undefined && selected.canDownload && state.status !== 'triggering',
    [selected, state.status],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onQueryChange = useCallback((query: string) => {
    setState((previous) => ({ ...previous, query }));
  }, []);

  const onSelectAnime = useCallback((animeID: string) => {
    setState((previous) => ({ ...previous, selectedAnimeID: animeID, status: 'ready', errorMessage: undefined }));
  }, []);

  const onTriggerDownload = useCallback(async () => {
    const selectedOption = getSoloAnimeDownloadOptions(state.items, state.query).find(
      (option) => option.id === state.selectedAnimeID,
    );

    if (selectedOption === undefined || !selectedOption.canDownload) {
      return;
    }

    setState((previous) => ({ ...previous, status: 'triggering', errorMessage: undefined }));

    try {
      const response = await downloadSource.triggerAnimeDownload(selectedOption.id);
      if (response === 'ok') {
        setState((previous) => ({ ...previous, status: 'success' }));
        return;
      }
      if (response === SOLO_ANIME_DOWNLOAD_IN_PROGRESS_MESSAGE) {
        setState((previous) => ({ ...previous, status: 'already-in-progress' }));
        return;
      }
      setState((previous) => ({ ...previous, status: 'error', errorMessage: response }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to start anime download',
      }));
    }
  }, [downloadSource, state.items, state.query, state.selectedAnimeID]);

  // 7. Effects
  useEffect(() => {
    let active = true;

    animeSource
      .getAnimes()
      .then((items) => {
        if (!active) {
          return;
        }
        setState((previous) => ({ ...previous, items, status: 'ready', errorMessage: undefined }));
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setState((previous) => ({
          ...previous,
          items: [],
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Failed to load animes',
        }));
      });

    return () => {
      active = false;
    };
  }, [animeSource]);

  return {
    status: state.status,
    query: state.query,
    options,
    selected,
    errorMessage: state.errorMessage,
    canTrigger,
    onQueryChange,
    onSelectAnime,
    onTriggerDownload,
  };
}
