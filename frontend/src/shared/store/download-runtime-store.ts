import { create } from 'zustand';

import { downloadRuntimeSource } from '../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../infrastructure/download-runtime-source';
import type { ScheduleConfig } from '../contracts/download.types';
import type { DownloadRuntimeStoreState } from './download-runtime-store.types';

const EMPTY_SCHEDULE_CONFIG: ScheduleConfig = {
  mode: 'manual',
  dailyTimeHHMM: '',
  enabled: false,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: 127,
};

/**
 * useDownloadRuntimeStore is the single frontend read-model for Downloads.
 * Wails remains behind DownloadRuntimeSource; this store owns the snapshots
 * that multiple panels render and centralizes event-driven invalidation.
 */
export const useDownloadRuntimeStore = create<DownloadRuntimeStoreState>((set) => ({
  scheduleConfig: EMPTY_SCHEDULE_CONFIG,
  scheduleHasLoaded: false,
  scheduleErrorMessage: undefined,
  runHistory: [],
  runHistoryHasLoaded: false,
  runHistoryErrorMessage: undefined,
  selectedRunId: undefined,
  refreshSchedule: async (source) => {
    try {
      const scheduleConfig = await source.getScheduleConfig();
      set({ scheduleConfig, scheduleHasLoaded: true, scheduleErrorMessage: undefined });
    } catch (error) {
      set({
        scheduleHasLoaded: true,
        scheduleErrorMessage: error instanceof Error ? error.message : 'Failed to load schedule config',
      });
    }
  },
  refreshRunHistory: async (source) => {
    try {
      const runHistory = await source.listDownloadRuns();
      set({ runHistory, runHistoryHasLoaded: true, runHistoryErrorMessage: undefined });
    } catch (error) {
      set({
        runHistory: [],
        runHistoryHasLoaded: true,
        runHistoryErrorMessage: error instanceof Error ? error.message : 'Failed to load download run history',
      });
    }
  },
  selectRun: (selectedRunId) => set({ selectedRunId }),
}));

/** Single active Wails lifecycle subscription for the download read-model. */
let runtimeUnsubscribe: (() => void) | null = null;

/**
 * connectDownloadRuntimeStore wires backend run lifecycle events into the
 * shared read-model. It is idempotent so several panels can mount without
 * creating duplicate Wails event subscriptions.
 */
export function connectDownloadRuntimeStore(source: DownloadRuntimeSource = downloadRuntimeSource): () => void {
  if (runtimeUnsubscribe !== null) {
    return runtimeUnsubscribe;
  }

  const unsubscribe = source.subscribeRunEvents(() => {
    const state = useDownloadRuntimeStore.getState();

    if (state.scheduleHasLoaded) {
      void state.refreshSchedule(source);
    }

    if (state.runHistoryHasLoaded) {
      void state.refreshRunHistory(source);
    }
  });

  runtimeUnsubscribe = () => {
    unsubscribe();
    runtimeUnsubscribe = null;
  };

  return runtimeUnsubscribe;
}

/** Test-only seam: disconnect the runtime bridge and restore empty snapshots. */
export function resetDownloadRuntimeStore(): void {
  if (runtimeUnsubscribe !== null) {
    runtimeUnsubscribe();
  }

  useDownloadRuntimeStore.setState({
    scheduleConfig: EMPTY_SCHEDULE_CONFIG,
    scheduleHasLoaded: false,
    scheduleErrorMessage: undefined,
    runHistory: [],
    runHistoryHasLoaded: false,
    runHistoryErrorMessage: undefined,
    selectedRunId: undefined,
  });
}
