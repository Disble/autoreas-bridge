import { createStore } from 'zustand/vanilla';
import type { DownloadRuntimeStoreState } from './download-runtime-store.types';

/**
 * Vanilla backing store of the Downloads renderer-session UI state. It stays in
 * this file because the allow-list (`ZUSTAND_VANILLA_ALLOW_LIST`) names it here;
 * suppressed in place so the placement is visible rather than disabled repo-wide.
 */
export const downloadRuntimeStore = createStore<DownloadRuntimeStoreState>()((set) => ({ // eslint-disable-line dharness/role-file-shape -- see the block above
  hiddenMissedNoticeDate: undefined,
  activeMissedFailureDate: undefined,
  shownMissedFailureDates: [],
  missedNoticeActionMessage: undefined,
  missedNoticeIsResolving: false,
  selectedRunId: undefined,
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

/** Reads the current Downloads UI state snapshot outside React render. */
export function getDownloadRuntimeStoreState(): DownloadRuntimeStoreState {
  return downloadRuntimeStore.getState();
}

/** Restores the empty renderer-session UI state (tests reset between cases). */
export function resetDownloadRuntimeStore(): void {
  downloadRuntimeStore.setState({
    hiddenMissedNoticeDate: undefined,
    activeMissedFailureDate: undefined,
    shownMissedFailureDates: [],
    missedNoticeActionMessage: undefined,
    missedNoticeIsResolving: false,
    selectedRunId: undefined,
  });
}
