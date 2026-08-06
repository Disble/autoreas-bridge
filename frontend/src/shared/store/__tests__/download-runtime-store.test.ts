import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { DownloadRunView, ScheduleConfig } from '../../contracts/download.types';
import {
  connectDownloadRuntimeStore,
  getDownloadRuntimeStoreState,
  resetDownloadRuntimeStore,
} from '../download-runtime-store/download-runtime-store.helpers';

const scheduleConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
  missedNotice: undefined,
};

const runHistory: readonly DownloadRunView[] = [
  {
    runId: 'run-1',
    startedAtMs: 1_700_000_000_000,
    finishedAtMs: 1_700_000_100_000,
    trigger: 'manual',
    animesChecked: 3,
    episodesFound: 2,
    episodesDownloaded: 2,
    episodesFailed: 0,
    episodesDownloading: 0,
    skippedCount: 1,
    upToDateCount: 0,
    jdAvailable: true,
    status: 'ok',
  },
];

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn().mockResolvedValue(scheduleConfig),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn().mockResolvedValue(runHistory),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('download-runtime-store', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts with empty schedule and run-history read-models', () => {
    const state = getDownloadRuntimeStoreState();

    expect(state.scheduleHasLoaded).toBe(false);
    expect(state.runHistoryHasLoaded).toBe(false);
    expect(state.runHistory).toEqual([]);
    expect(state.selectedRunId).toBeUndefined();
    expect(state.hiddenMissedNoticeDate).toBeUndefined();
    expect(state.activeMissedFailureDate).toBeUndefined();
    expect(state.shownMissedFailureDates).toEqual([]);
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

  it('refreshSchedule stores the latest schedule snapshot', async () => {
    const source = createSource();

    await getDownloadRuntimeStoreState().refreshSchedule(source);

    expect(getDownloadRuntimeStoreState().scheduleConfig).toEqual(scheduleConfig);
    expect(getDownloadRuntimeStoreState().scheduleHasLoaded).toBe(true);
  });

  it('refreshRunHistory stores the latest run-history snapshot', async () => {
    const source = createSource();

    await getDownloadRuntimeStoreState().refreshRunHistory(source);

    expect(getDownloadRuntimeStoreState().runHistory).toEqual(runHistory);
    expect(getDownloadRuntimeStoreState().runHistoryHasLoaded).toBe(true);
  });

  it('connectDownloadRuntimeStore is idempotent across panels', () => {
    const source = createSource();

    const disconnectA = connectDownloadRuntimeStore(source);
    const disconnectB = connectDownloadRuntimeStore(source);

    expect(disconnectA).toBe(disconnectB);
    expect(source.subscribeRunEvents).toHaveBeenCalledTimes(1);

    disconnectA();
  });

  it('connectDownloadRuntimeStore refreshes the schedule and run history on first connection', async () => {
    const source = createSource();

    connectDownloadRuntimeStore(source);

    await vi.waitFor(() => expect(getDownloadRuntimeStoreState().scheduleHasLoaded).toBe(true));
    await vi.waitFor(() => expect(getDownloadRuntimeStoreState().runHistoryHasLoaded).toBe(true));

    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1);
    expect(source.listDownloadRuns).toHaveBeenCalledTimes(1);
  });

  it('run lifecycle events refresh only loaded read-models', async () => {
    let listener: (() => void) | undefined;
    const nextRuns = [{ ...runHistory[0], runId: 'run-2' }] as const;
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...scheduleConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({ ...scheduleConfig, missedNotice: { localDate: '2026-07-27', dueAtMs: 1_721_086_400_000 } }),
      listDownloadRuns: vi.fn().mockResolvedValueOnce(runHistory).mockResolvedValueOnce(nextRuns),
      subscribeRunEvents: vi.fn().mockImplementation((nextListener: () => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    });

    await getDownloadRuntimeStoreState().refreshSchedule(source);
    await getDownloadRuntimeStoreState().refreshRunHistory(source);
    connectDownloadRuntimeStore(source);
    listener?.();

    await vi.waitFor(() => expect(getDownloadRuntimeStoreState().runHistory[0]?.runId).toBe('run-2'));
    await vi.waitFor(() => expect(getDownloadRuntimeStoreState().scheduleConfig.missedNotice?.localDate).toBe('2026-07-27'));
  });

  it('resetDownloadRuntimeStore disconnects and clears state', () => {
    const unsubscribe = vi.fn();
    const source = createSource({ subscribeRunEvents: vi.fn().mockReturnValue(unsubscribe) });

    connectDownloadRuntimeStore(source);
    getDownloadRuntimeStoreState().selectRun('run-1');
    resetDownloadRuntimeStore();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(getDownloadRuntimeStoreState().selectedRunId).toBeUndefined();
    expect(getDownloadRuntimeStoreState().runHistory).toEqual([]);
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual([]);
  });
});
