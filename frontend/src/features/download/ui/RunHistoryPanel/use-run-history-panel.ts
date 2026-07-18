import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { connectDownloadRuntimeStore } from '../../../../shared/store/download-runtime-store/download-runtime-store.helpers';
import { useDownloadRuntimeStore } from '../../../../shared/store/download-runtime-store/download-runtime-store';
import { RUN_HISTORY_PAGE_SIZE } from './run-history-panel.constants';
import { getNextVisibleRunCount, reconcileVisibleRunCount, toRunHistoryPanelViewModel } from './run-history-panel.helpers';

/**
 * useRunHistoryPanel loads the download run history and exposes a
 * `selectRun` action for the master/detail UI: the detail pane (including
 * any `manualLinks` for `jd_offline` runs) is resolved purely from the
 * loaded run list, with no extra round-trip per selection.
 */
export function useRunHistoryPanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs
  const previousRunCountRef = useRef(0);

  // 2. State
  const [visibleCount, setVisibleCount] = useState(RUN_HISTORY_PAGE_SIZE);

  // 3. Context/3rd Party Hooks
  const runs = useDownloadRuntimeStore((state) => state.runHistory);
  const hasLoaded = useDownloadRuntimeStore((state) => state.runHistoryHasLoaded);
  const errorMessage = useDownloadRuntimeStore((state) => state.runHistoryErrorMessage);
  const selectedRunId = useDownloadRuntimeStore((state) => state.selectedRunId);
  const refreshRunHistory = useDownloadRuntimeStore((state) => state.refreshRunHistory);
  const storeSelectRun = useDownloadRuntimeStore((state) => state.selectRun);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const selectRun = useCallback((runId: string) => {
    storeSelectRun(runId);
  }, [storeSelectRun]);

  const loadMore = useCallback(() => {
    setVisibleCount((currentVisibleCount) => getNextVisibleRunCount(currentVisibleCount, runs.length));
  }, [runs.length]);

  // 7. Effects
  useEffect(() => {
    connectDownloadRuntimeStore(source);
  }, [source]);

  useEffect(() => {
    void refreshRunHistory(source);
  }, [refreshRunHistory, source]);

  useEffect(() => {
    setVisibleCount((currentVisibleCount) =>
      reconcileVisibleRunCount(currentVisibleCount, previousRunCountRef.current, runs, selectedRunId),
    );
    previousRunCountRef.current = runs.length;
  }, [runs, selectedRunId]);

  const baseViewModel = toRunHistoryPanelViewModel(runs, selectedRunId, visibleCount);
  let viewModel = baseViewModel;

  if (errorMessage !== undefined) {
    viewModel = { ...baseViewModel, status: 'error' as const, errorMessage };
  } else if (!hasLoaded) {
    viewModel = { ...baseViewModel, status: 'loading' as const };
  }

  return {
    viewModel,
    loadMore,
    selectRun,
  };
}
