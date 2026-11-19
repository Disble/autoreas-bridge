import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contracts } from '../../../wailsjs/go/models';

describe('downloads-source', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it.each([
    ['getDownloadConfig', 'GetDownloadConfig'],
    ['listDownloadRuns', 'ListDownloadRuns'],
    ['triggerDownloadCheck', 'TriggerDownloadCheck'],
  ] as const)('rejects %s as unavailable while its binding is not attached, answering no fallback', async (call, bindingName) => {
    vi.useFakeTimers();
    const { createDownloadsSource } = await import('../download-runtime-source/downloads-source.helpers');

    const answer = createDownloadsSource()[call]();
    const assertion = expect(answer).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'unavailable',
      message: `the ${bindingName} binding is not attached`,
    });
    // The binding is waited on for the runtime's attach window before it counts as missing.
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });

  it('forwards the config, status, schedule, run and hoster calls to the live Wails bindings, preserving payloads and coded refusals', async () => {
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
    const emptyConfig = {
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
    const setHosterPriorityMock = vi.fn().mockResolvedValue(undefined);
    window.go = {
      desktop: {
        App: {
          GetDownloadConfig: vi.fn().mockResolvedValueOnce(config).mockResolvedValueOnce(emptyConfig),
          CancelDownloadRun: vi.fn().mockRejectedValue(new Error('{"code":"unavailable","message":"downloads is starting"}')),
          SetHosterPriority: setHosterPriorityMock,
          GetJDStatus: getJDStatusMock,
          GetScheduleConfig: getScheduleConfigMock,
          RunMissedScheduleNow: runMissedScheduleNowMock,
          IgnoreMissedSchedule: ignoreMissedScheduleMock,
          ListDownloadRuns: listDownloadRunsMock,
        },
      },
    } as never;

    const { createDownloadsSource } = await import('../download-runtime-source/downloads-source.helpers');
    const source = createDownloadsSource();

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

    await expect(source.getDownloadConfig()).resolves.toEqual(config);
    // A null hosterPriority from Wails normalizes to an empty array.
    await expect(source.getDownloadConfig()).resolves.toMatchObject({ hosterPriority: [] });
    // A refused command rejects with its coded failure.
    await expect(source.cancelDownloadRun()).rejects.toMatchObject({ code: 'unavailable', message: 'downloads is starting' });
    // setHosterPriority carries the configured site.
    const items = [{ hoster: 'mega', priority: 0, enabled: true }];
    await source.setHosterPriority('default', items);
    expect(setHosterPriorityMock).toHaveBeenCalledWith('default', items);
  });

  it('forwards readiness snapshots from the live Wails binding and preserves its top-level rejection', async () => {
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
    const queryError = new Error('catalog unavailable');
    const listDownloadReadinessMock = vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(queryError);
    window.go = { desktop: { App: { ListDownloadReadiness: listDownloadReadinessMock } } } as never;

    const { createDownloadsSource } = await import('../download-runtime-source/downloads-source.helpers');
    const source = createDownloadsSource();

    await expect(source.listDownloadReadiness()).resolves.toEqual(snapshot);
    await expect(source.listDownloadReadiness()).rejects.toThrow('catalog unavailable');
    expect(listDownloadReadinessMock).toHaveBeenCalledTimes(2);
  });

  it('maps generated readiness DTOs into the frontend readiness contract and rejects malformed reason codes', async () => {
    const { mapDownloadReadinessSnapshot } = await import('../download-runtime-source/downloads-source.helpers');
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


  it('forwards SetEpisodeRenameEnabled and passes its refusal through as a rejection', async () => {
    const setEpisodeRenameEnabled = vi.fn().mockResolvedValue(undefined);
    window.go = { desktop: { App: { SetEpisodeRenameEnabled: setEpisodeRenameEnabled } } } as never;
    const { createDownloadsSource } = await import('../download-runtime-source/downloads-source.helpers');

    await expect(createDownloadsSource().setEpisodeRenameEnabled(true)).resolves.toBeUndefined();
    expect(setEpisodeRenameEnabled).toHaveBeenCalledWith(true);

    window.go = {
      desktop: { App: { SetEpisodeRenameEnabled: vi.fn().mockRejectedValue(new Error('{"code":"unavailable","message":"settings is starting"}')) } },
    } as never;
    await expect(createDownloadsSource().setEpisodeRenameEnabled(true)).rejects.toMatchObject({ code: 'unavailable', message: 'settings is starting' });
  });
});
