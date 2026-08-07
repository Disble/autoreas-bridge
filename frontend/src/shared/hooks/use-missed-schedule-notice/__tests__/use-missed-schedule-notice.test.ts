import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { ScheduleConfig } from '../../../contracts/download.types';
import { resetDownloadRuntimeStore, getDownloadRuntimeStoreState } from '../../../store/download-runtime-store/download-runtime-store.helpers';
import { useMissedScheduleNotice } from '../use-missed-schedule-notice';

const baseConfig: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
  missedNotice: {
    localDate: '2026-07-26',
    dueAtMs: 1_721_000_000_000,
  },
};

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn().mockResolvedValue(baseConfig),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', terminalStatus: 'ok' }),
    ignoreMissedSchedule: vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', settlementReason: 'ignored' }),
    listDownloadRuns: vi.fn().mockResolvedValue([]),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

async function seedSchedule(source: DownloadRuntimeSource): Promise<void> {
  await getDownloadRuntimeStoreState().refreshSchedule(source);
}

describe('useMissedScheduleNotice', () => {
  afterEach(() => {
    resetDownloadRuntimeStore();
    vi.clearAllMocks();
  });

  it('connects the runtime store and loads the missed schedule notice on mount', async () => {
    const source = createSource();

    const { result } = renderHook(() => useMissedScheduleNotice(source));

    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.decisionNotice).toEqual(baseConfig.missedNotice));
    expect(result.current.failureNotice).toBeUndefined();
  });

  it('exposes the backend-owned decision notice from the shared runtime store', async () => {
    const source = createSource();

    await seedSchedule(source);

    const { result } = renderHook(() => useMissedScheduleNotice(source));

    expect(result.current.decisionNotice).toEqual(baseConfig.missedNotice);
    expect(result.current.failureNotice).toBeUndefined();
  });

  it('hides the decision UI immediately after Run now is accepted locally, then promotes terminal failure to one global alert', async () => {
    const deferred = createDeferred<{ kind: string; localDate: string; terminalStatus: string }>();
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce(baseConfig)
        .mockResolvedValueOnce({
          ...baseConfig,
          missedNotice: { ...baseConfig.missedNotice!, attemptStatus: 'partial' },
        }),
      runMissedScheduleNow: vi.fn().mockReturnValue(deferred.promise),
    });

    await seedSchedule(source);

    const { result } = renderHook(() => useMissedScheduleNotice(source));
    let runNowPromise!: Promise<void>;

    act(() => {
      runNowPromise = result.current.runNow('2026-07-26');
    });

    expect(result.current.decisionNotice).toBeUndefined();
    expect(result.current.isResolving).toBe(true);

    deferred.resolve({ kind: 'unresolved_terminal', localDate: '2026-07-26', terminalStatus: 'partial' });
    await runNowPromise;

    await waitFor(() => expect(result.current.failureNotice?.localDate).toBe('2026-07-26'));
    expect(result.current.actionMessage).toContain('partial');
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual(['2026-07-26']);
  });

  it('keeps the decision notice available and surfaces safe feedback when Ignore is rejected', async () => {
    const source = createSource({
      ignoreMissedSchedule: vi.fn().mockResolvedValue({
        kind: 'error',
        localDate: '2026-07-26',
        message: 'runtime unavailable',
      }),
    });

    await seedSchedule(source);

    const { result } = renderHook(() => useMissedScheduleNotice(source));

    await act(async () => {
      await result.current.ignore('2026-07-26');
    });

    expect(result.current.decisionNotice?.localDate).toBe('2026-07-26');
    expect(result.current.actionMessage).toBe('runtime unavailable');
    expect(result.current.failureNotice).toBeUndefined();
  });
});
