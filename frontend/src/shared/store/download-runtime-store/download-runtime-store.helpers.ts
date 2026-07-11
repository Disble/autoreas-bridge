import { createStore } from 'zustand/vanilla';
import { downloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import { EMPTY_SCHEDULE_CONFIG } from '../../../infrastructure/download-runtime-source/download-runtime-source.constants';
import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE } from './download-runtime-store.constants';
import type { DownloadRuntimeStoreState } from './download-runtime-store.types';

/** Vanilla backing store for the shared Downloads runtime read-model. */
export const downloadRuntimeStore = createStore<DownloadRuntimeStoreState>()((set) => ({
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

/** Reads the current Downloads runtime store snapshot outside React render. */
export function getDownloadRuntimeStoreState(): DownloadRuntimeStoreState {
  return downloadRuntimeStore.getState();
}

/** Writes a partial Downloads runtime store snapshot outside React render. */
function setDownloadRuntimeStoreState(partial: Partial<DownloadRuntimeStoreState>): void {
  downloadRuntimeStore.setState(partial);
}

/**
 * connectDownloadRuntimeStore wires backend run lifecycle events into the
 * shared read-model and stays idempotent across multiple panels.
 */
export function connectDownloadRuntimeStore(source: DownloadRuntimeSource = downloadRuntimeSource): () => void {
  if (DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe !== null) {
    return DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe;
  }

  const unsubscribe = source.subscribeRunEvents(() => {
    const state = getDownloadRuntimeStoreState();

    if (state.scheduleHasLoaded) {
      void state.refreshSchedule(source);
    }

    if (state.runHistoryHasLoaded) {
      void state.refreshRunHistory(source);
    }
  });

  DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe = () => {
    unsubscribe();
    DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe = null;
  };

  return DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe;
}

/**
 * resetDownloadRuntimeStore disconnects the runtime bridge and restores the
 * empty read-model snapshot.
 */
export function resetDownloadRuntimeStore(): void {
  if (DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe !== null) {
    DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe();
  }

  setDownloadRuntimeStoreState({
    scheduleConfig: EMPTY_SCHEDULE_CONFIG,
    scheduleHasLoaded: false,
    scheduleErrorMessage: undefined,
    runHistory: [],
    runHistoryHasLoaded: false,
    runHistoryErrorMessage: undefined,
    selectedRunId: undefined,
  });
}
