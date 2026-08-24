import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contracts } from '../../../wailsjs/go/models';

describe('download-runtime-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('degrades getDownloadConfig to a safe empty default when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.getDownloadConfig();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({
      jd: {
        email: '',
        hasPassword: false,
        deviceName: '',
        exePathOverride: '',
        defaultDestDir: '',
        lastSeenStatus: 'unknown',
        lastSeenAtMs: 0,
      },
      schedule: {
        mode: 'manual',
        dailyTimeHHMM: '',
        enabled: false,
        lastRunAtMs: 0,
        lastRunStatus: '',
        nextRunAtMs: 0,
        running: false,
        enabledWeekdays: 127,
        missedNotice: undefined,
      },
      // No runtime means no site to save to, so the editor has nothing to write
      // back into rather than a guessed scope.
      hosterPrioritySite: '',
      hosterPriority: [],
      renameEpisodes: false,
    });
  });

  it('degrades missed-notice actions to descriptive error results when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const runPromise = source.runMissedScheduleNow('2026-07-26');
    const ignorePromise = source.ignoreMissedSchedule('2026-07-26');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(runPromise).resolves.toEqual({
      kind: 'error',
      localDate: '2026-07-26',
      message: 'runtime unavailable',
    });
    await expect(ignorePromise).resolves.toEqual({
      kind: 'error',
      localDate: '2026-07-26',
      message: 'runtime unavailable',
    });
  });

  it('degrades listDownloadRuns to an empty array when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.listDownloadRuns();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual([]);
  });

  it('rejects readiness queries when the runtime is unavailable instead of fabricating an empty snapshot', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
	const source = createDownloadRuntimeSource();

	const resultPromise = source.listDownloadReadiness();
	const rejection = resultPromise.then(() => undefined, (error: unknown) => error);
	await vi.advanceTimersByTimeAsync(5000);

	await expect(rejection).resolves.toMatchObject({ message: 'runtime unavailable' });
  });

  it('degrades triggerDownloadCheck to a descriptive message when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.triggerDownloadCheck();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toBe('runtime unavailable');
  });

  it('degrades subscribeRunEvents to a no-op unsubscribe when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribeRunEvents(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribes to download run lifecycle/progress events and forwards them to listeners', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeRunEvents(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('download.run_started')?.({ runId: 'run-1' });
    handlers.get('download.run_progress')?.({ runId: 'run-1' });
    handlers.get('download.run_finished')?.({ runId: 'run-1', status: 'ok' });

    expect(listener).toHaveBeenCalledTimes(3);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('download.run_started', expect.any(Function), -1);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('download.run_progress', expect.any(Function), -1);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('download.run_finished', expect.any(Function), -1);

    unsubscribe();
  });

  it('subscribes to the backend missed-schedule settlement event and forwards it to listeners', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribeMissedScheduleSettled(listener);

    await vi.advanceTimersByTimeAsync(5000);

    // The literal name, not the production constant: this string is the wire
    // contract with `resolveMissedStartupAction`'s emit, and asserting through
    // the constant would let a rename move both sides here while every shipped
    // renderer stopped hearing the settlement.
    handlers.get('schedule.missed_settled')?.('2026-07-26');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('schedule.missed_settled', expect.any(Function), -1);

    unsubscribe();
  });

  it('keeps the settlement subscription separate from the run-event one', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    window.runtime = {
      EventsOnMultiple: vi.fn().mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      }),
    } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();
    const runListener = vi.fn();
    const settledListener = vi.fn();
    source.subscribeRunEvents(runListener);
    source.subscribeMissedScheduleSettled(settledListener);

    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('schedule.missed_settled')?.('2026-07-26');

    // Settling a missed day is not a download run. Folding it into the run
    // subscription would also re-read the run history on every "Ignore", which
    // starts nothing.
    expect(settledListener).toHaveBeenCalledTimes(1);
    expect(runListener).not.toHaveBeenCalled();
  });

  it('forwards getDownloadConfig to the live Wails binding once the runtime is ready', async () => {
    const config = {
      jd: {
        email: 'user@example.com',
        hasPassword: true,
        deviceName: 'device',
        exePathOverride: '',
        defaultDestDir: '',
        lastSeenStatus: 'online',
        lastSeenAtMs: 1000,
      },
      schedule: {
        mode: 'daily',
        dailyTimeHHMM: '03:00',
        enabled: true,
        lastRunAtMs: 0,
        lastRunStatus: '',
        nextRunAtMs: 0,
        running: false,
      },
      hosterPriority: [{ hoster: 'mega', priority: 0, enabled: true }],
    };

    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { GetDownloadConfig: vi.fn().mockResolvedValue(config) } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.getDownloadConfig();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual(config);
  });

  it('normalizes null hosterPriority from Wails to an empty array', async () => {
    const config = {
      jd: {
        email: '',
        hasPassword: false,
        deviceName: '',
        exePathOverride: '',
        defaultDestDir: '',
        lastSeenStatus: '',
        lastSeenAtMs: 0,
      },
      schedule: {
        mode: '',
        dailyTimeHHMM: '',
        enabled: false,
        lastRunAtMs: 0,
        lastRunStatus: '',
        nextRunAtMs: 0,
        running: false,
        enabledWeekdays: 0,
      },
      hosterPriority: null,
    };

    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { GetDownloadConfig: vi.fn().mockResolvedValue(config) } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.getDownloadConfig();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toMatchObject({ hosterPriority: [] });
  });

  it('preserves status, schedule, and run payloads returned by live Wails bindings', async () => {
    const jdStatus = { connected: true, status: 'online' };
    const scheduleConfig = {
      enabled: true,
      mode: 'daily',
      dailyTimeHHMM: '03:00',
      missedNotice: { localDate: '2026-07-26', dueAtMs: 1_722_027_600_000, attemptStatus: 'partial' },
    };
    const downloadRuns = [{ id: 'run-1', status: 'finished' }];
    const getJDStatusMock = vi.fn().mockResolvedValue(jdStatus);
    const getScheduleConfigMock = vi.fn().mockResolvedValue(scheduleConfig);
    const listDownloadRunsMock = vi.fn().mockResolvedValue(downloadRuns);
    const runMissedScheduleNowMock = vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', terminalStatus: 'ok' });
    const ignoreMissedScheduleMock = vi.fn().mockResolvedValue({ kind: 'settled', localDate: '2026-07-26', settlementReason: 'ignored' });
    window.go = {
      main: {
        App: {
          GetJDStatus: getJDStatusMock,
          GetScheduleConfig: getScheduleConfigMock,
          RunMissedScheduleNow: runMissedScheduleNowMock,
          IgnoreMissedSchedule: ignoreMissedScheduleMock,
          ListDownloadRuns: listDownloadRunsMock,
        },
      },
    } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    await expect(source.getJDStatus()).resolves.toEqual(jdStatus);
    await expect(source.getScheduleConfig()).resolves.toEqual(scheduleConfig);
    await expect(source.runMissedScheduleNow('2026-07-26')).resolves.toEqual({ kind: 'settled', localDate: '2026-07-26', terminalStatus: 'ok' });
    await expect(source.ignoreMissedSchedule('2026-07-26')).resolves.toEqual({ kind: 'settled', localDate: '2026-07-26', settlementReason: 'ignored' });
    await expect(source.listDownloadRuns()).resolves.toEqual(downloadRuns);
    expect(getJDStatusMock).toHaveBeenCalledTimes(1);
    expect(getScheduleConfigMock).toHaveBeenCalledTimes(1);
    expect(runMissedScheduleNowMock).toHaveBeenCalledWith('2026-07-26');
    expect(ignoreMissedScheduleMock).toHaveBeenCalledWith('2026-07-26');
    expect(listDownloadRunsMock).toHaveBeenCalledTimes(1);
  });

  it('forwards readiness snapshots from the live Wails binding', async () => {
    const snapshot = {
      items: [
        {
          animeId: 'anime-1',
          name: 'Frieren',
          ready: false,
          reasons: ['missing_source', 'invalid_source', 'unsupported_source', 'destination_unresolved'],
          scheduledToday: true,
        },
      ],
      scheduledTotal: 1,
      scheduledReady: 0,
      scheduledBlocked: 1,
    };
    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { ListDownloadReadiness: vi.fn().mockResolvedValue(snapshot) } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    await expect(source.listDownloadReadiness()).resolves.toEqual(snapshot);
  });

  it('maps generated readiness DTOs into the frontend readiness contract', async () => {
    const { mapDownloadReadinessSnapshot } = await import('../download-runtime-source/download-runtime-source.helpers');
    const generatedSnapshot = new contracts.DownloadReadinessSnapshot({
      items: [
        {
          animeId: 'anime-1',
          name: 'Frieren',
          ready: false,
          reasons: ['missing_source', 'invalid_source', 'unsupported_source', 'destination_unresolved'],
          scheduledToday: true,
        },
      ],
      scheduledTotal: 1,
      scheduledReady: 0,
      scheduledBlocked: 1,
    });

    const mapped = mapDownloadReadinessSnapshot(generatedSnapshot);

    expect(mapped).toEqual({
      items: [
        {
          animeId: 'anime-1',
          name: 'Frieren',
          ready: false,
          reasons: ['missing_source', 'invalid_source', 'unsupported_source', 'destination_unresolved'],
          scheduledToday: true,
        },
      ],
      scheduledTotal: 1,
      scheduledReady: 0,
      scheduledBlocked: 1,
    });
    expect(mapped.items).not.toBe(generatedSnapshot.items);
    expect(mapped.items[0]?.reasons).not.toBe(generatedSnapshot.items[0]?.reasons);
  });

  it('rejects malformed generated readiness reason codes', async () => {
    const { mapDownloadReadinessSnapshot } = await import('../download-runtime-source/download-runtime-source.helpers');

    expect(() =>
      mapDownloadReadinessSnapshot(
        new contracts.DownloadReadinessSnapshot({
          items: [{ animeId: 'anime-1', name: 'Frieren', ready: false, reasons: ['unknown_reason'], scheduledToday: false }],
          scheduledTotal: 0,
          scheduledReady: 0,
          scheduledBlocked: 0,
        }),
      ),
    ).toThrow('Unknown download readiness reason: unknown_reason');
  });

  it('preserves top-level readiness query rejections from the Wails binding', async () => {
    const queryError = new Error('catalog unavailable');
    const listDownloadReadinessMock = vi.fn().mockRejectedValue(queryError);
    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { ListDownloadReadiness: listDownloadReadinessMock } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    await expect(source.listDownloadReadiness()).rejects.toThrow('catalog unavailable');
    expect(listDownloadReadinessMock).toHaveBeenCalledTimes(1);
  });

  it('forwards setHosterPriority to the live Wails binding with the configured site', async () => {
    const setHosterPriorityMock = vi.fn().mockResolvedValue('ok');
    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { SetHosterPriority: setHosterPriorityMock } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source/download-runtime-source.helpers');
    const source = createDownloadRuntimeSource();

    const items = [{ hoster: 'mega', priority: 0, enabled: true }];
    const resultPromise = source.setHosterPriority('default', items);
    await vi.advanceTimersByTimeAsync(5000);
    await resultPromise;

    expect(setHosterPriorityMock).toHaveBeenCalledWith('default', items);
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/download-runtime-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'download-runtime-source.types.ts');
    const helperPath = join(sourceRoot, 'download-runtime-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/download-runtime-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });

});
