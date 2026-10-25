import { toast } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { UIEvent } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { isNearListBottom } from '../../../../shared/helpers/progressive-list.helpers';
import { openInDefaultBrowser } from '../../../../shared/helpers/url.helpers';
import { connectDownloadRuntimeStore } from '../../../../shared/store/download-runtime-store/download-runtime-store.helpers';
import { useDownloadRuntimeStore } from '../../../../shared/store/download-runtime-store/download-runtime-store';
import { RUN_HISTORY_PAGE_SIZE } from './run-history-panel.constants';
import { getNextVisibleRunCount, readRequestedRunId, reconcileVisibleRunCount, toRunHistoryPanelViewModel, withLoadOutcome } from './run-history-panel.helpers';
import type { RunHistoryPanelPorts } from './run-history-panel.types';
import { useRunHistoryDetail } from './use-run-history-detail';
import { useRunHistoryStop } from './use-run-history-stop';

/**
 * useRunHistoryPanel loads the download run history and exposes the
 * master/detail actions: selection, the Problems filter, Stop, copy and
 * "Edit anime". The selected run's per-anime breakdown and its covers come
 * from `useRunHistoryDetail`; the Stop control's state from
 * `useRunHistoryStop`.
 */
export function useRunHistoryPanel(source: DownloadRuntimeSource = downloadRuntimeSource, ports: RunHistoryPanelPorts = {}) {
  // 1. Refs
  const previousRunCountRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 2. State
  const [visibleCount, setVisibleCount] = useState(RUN_HISTORY_PAGE_SIZE);
  const [problemsOnly, setProblemsOnly] = useState(false);

  // 3. Context/3rd Party Hooks
  const { search } = useLocation();
  const navigate = useNavigate();
  const runs = useDownloadRuntimeStore((state) => state.runHistory);
  const hasLoaded = useDownloadRuntimeStore((state) => state.runHistoryHasLoaded);
  const errorMessage = useDownloadRuntimeStore((state) => state.runHistoryErrorMessage);
  const selectedRunId = useDownloadRuntimeStore((state) => state.selectedRunId);
  const storeSelectRun = useDownloadRuntimeStore((state) => state.selectRun);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const listViewModel = toRunHistoryPanelViewModel(runs, selectedRunId, visibleCount, problemsOnly);
  const { detail, covers } = useRunHistoryDetail(listViewModel.selectedRun, ports);
  const { cancelRun, isStopping, cancelErrorMessage } = useRunHistoryStop(listViewModel.runningRunId, source);
  const requestedRunId = readRequestedRunId(search);

  // 6. Callbacks (useCallback calling pure helpers)
  const selectRun = useCallback((runId: string) => {
    storeSelectRun(runId);
  }, [storeSelectRun]);

  const toggleProblems = useCallback(() => {
    setProblemsOnly((current) => !current);
  }, []);

  const copyText = useCallback((text: string, confirmation: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(confirmation))
      .catch(() => undefined);
  }, []);

  const openLink = useCallback((url: string) => {
    openInDefaultBrowser(url);
  }, []);

  const editAnime = useCallback((animeId: string) => {
    void navigate(`/editor/${animeId}`);
  }, [navigate]);

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

  // A caller that named a run gets that run selected. It runs on every change to
  // the query rather than once on mount, because a notification pressed while
  // Downloads is already open changes the route without remounting the panel --
  // which is the ordinary case, not the edge one.
  //
  // Keyed on the requested id rather than on `runs`: re-selecting on every
  // history refresh would fight the user's own clicks for the rest of the
  // session, and the panel already falls back to the newest run when the id
  // names nothing it holds.
  useEffect(() => {
    if (requestedRunId !== undefined) {
      storeSelectRun(requestedRunId);
    }
  }, [requestedRunId, storeSelectRun]);

  useEffect(() => {
    setVisibleCount((currentVisibleCount) =>
      reconcileVisibleRunCount(currentVisibleCount, previousRunCountRef.current, runs, selectedRunId),
    );
    previousRunCountRef.current = runs.length;
  }, [runs, selectedRunId]);

  const viewModel = withLoadOutcome({ ...listViewModel, detail, covers, isStopping }, { hasLoaded, errorMessage, cancelErrorMessage });

  return {
    viewModel,
    cancelRun,
    loadMore,
    selectRun,
    scrollRef,
    onScroll,
    toggleProblems,
    copyText,
    editAnime,
    openLink,
  };
}
