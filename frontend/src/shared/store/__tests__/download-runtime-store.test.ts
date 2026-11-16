import { afterEach, describe, expect, it } from 'vitest';

import { getDownloadRuntimeStoreState, resetDownloadRuntimeStore } from '../download-runtime-store/download-runtime-store.helpers';

describe('download-runtime-store', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts with no missed-day decision hidden, no failure shown and no run selected', () => {
    const state = getDownloadRuntimeStoreState();

    expect(state.selectedRunId).toBeUndefined();
    expect(state.hiddenMissedNoticeDate).toBeUndefined();
    expect(state.activeMissedFailureDate).toBeUndefined();
    expect(state.shownMissedFailureDates).toEqual([]);
    expect(state.missedNoticeActionMessage).toBeUndefined();
    expect(state.missedNoticeIsResolving).toBe(false);
  });

  it('restores a hidden missed-notice decision date when the controller clears it', () => {
    const state = getDownloadRuntimeStoreState();

    state.hideMissedNoticeDecision('2026-07-26');
    expect(getDownloadRuntimeStoreState().hiddenMissedNoticeDate).toBe('2026-07-26');

    getDownloadRuntimeStoreState().restoreMissedNoticeDecision();

    expect(getDownloadRuntimeStoreState().hiddenMissedNoticeDate).toBeUndefined();
  });

  it('deduplicates the shown global failure dates per renderer session', () => {
    const state = getDownloadRuntimeStoreState();

    state.showMissedScheduleFailure('2026-07-26');
    state.showMissedScheduleFailure('2026-07-26');
    state.showMissedScheduleFailure('2026-07-27');

    expect(getDownloadRuntimeStoreState().activeMissedFailureDate).toBe('2026-07-27');
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual(['2026-07-26', '2026-07-27']);
  });

  it('resetDownloadRuntimeStore clears the selection and the session failure dates', () => {
    getDownloadRuntimeStoreState().selectRun('run-1');
    getDownloadRuntimeStoreState().showMissedScheduleFailure('2026-07-26');

    resetDownloadRuntimeStore();

    expect(getDownloadRuntimeStoreState().selectedRunId).toBeUndefined();
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual([]);
  });
});
