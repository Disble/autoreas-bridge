import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // 2. State
  const [visibleCount, setVisibleCount] = useState(RUN_HISTORY_PAGE_SIZE);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const runs = useDownloadRuntimeStore((state) => state.runHistory);
  const hasLoaded = useDownloadRuntimeStore((state) => state.runHistoryHasLoaded);
  const errorMessage = useDownloadRuntimeStore((state) => state.runHistoryErrorMessage);
  const selectedRunId = useDownloadRuntimeStore((state) => state.selectedRunId);
  const storeSelectRun = useDownloadRuntimeStore((state) => state.selectRun);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const selectRun = useCallback((runId: string) => {
    storeSelectRun(runId);
  }, [storeSelectRun]);

  // The stopped run finalizes its own terminal row and the run-event stream
  // refreshes the list, so there is nothing to optimistically patch here: only a
  // refusal needs surfacing.
  const cancelRun = useCallback(async () => {
    setCancelErrorMessage(undefined);
    const result = await source.cancelDownloadRun();
    if (result !== 'ok') {
      setCancelErrorMessage(result);
    }
  }, [source]);

  const loadMore = useCallback(() => {
    setVisibleCount((currentVisibleCount) => getNextVisibleRunCount(currentVisibleCount, runs.length));
  }, [runs.length]);

  // Progressive reveal replaces the old "Load N more runs" button. Only the
  // trigger is shared with the Editor/Downloads rails (`isNearListBottom`), not
  // the whole window hook: this list is live, and `useProgressiveListWindow`
  // resets its limit whenever the item count changes, which would snap the user
  // back to the newest 20 every time a run event arrives. `reconcileVisibleRunCount`
  // owns that reconciliation instead, and it must keep owning it.
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
      loadMore();
    }
  }, [loadMore]);

  // 7. Effects
  useEffect(() => {
    connectDownloadRuntimeStore(source);
  }, [source]);

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
  } else if (cancelErrorMessage !== undefined) {
    // A refused stop does not invalidate the history that loaded fine, so the
    // list stays readable and only the message is added.
    viewModel = { ...baseViewModel, errorMessage: cancelErrorMessage };
  }

  return {
    viewModel,
    cancelRun,
    loadMore,
    selectRun,
    scrollRef,
    onScroll,
  };
}
