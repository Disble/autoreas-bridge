import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleConfig, ScheduleMissedActionResult } from '../../../contracts/download.types';
import { status } from '../../../query/test-support/readiness-source.test-support';
import { getDownloadRuntimeStoreState, resetDownloadRuntimeStore } from '../../../store/download-runtime-store/download-runtime-store.helpers';
import { useDownloadSchedule } from '../use-download-schedule';
import { useMissedScheduleNotice } from '../use-missed-schedule-notice';
import { createDeferred, createDownloadsSourceFake, createDownloadsWrapper, DOWNLOADS_SCHEDULE_FIXTURE } from './downloads.test-support';

/** Schedule snapshot every case starts from, with one missed day pending. */
const baseConfig: ScheduleConfig = {
  ...DOWNLOADS_SCHEDULE_FIXTURE,
  missedNotice: {
    localDate: '2026-07-26',
    dueAtMs: 1_721_000_000_000,
  },
};

/**
 * Renders the notice hook under a downloads wrapper whose module is ready.
 * @param source The downloads port the hook reads through.
 * @returns The hook result and the wrapper's controls.
 */
function renderNotice(source: ReturnType<typeof createDownloadsSourceFake>) {
  const downloads = createDownloadsWrapper();
  return { ...renderHook(() => useMissedScheduleNotice(source), { wrapper: downloads.wrapper }), ...downloads };
}

describe('useMissedScheduleNotice', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    vi.clearAllMocks();
  });

  it('loads the backend-owned missed schedule notice on mount', async () => {
    const source = createDownloadsSourceFake({ getScheduleConfig: vi.fn().mockResolvedValue(baseConfig) });

    const { result } = renderNotice(source);

    await waitFor(() => expect(result.current.decisionNotice).toEqual(baseConfig.missedNotice));
    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1);
    expect(result.current.failureNotice).toBeUndefined();
  });

  it('reads nothing while the downloads module is starting', async () => {
    const source = createDownloadsSourceFake({ getScheduleConfig: vi.fn().mockResolvedValue(baseConfig) });
    const downloads = createDownloadsWrapper(status('downloads', 'starting'));

    const { result } = renderHook(() => useMissedScheduleNotice(source), { wrapper: downloads.wrapper });
    await act(async () => undefined);

    expect(source.getScheduleConfig).not.toHaveBeenCalled();
    expect(result.current.decisionNotice).toBeUndefined();
  });

  it('hides the decision UI immediately after Run now is accepted locally, then promotes terminal failure to one global alert', async () => {
    const deferred = createDeferred<ScheduleMissedActionResult>();
    const source = createDownloadsSourceFake({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce(baseConfig)
        .mockResolvedValueOnce({
          ...baseConfig,
          missedNotice: { ...baseConfig.missedNotice!, attemptStatus: 'partial' },
        }),
      runMissedScheduleNow: vi.fn().mockReturnValue(deferred.promise),
    });

    const { result } = renderNotice(source);
    await waitFor(() => expect(result.current.decisionNotice).toBeDefined());
    let runNowPromise!: Promise<void>;

    act(() => {
      runNowPromise = result.current.runNow('2026-07-26');
    });

    await waitFor(() => expect(result.current.decisionNotice).toBeUndefined());
    expect(result.current.isResolving).toBe(true);

    deferred.resolve({ kind: 'unresolved_terminal', localDate: '2026-07-26', terminalStatus: 'partial' });
    await act(async () => runNowPromise);

    await waitFor(() => expect(result.current.failureNotice?.localDate).toBe('2026-07-26'));
    expect(source.getScheduleConfig).toHaveBeenCalledTimes(2);
    expect(result.current.actionMessage).toContain('partial');
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual(['2026-07-26']);
  });

  it('keeps the decision notice available and surfaces safe feedback when Ignore is rejected', async () => {
    const source = createDownloadsSourceFake({
      getScheduleConfig: vi.fn().mockResolvedValue(baseConfig),
      ignoreMissedSchedule: vi.fn().mockResolvedValue({ kind: 'error', localDate: '2026-07-26', message: 'runtime unavailable' }),
    });

    const { result } = renderNotice(source);
    await waitFor(() => expect(result.current.decisionNotice).toBeDefined());

    await act(async () => {
      await result.current.ignore('2026-07-26');
    });

    expect(result.current.decisionNotice?.localDate).toBe('2026-07-26');
    expect(result.current.actionMessage).toBe('runtime unavailable');
    expect(result.current.failureNotice).toBeUndefined();
  });

  it('shows the command failure as the action message and restores the decision', async () => {
    const source = createDownloadsSourceFake({
      getScheduleConfig: vi.fn().mockResolvedValue(baseConfig),
      runMissedScheduleNow: vi.fn().mockRejectedValue(new Error('downloads is starting')),
    });

    const { result } = renderNotice(source);
    await waitFor(() => expect(result.current.decisionNotice).toBeDefined());

    await act(async () => {
      await result.current.runNow('2026-07-26');
    });

    expect(result.current.actionMessage).toBe('downloads is starting');
    expect(result.current.decisionNotice?.localDate).toBe('2026-07-26');
    expect(result.current.isResolving).toBe(false);
  });
});

describe('useDownloadSchedule invalidations', () => {
  it.each(['download.run_finished', 'schedule.run_settled', 'schedule.missed_settled'])('%s re-reads the schedule', async (eventName) => {
    const source = createDownloadsSourceFake();
    const downloads = createDownloadsWrapper();
    renderHook(() => useDownloadSchedule(source), { wrapper: downloads.wrapper });
    await waitFor(() => expect(source.getScheduleConfig).toHaveBeenCalledTimes(1));

    act(() => downloads.emitEvent(eventName));

    await waitFor(() => expect(source.getScheduleConfig).toHaveBeenCalledTimes(2));
  });

  it('an answer to a read that a newer read superseded never replaces the newer answer', async () => {
    // Two events re-read back to back (run_finished, then schedule.run_settled) and the
    // first, stale answer arrives last: the schedule keeps the answer to the latest read.
    const stale = createDeferred<ScheduleConfig>();
    const fresh = { ...DOWNLOADS_SCHEDULE_FIXTURE, lastRunAtMs: 2000 };
    const source = createDownloadsSourceFake({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce(DOWNLOADS_SCHEDULE_FIXTURE)
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValueOnce(fresh),
    });
    const downloads = createDownloadsWrapper();
    const { result } = renderHook(() => useDownloadSchedule(source), { wrapper: downloads.wrapper });
    await waitFor(() => expect(result.current.data).toEqual(DOWNLOADS_SCHEDULE_FIXTURE));

    act(() => downloads.emitEvent('download.run_finished'));
    await waitFor(() => expect(source.getScheduleConfig).toHaveBeenCalledTimes(2));
    act(() => downloads.emitEvent('schedule.run_settled'));
    await waitFor(() => expect(result.current.data).toEqual(fresh));
    await act(async () => stale.resolve({ ...DOWNLOADS_SCHEDULE_FIXTURE, running: true }));

    expect(result.current.data).toEqual(fresh);
  });
});
