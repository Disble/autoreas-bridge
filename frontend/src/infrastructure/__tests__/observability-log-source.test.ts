import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('observability-log-source', () => {
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

  it('resolves an empty array from getRecentLogs when the Go runtime is absent', async () => {
    const { createObservabilityLogSource } = await import('../observability-log-source');
    const source = createObservabilityLogSource();

    const recentLogsPromise = source.getRecentLogs();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(recentLogsPromise).resolves.toEqual([]);
  });

  it('reports the runtime as available when Go bindings and the runtime object exist', async () => {
    const { isWailsRuntimeAvailable } = await import('../observability-log-source');

    window.go = { main: { App: {} } } as never;
    window.runtime = {} as never;

    expect(isWailsRuntimeAvailable()).toBe(true);
  });

  it('reports the runtime as unavailable when the runtime object is null', async () => {
    const { isWailsRuntimeAvailable } = await import('../observability-log-source');

    window.go = { main: { App: {} } } as never;
    window.runtime = null as never;

    expect(isWailsRuntimeAvailable()).toBe(false);
  });

  it('resolves recent logs from the Go runtime once bindings become ready', async () => {
    const { createObservabilityLogSource, WAILS_BINDINGS_POLL_MS } = await import('../observability-log-source');
    const source = createObservabilityLogSource();
    const getRecentLogsMock = vi.fn().mockResolvedValue([{ timestamp: 't1', domain: 'anime', message: 'booted' }]);

    const recentLogsPromise = source.getRecentLogs();

    window.go = {
      main: {
        App: {
          GetRecentLogs: getRecentLogsMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(recentLogsPromise).resolves.toEqual([{ timestamp: 't1', domain: 'anime', message: 'booted' }]);
  });

  it('degrades subscribe to a no-op unsubscribe when the runtime is absent', async () => {
    const { createObservabilityLogSource } = await import('../observability-log-source');
    const source = createObservabilityLogSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shares a single singleton across multiple subscribers (no duplicate Wails subscriptions)', async () => {
    const { createObservabilityLogSource } = await import('../observability-log-source');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const sourceA = createObservabilityLogSource();
    const sourceB = createObservabilityLogSource();

    expect(sourceA).toBe(sourceB);

    const unsubscribeA = sourceA.subscribe(vi.fn());
    const unsubscribeB = sourceB.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    expect(eventsOnMultipleMock).toHaveBeenCalledTimes(1);

    unsubscribeA();
    unsubscribeB();
  });

  it('forwards live runtime events to subscribed listeners', async () => {
    const { createObservabilityLogSource } = await import('../observability-log-source');
    let handler: ((entry: unknown) => void) | undefined;
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((_eventName: string, callback: (entry: unknown) => void) => {
        handler = callback;
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createObservabilityLogSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handler?.({ timestamp: 't2', domain: 'sync', message: 'queued reconcile' });

    expect(listener).toHaveBeenCalledWith({ timestamp: 't2', domain: 'sync', message: 'queued reconcile' });

    unsubscribe();
  });

  it('releases the runtime listener once the last subscriber unsubscribes', async () => {
    const { createObservabilityLogSource } = await import('../observability-log-source');
    const runtimeUnsubscribeMock = vi.fn();
    const eventsOnMultipleMock = vi.fn().mockReturnValue(runtimeUnsubscribeMock);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createObservabilityLogSource();
    const unsubscribe = source.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    unsubscribe();

    expect(runtimeUnsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/observability-log-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'observability-log-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/observability-log-source.ts'))).toBe(false);
    expect(sourceText).toContain("from './observability-log-source.types'");
    expect(sourceText).toContain("from './observability-log-source.helpers'");
    expect(sourceText).toContain("from '../wails-bindings.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+ObservabilityLogSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(sourceText).not.toMatch(/export const\s+observabilityLogSource\b/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });

});
