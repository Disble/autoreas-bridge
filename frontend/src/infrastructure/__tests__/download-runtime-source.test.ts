import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
        enabledWeekdays: 127,
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

  it('degrades subscribeRunEvents to a no-op unsubscribe when the runtime is unavailable', async () => {
    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
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

    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
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

    const { createDownloadRuntimeSource } = await import('../download-runtime-source');
    const source = createDownloadRuntimeSource();

    const resultPromise = source.getDownloadConfig();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toMatchObject({ hosterPriority: [] });
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

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/download-runtime-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'download-runtime-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/download-runtime-source.ts'))).toBe(false);
    expect(sourceText).toContain("from './download-runtime-source.types'");
    expect(sourceText).toContain("from './download-runtime-source.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+DownloadRuntimeSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(sourceText).not.toMatch(/export const\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
