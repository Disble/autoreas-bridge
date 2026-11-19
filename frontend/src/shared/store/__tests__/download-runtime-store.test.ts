import { afterEach, describe, expect, it } from 'vitest';

import { getDownloadRuntimeStoreState, resetDownloadRuntimeStore } from '../download-runtime-store/download-runtime-store.helpers';

describe('download-runtime-store', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts empty, hides and restores a decision, dedupes shown failures, and resets the session', () => {
    const state = getDownloadRuntimeStoreState();

    expect(state.selectedRunId).toBeUndefined();
    expect(state.hiddenMissedNoticeDate).toBeUndefined();
    expect(state.activeMissedFailureDate).toBeUndefined();
    expect(state.shownMissedFailureDates).toEqual([]);
    expect(state.missedNoticeActionMessage).toBeUndefined();
    expect(state.missedNoticeIsResolving).toBe(false);

    state.hideMissedNoticeDecision('2026-07-26');
    expect(getDownloadRuntimeStoreState().hiddenMissedNoticeDate).toBe('2026-07-26');

    getDownloadRuntimeStoreState().restoreMissedNoticeDecision();

    expect(getDownloadRuntimeStoreState().hiddenMissedNoticeDate).toBeUndefined();

    getDownloadRuntimeStoreState().showMissedScheduleFailure('2026-07-26');
    getDownloadRuntimeStoreState().showMissedScheduleFailure('2026-07-26');
    getDownloadRuntimeStoreState().showMissedScheduleFailure('2026-07-27');

    expect(getDownloadRuntimeStoreState().activeMissedFailureDate).toBe('2026-07-27');
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual(['2026-07-26', '2026-07-27']);

    getDownloadRuntimeStoreState().selectRun('run-1');
    expect(getDownloadRuntimeStoreState().selectedRunId).toBe('run-1');

    resetDownloadRuntimeStore();

    expect(getDownloadRuntimeStoreState().selectedRunId).toBeUndefined();
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual([]);
  });
});
