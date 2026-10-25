import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DownloadRuntimeSource } from '../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { DownloadRunView, ScheduleConfig } from '../../contracts/download.types';
import {
  connectDownloadRuntimeStore,
  getDownloadRuntimeStoreState,
  resetDownloadRuntimeStore,
} from '../download-runtime-store/download-runtime-store.helpers';

/** Schedule snapshot the stubbed port returns unless a case overrides it. */
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

/** One-run history the stubbed port returns unless a case overrides it. */
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

/** Builds a fully stubbed download runtime port, overridable per case. */
function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
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
    subscribeMissedScheduleSettled: vi.fn().mockReturnValue(() => undefined),
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

  it.each([
    {
      readModel: 'schedule',
      stale: { ...scheduleConfig, running: true },
      fresh: { ...scheduleConfig, running: false, lastRunAtMs: 2000 },
      port: 'getScheduleConfig',
      refresh: 'refreshSchedule',
      value: 'scheduleConfig',
    },
    {
      readModel: 'run history',
      stale: [],
      fresh: runHistory,
      port: 'listDownloadRuns',
      refresh: 'refreshRunHistory',
      value: 'runHistory',
    },
  ] as const)('a $readModel read answered after a newer one cannot overwrite it', async ({ stale, fresh, port, refresh, value }) => {
    // Two events re-read back to back (run_finished, then schedule.run_settled) and the
    // first, stale answer arrives last: the store keeps the answer to the latest read.
    let answerStale: (snapshot: typeof stale) => void = () => undefined;
    const source = createSource({
      [port]: vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => {
          answerStale = resolve;
        }))
        .mockResolvedValueOnce(fresh),
    });

    const staleRead = getDownloadRuntimeStoreState()[refresh](source);
    await getDownloadRuntimeStoreState()[refresh](source);
    answerStale(stale);
    await staleRead;

    expect(getDownloadRuntimeStoreState()[value]).toEqual(fresh);
  });

  it.each([
    { readModel: 'schedule', port: 'getScheduleConfig', refresh: 'refreshSchedule', error: 'scheduleErrorMessage' },
    { readModel: 'run history', port: 'listDownloadRuns', refresh: 'refreshRunHistory', error: 'runHistoryErrorMessage' },
  ] as const)('a superseded $readModel read that fails leaves the newer answer without an error', async ({ port, refresh, error }) => {
    let failStale: (reason: Error) => void = () => undefined;
    const source = createSource({
      [port]: vi
        .fn()
        .mockReturnValueOnce(new Promise((_resolve, reject) => {
          failStale = reject;
        }))
        .mockResolvedValueOnce(port === 'getScheduleConfig' ? scheduleConfig : runHistory),
    });

    const staleRead = getDownloadRuntimeStoreState()[refresh](source);
    await getDownloadRuntimeStoreState()[refresh](source);
    failStale(new Error('stale read failed'));
    await staleRead;

    expect(getDownloadRuntimeStoreState()[error]).toBeUndefined();
  });

  it.each([
    { readModel: 'schedule', port: 'getScheduleConfig', refresh: 'refreshSchedule', loaded: 'scheduleHasLoaded', value: 'scheduleConfig', fresh: { ...scheduleConfig, lastRunAtMs: 2000 } },
    { readModel: 'run history', port: 'listDownloadRuns', refresh: 'refreshRunHistory', loaded: 'runHistoryHasLoaded', value: 'runHistory', fresh: runHistory },
  ] as const)('a $readModel read from before a reset stays out even once a newer read is under way', async ({ port, refresh, loaded, value, fresh }) => {
    let answerOld: (snapshot: unknown) => void = () => undefined;
    let answerNew: (snapshot: unknown) => void = () => undefined;
    const source = createSource({
      [port]: vi
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => {
          answerOld = resolve;
        }))
        .mockReturnValueOnce(new Promise((resolve) => {
          answerNew = resolve;
        })),
    });

    const oldRead = getDownloadRuntimeStoreState()[refresh](source);
    resetDownloadRuntimeStore();
    const newRead = getDownloadRuntimeStoreState()[refresh](source);
    answerOld(port === 'getScheduleConfig' ? { ...scheduleConfig, running: true } : []);
    await oldRead;

    expect(getDownloadRuntimeStoreState()[loaded]).toBe(false);

    answerNew(fresh);
    await newRead;

    expect(getDownloadRuntimeStoreState()[value]).toEqual(fresh);
  });

  it.each([
    {
      readModel: 'schedule',
      port: 'getScheduleConfig',
      refresh: 'refreshSchedule',
      failed: { scheduleHasLoaded: true, scheduleErrorMessage: 'Failed to load schedule config' },
    },
    {
      readModel: 'run history',
      port: 'listDownloadRuns',
      refresh: 'refreshRunHistory',
      failed: { runHistory: [], runHistoryHasLoaded: true, runHistoryErrorMessage: 'Failed to load download run history' },
    },
  ] as const)('a failed $readModel read without a message is loaded, empty and says what failed', async ({ port, refresh, failed }) => {
    const source = createSource({ [port]: vi.fn().mockRejectedValue(new Error('')) });

    await getDownloadRuntimeStoreState()[refresh](createSource());
    await getDownloadRuntimeStoreState()[refresh](source);

    expect(getDownloadRuntimeStoreState()).toMatchObject(failed);
  });

  it('a read still in flight when the store resets does not land in the cleared snapshot', async () => {
    let answerSchedule: (snapshot: ScheduleConfig) => void = () => undefined;
    let answerRuns: (snapshot: readonly DownloadRunView[]) => void = () => undefined;
    const source = createSource({
      getScheduleConfig: vi.fn().mockReturnValue(new Promise((resolve) => {
        answerSchedule = resolve;
      })),
      listDownloadRuns: vi.fn().mockReturnValue(new Promise((resolve) => {
        answerRuns = resolve;
      })),
    });

    const scheduleRead = getDownloadRuntimeStoreState().refreshSchedule(source);
    const runsRead = getDownloadRuntimeStoreState().refreshRunHistory(source);
    resetDownloadRuntimeStore();
    answerSchedule(scheduleConfig);
    answerRuns(runHistory);
    await Promise.all([scheduleRead, runsRead]);

    expect(getDownloadRuntimeStoreState().scheduleHasLoaded).toBe(false);
    expect(getDownloadRuntimeStoreState().runHistoryHasLoaded).toBe(false);
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

  it('a backend missed-schedule settlement refreshes the schedule read-model', async () => {
    let settled: (() => void) | undefined;
    const source = createSource({
      getScheduleConfig: vi
        .fn()
        .mockResolvedValueOnce({ ...scheduleConfig, missedNotice: { localDate: '2026-07-26', dueAtMs: 1_721_000_000_000 } })
        .mockResolvedValueOnce({ ...scheduleConfig, missedNotice: undefined }),
      subscribeMissedScheduleSettled: vi.fn().mockImplementation((listener: () => void) => {
        settled = listener;
        return () => undefined;
      }),
    });

    await getDownloadRuntimeStoreState().refreshSchedule(source);
    connectDownloadRuntimeStore(source);
    settled?.();

    // Pressing "Run now"/"Ignore" on the persisted notification record settles
    // the day in the backend, but that carrier has no return value to hand the
    // store the way the Wails binding does. Without this the schedule panel and
    // its persistent toast keep showing a day that is already settled.
    await vi.waitFor(() => expect(getDownloadRuntimeStoreState().scheduleConfig.missedNotice).toBeUndefined());
  });

  it('a settlement arriving before the schedule has ever loaded does not force a read nobody asked for', async () => {
    let settled: (() => void) | undefined;
    const source = createSource({
      // Never resolves, so `scheduleHasLoaded` stays false for the whole test
      // and the not-yet-loaded branch is the one actually exercised.
      getScheduleConfig: vi.fn().mockReturnValue(new Promise<never>(() => undefined)),
      subscribeMissedScheduleSettled: vi.fn().mockImplementation((listener: () => void) => {
        settled = listener;
        return () => undefined;
      }),
    });

    connectDownloadRuntimeStore(source);
    settled?.();
    settled?.();

    // The single call is the one connecting made on its own. A read-model no
    // panel has mounted yet has nothing to correct, and refreshing it here
    // would load the schedule on a screen that never asked for it.
    expect(source.getScheduleConfig).toHaveBeenCalledTimes(1);
  });

  it('a backend missed-schedule settlement leaves the run history alone', async () => {
    let settled: (() => void) | undefined;
    const source = createSource({
      subscribeMissedScheduleSettled: vi.fn().mockImplementation((listener: () => void) => {
        settled = listener;
        return () => undefined;
      }),
    });

    await getDownloadRuntimeStoreState().refreshSchedule(source);
    await getDownloadRuntimeStoreState().refreshRunHistory(source);
    connectDownloadRuntimeStore(source);
    settled?.();

    await vi.waitFor(() => expect(source.getScheduleConfig).toHaveBeenCalledTimes(2));
    // Settling a missed day is not a run. "Run now" that actually downloads
    // emits its own run lifecycle events, which already refresh the history
    // through subscribeRunEvents; "Ignore" starts nothing at all.
    expect(source.listDownloadRuns).toHaveBeenCalledTimes(1);
  });

  it('resetDownloadRuntimeStore disconnects and clears state', () => {
    const unsubscribe = vi.fn();
    const unsubscribeSettled = vi.fn();
    const source = createSource({
      subscribeRunEvents: vi.fn().mockReturnValue(unsubscribe),
      subscribeMissedScheduleSettled: vi.fn().mockReturnValue(unsubscribeSettled),
    });

    connectDownloadRuntimeStore(source);
    getDownloadRuntimeStoreState().selectRun('run-1');
    resetDownloadRuntimeStore();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    // Both subscriptions are released, not just the first one opened. A
    // half-released connection survives a reset and keeps writing into the
    // store the next test just cleared.
    expect(unsubscribeSettled).toHaveBeenCalledTimes(1);
    expect(getDownloadRuntimeStoreState().selectedRunId).toBeUndefined();
    expect(getDownloadRuntimeStoreState().runHistory).toEqual([]);
    expect(getDownloadRuntimeStoreState().shownMissedFailureDates).toEqual([]);
  });
});
