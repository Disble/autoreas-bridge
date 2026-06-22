import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
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
      },
      hosterPriority: [],
    });
  });

  it('degrades listDownloadRuns to an empty array when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.listDownloadRuns();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual([]);
  });

  it('degrades triggerDownloadCheck to a descriptive message when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.triggerDownloadCheck();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toBe('runtime unavailable');
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

    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.getDownloadConfig();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual(config);
  });

  it('forwards setHosterPriority to the live Wails binding with the configured site', async () => {
    const setHosterPriorityMock = vi.fn().mockResolvedValue('ok');
    window.runtime = { EventsOnMultiple: vi.fn().mockReturnValue(() => undefined) } as never;
    window.go = { main: { App: { SetHosterPriority: setHosterPriorityMock } } } as never;

    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
    const source = createDownloadRuntimeSource();

    const items = [{ hoster: 'mega', priority: 0, enabled: true }];
    const resultPromise = source.setHosterPriority('default', items);
    await vi.advanceTimersByTimeAsync(5000);
    await resultPromise;

    expect(setHosterPriorityMock).toHaveBeenCalledWith('default', items);
  });
});
