import { createStore } from 'zustand/vanilla';
import { downloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import { EMPTY_SCHEDULE_CONFIG } from '../../../infrastructure/download-runtime-source/download-runtime-source.constants';
import { toErrorMessage } from '../../helpers/error-message.helpers';
import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE } from './download-runtime-store.constants';
import type { DownloadRuntimeStoreState } from './download-runtime-store.types';

/**
 * Vanilla backing store for the shared Downloads runtime read-model.
 *
 * `notification-store` keeps its instance in `.constants.ts`, which is where
 * this one belongs too. It stays here for now because this file's own
 * `.constants.ts` holds `DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE`, which the
 * connect/reset functions below mutate -- moving the store across would put the
 * initializer and the subscription state on opposite sides of an import this
 * bugfix has no reason to rearrange. Suppressed in place so the debt is visible
 * rather than silently disabled repo-wide.
 */
export const downloadRuntimeStore = createStore<DownloadRuntimeStoreState>()((set) => ({ // eslint-disable-line dharness/role-file-shape -- see the block above: pending the same move notification-store already made
  scheduleConfig: EMPTY_SCHEDULE_CONFIG,
  scheduleHasLoaded: false,
  scheduleErrorMessage: undefined,
  hiddenMissedNoticeDate: undefined,
  activeMissedFailureDate: undefined,
  shownMissedFailureDates: [],
  missedNoticeActionMessage: undefined,
  missedNoticeIsResolving: false,
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
        scheduleErrorMessage: toErrorMessage(error, 'Failed to load schedule config'),
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
        runHistoryErrorMessage: toErrorMessage(error, 'Failed to load download run history'),
      });
    }
  },
  hideMissedNoticeDecision: (localDate) => set({ hiddenMissedNoticeDate: localDate }),
  restoreMissedNoticeDecision: () => set({ hiddenMissedNoticeDate: undefined }),
  showMissedScheduleFailure: (localDate) =>
    set((state) => {
      if (state.shownMissedFailureDates.includes(localDate)) {
        return state.activeMissedFailureDate === localDate ? state : {};
      }

      return {
        activeMissedFailureDate: localDate,
        shownMissedFailureDates: [...state.shownMissedFailureDates, localDate],
      };
    }),
  clearMissedScheduleFailure: () => set({ activeMissedFailureDate: undefined }),
  setMissedNoticeActionMessage: (message) => set({ missedNoticeActionMessage: message }),
  setMissedNoticeResolving: (isResolving) => set({ missedNoticeIsResolving: isResolving }),
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

  // A missed day settled somewhere this store cannot see the answer of -- a
  // "Run now"/"Ignore" token pressed on the persisted notification record,
  // which returns to the notification center and not to us. Only the schedule
  // is re-read: settling a day is not a run.
  const unsubscribeMissedScheduleSettled = source.subscribeMissedScheduleSettled(() => {
    const state = getDownloadRuntimeStoreState();

    if (state.scheduleHasLoaded) {
      void state.refreshSchedule(source);
    }
  });

  const state = getDownloadRuntimeStoreState();

  if (!state.scheduleHasLoaded) {
    void state.refreshSchedule(source);
  }

  if (!state.runHistoryHasLoaded) {
    void state.refreshRunHistory(source);
  }

  DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE.runtimeUnsubscribe = () => {
    unsubscribe();
    unsubscribeMissedScheduleSettled();
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
    hiddenMissedNoticeDate: undefined,
    activeMissedFailureDate: undefined,
    shownMissedFailureDates: [],
    missedNoticeActionMessage: undefined,
    missedNoticeIsResolving: false,
    runHistory: [],
    runHistoryHasLoaded: false,
    runHistoryErrorMessage: undefined,
    selectedRunId: undefined,
  });
}
