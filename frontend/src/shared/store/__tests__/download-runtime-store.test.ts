import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source';
import type { DownloadRunView, ScheduleConfig } from '../../contracts/download.types';
import { connectDownloadRuntimeStore, resetDownloadRuntimeStore, useDownloadRuntimeStore } from '../download-runtime-store';

const scheduleConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
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
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    listDownloadRuns: vi.fn().mockResolvedValue(runHistory),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('download-runtime-store', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
  });

  it('starts with empty schedule and run-history read-models', () => {
    const state = useDownloadRuntimeStore.getState();

    expect(state.scheduleHasLoaded).toBe(false);
    expect(state.runHistoryHasLoaded).toBe(false);
    expect(state.runHistory).toEqual([]);
    expect(state.selectedRunId).toBeUndefined();
  });

  it('refreshSchedule stores the latest schedule snapshot', async () => {
    const source = createSource();

    await useDownloadRuntimeStore.getState().refreshSchedule(source);

    expect(useDownloadRuntimeStore.getState().scheduleConfig).toEqual(scheduleConfig);
    expect(useDownloadRuntimeStore.getState().scheduleHasLoaded).toBe(true);
  });

  it('refreshRunHistory stores the latest run-history snapshot', async () => {
    const source = createSource();

    await useDownloadRuntimeStore.getState().refreshRunHistory(source);

    expect(useDownloadRuntimeStore.getState().runHistory).toEqual(runHistory);
    expect(useDownloadRuntimeStore.getState().runHistoryHasLoaded).toBe(true);
  });

  it('connectDownloadRuntimeStore is idempotent across panels', () => {
    const source = createSource();

    const disconnectA = connectDownloadRuntimeStore(source);
    const disconnectB = connectDownloadRuntimeStore(source);

    expect(disconnectA).toBe(disconnectB);
    expect(source.subscribeRunEvents).toHaveBeenCalledTimes(1);

    disconnectA();
  });

  it('run lifecycle events refresh only loaded read-models', async () => {
    let listener: (() => void) | undefined;
    const nextRuns = [{ ...runHistory[0], runId: 'run-2' }] as const;
    const source = createSource({
      listDownloadRuns: vi.fn().mockResolvedValueOnce(runHistory).mockResolvedValueOnce(nextRuns),
      subscribeRunEvents: vi.fn().mockImplementation((nextListener: () => void) => {
        listener = nextListener;
        return () => undefined;
      }),
    });

    connectDownloadRuntimeStore(source);
    await useDownloadRuntimeStore.getState().refreshRunHistory(source);
    listener?.();

    await vi.waitFor(() => expect(useDownloadRuntimeStore.getState().runHistory[0]?.runId).toBe('run-2'));
    expect(source.getScheduleConfig).not.toHaveBeenCalled();
  });

  it('resetDownloadRuntimeStore disconnects and clears state', () => {
    const unsubscribe = vi.fn();
    const source = createSource({ subscribeRunEvents: vi.fn().mockReturnValue(unsubscribe) });

    connectDownloadRuntimeStore(source);
    useDownloadRuntimeStore.getState().selectRun('run-1');
    resetDownloadRuntimeStore();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(useDownloadRuntimeStore.getState().selectedRunId).toBeUndefined();
    expect(useDownloadRuntimeStore.getState().runHistory).toEqual([]);
  });
});
