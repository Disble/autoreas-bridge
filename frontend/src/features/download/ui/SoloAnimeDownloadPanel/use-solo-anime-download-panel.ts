import { useCallback, useMemo, useState } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DOWNLOADS_READINESS_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import {
  canTriggerSoloDownload,
  countSoloAnimeDownloadReadiness,
  getSoloAnimeDownloadEmptyMessage,
  findSoloAnimeDownloadSelection,
  getSoloAnimeDownloadOptions,
  soloReadinessItems,
  soloReadinessStatus,
  toSoloAnimeDownloadFilter,
  toSoloTriggerFailureState,
} from './solo-anime-download-panel.helpers';
import type { SoloAnimeDownloadFilter, SoloAnimeDownloadState } from './solo-anime-download-panel.types';

/**
 * useSoloAnimeDownloadPanel loads the catalog, owns search/filter/selection
 * state, windows the rail, and calls the one-off anime download binding. The TSX
 * remains dumb: no Wails calls, no effects, no data shaping. The catalog is the
 * downloads module's readiness query; a failed read shows no anime.
 *
 * @param downloadSource The downloads port the catalog and the trigger go through.
 * @returns The panel state and its actions.
 */
export function useSoloAnimeDownloadPanel(
  downloadSource: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE,
) {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<SoloAnimeDownloadState>({
    query: '',
    filter: 'ready',
    selectedAnimeID: undefined,
    status: 'ready',
    errorMessage: undefined,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const readinessQuery = useBridgeQuery({
    queryKey: DOWNLOADS_READINESS_KEY,
    queryFn: () => downloadSource.listDownloadReadiness(),
    module: 'downloads',
  });
  const { mutateAsync: triggerAnimeDownload } = useBridgeMutation({
    mutationFn: (animeId: string) => downloadSource.triggerAnimeDownload(animeId),
  });

  // 5. Derived State (useMemo)
  const readinessView = toAsyncView(readinessQuery, () => false);
  const items = soloReadinessItems(readinessView);
  const { status, errorMessage } = soloReadinessStatus(readinessView.kind, state.status, state.errorMessage, readinessQuery.error);
  const options = useMemo(
    () => getSoloAnimeDownloadOptions(items, state.query, state.filter),
    [items, state.query, state.filter],
  );
  const counts = useMemo(
    () => countSoloAnimeDownloadReadiness(items, state.query),
    [items, state.query],
  );
  const emptyMessage = useMemo(
    () => getSoloAnimeDownloadEmptyMessage(state.filter, state.query, counts),
    [counts, state.filter, state.query],
  );
  // Selection resolves against the whole catalog, not the visible tab, so
  // switching tabs or typing a search never silently drops what the user picked.
  const selected = useMemo(
    () => findSoloAnimeDownloadSelection(items, state.selectedAnimeID),
    [items, state.selectedAnimeID],
  );
  const canTrigger = useMemo(
    () => canTriggerSoloDownload(selected, status),
    [selected, status],
  );
  const listWindow = useProgressiveListWindow(options.length);
  const visibleOptions = useMemo(
    () => options.slice(0, listWindow.visibleCount),
    [options, listWindow.visibleCount],
  );
  const { refetch } = readinessQuery;

  // 6. Callbacks (useCallback calling pure helpers)
  const onQueryChange = useCallback((query: string) => {
    setState((previous) => ({ ...previous, query }));
  }, []);

  const onFilterChange = useCallback((value: string) => {
    const filter = toSoloAnimeDownloadFilter(value);
    setState((previous) => ({ ...previous, filter }));
  }, []);

  const onSelectAnime = useCallback((animeID: string) => {
    setState((previous) => ({ ...previous, selectedAnimeID: animeID, status: 'ready', errorMessage: undefined }));
  }, []);

  const onRetry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'ready', errorMessage: undefined }));
    void refetch();
  }, [refetch]);

  const onTriggerDownload = useCallback(async () => {
    const selectedItem = items.find((candidate) => candidate.animeId === state.selectedAnimeID);

    if (selectedItem?.ready !== true) {
      return;
    }

    setState((previous) => ({ ...previous, status: 'triggering', errorMessage: undefined }));

    try {
      await triggerAnimeDownload(selectedItem.animeId);
      setState((previous) => ({ ...previous, status: 'success' }));
    } catch (error) {
      setState((previous) => toSoloTriggerFailureState(previous, error));
    }
  }, [items, state.selectedAnimeID, triggerAnimeDownload]);

  // 7. Effects

  return {
    status,
    query: state.query,
    filter: state.filter,
    options: visibleOptions,
    counts,
    emptyMessage,
    selected,
    errorMessage,
    canTrigger,
    listWindow,
    onRetry,
    onQueryChange,
    onFilterChange,
    onSelectAnime,
    onTriggerDownload,
  };
}
