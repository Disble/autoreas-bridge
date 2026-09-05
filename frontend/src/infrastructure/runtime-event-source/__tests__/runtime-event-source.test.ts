import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime-event-source', () => {
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

  it('degrades searchEvents to an unavailable, degraded page when the bindings are absent', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const source = createRuntimeEventSource();

    const pagePromise = source.searchEvents({});

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pagePromise).resolves.toEqual({
      items: [],
      appliedLimit: 0,
      malformedRowsSkipped: 0,
      warningCount: 0,
      available: false,
      degraded: true,
    });
  });

  it('degrades summarizeEvents to a zeroed, degraded aggregation when the bindings are absent', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const source = createRuntimeEventSource();

    const summaryPromise = source.summarizeEvents({});

    await vi.advanceTimersByTimeAsync(5000);

    await expect(summaryPromise).resolves.toEqual({
      byDomain: [],
      byLevel: [],
      byEventType: [],
      samples: [],
      available: false,
      degraded: true,
    });
  });

  it('calls SearchRuntimeEvents with the mapped wire query once the bindings become ready', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createRuntimeEventSource();
    const searchMock = vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 50,
      malformedRowsSkipped: 0,
      warningCount: 0,
      available: true,
      degraded: false,
    });

    const pagePromise = source.searchEvents({
      limit: 50,
      cursor: '1756500000000:412',
      filters: { domain: 'download', level: 'error', text: 'timeout', startMs: 10, endMs: 20 },
    });

    window.go = { desktop: { App: { SearchRuntimeEvents: searchMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await pagePromise;

    expect(searchMock).toHaveBeenCalledWith({
      Limit: 50,
      Cursor: '1756500000000:412',
      Filters: {
        Domain: 'download',
        Level: 'error',
        EventType: '',
        CorrelationID: '',
        EntityID: '',
        Text: 'timeout',
        StartMS: 10,
        EndMS: 20,
      },
    });
  });

  it('sends an empty filter set and no cursor for a first unfiltered page', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createRuntimeEventSource();
    const searchMock = vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 0,
      malformedRowsSkipped: 0,
      warningCount: 0,
      available: true,
      degraded: false,
    });

    const pagePromise = source.searchEvents({});

    window.go = { desktop: { App: { SearchRuntimeEvents: searchMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await pagePromise;

    expect(searchMock).toHaveBeenCalledWith({
      Limit: 0,
      Cursor: '',
      Filters: {
        Domain: '',
        Level: '',
        EventType: '',
        CorrelationID: '',
        EntityID: '',
        Text: '',
        StartMS: undefined,
        EndMS: undefined,
      },
    });
  });

  it('calls SummarizeRuntimeEvents with the mapped wire filters once the bindings become ready', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createRuntimeEventSource();
    const summarizeMock = vi.fn().mockResolvedValue({
      byDomain: [{ key: 'websocket', count: 1693 }],
      byLevel: [],
      byEventType: [],
      samples: [],
      available: true,
      degraded: false,
    });

    const summaryPromise = source.summarizeEvents({});

    window.go = { desktop: { App: { SummarizeRuntimeEvents: summarizeMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(summaryPromise).resolves.toEqual({
      byDomain: [{ key: 'websocket', count: 1693 }],
      byLevel: [],
      byEventType: [],
      samples: [],
      available: true,
      degraded: false,
    });
    expect(summarizeMock).toHaveBeenCalledWith({
      Domain: '',
      Level: '',
      EventType: '',
      CorrelationID: '',
      EntityID: '',
      Text: '',
      StartMS: undefined,
      EndMS: undefined,
    });
  });

  it('degrades subscribe to a no-op unsubscribe when the runtime is absent', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    const source = createRuntimeEventSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('forwards live runtime events to subscribed listeners', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    let handler: ((entry: unknown) => void) | undefined;
    const eventsOnMultipleMock = vi.fn().mockImplementation((_eventName: string, callback: (entry: unknown) => void) => {
      handler = callback;
      return () => undefined;
    });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createRuntimeEventSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handler?.({ timestamp: 't2', domain: 'sync', message: 'queued reconcile' });

    expect(listener).toHaveBeenCalledWith({ timestamp: 't2', domain: 'sync', message: 'queued reconcile' });

    unsubscribe();
  });

  it('ignores an undefined runtime payload instead of forwarding it as an entry', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');
    let handler: ((entry: unknown) => void) | undefined;
    const eventsOnMultipleMock = vi.fn().mockImplementation((_eventName: string, callback: (entry: unknown) => void) => {
      handler = callback;
      return () => undefined;
    });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createRuntimeEventSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handler?.(undefined);

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('shares a single singleton across multiple createRuntimeEventSource calls', async () => {
    const { createRuntimeEventSource } = await import('../runtime-event-source.helpers');

    expect(createRuntimeEventSource()).toBe(createRuntimeEventSource());
  });

  it('reports the runtime-event bindings as unavailable when they are absent', async () => {
    const { isRuntimeEventSourceAvailable } = await import('../runtime-event-source.helpers');

    expect(isRuntimeEventSourceAvailable()).toBe(false);
  });

  it('reports the runtime-event bindings as available once both reads are attached', async () => {
    const { isRuntimeEventSourceAvailable } = await import('../runtime-event-source.helpers');

    window.go = { desktop: { App: { SearchRuntimeEvents: vi.fn(), SummarizeRuntimeEvents: vi.fn() } } } as never;

    expect(isRuntimeEventSourceAvailable()).toBe(true);
  });

  it('reports the runtime-event bindings as unavailable when only the search read is attached', async () => {
    const { isRuntimeEventSourceAvailable } = await import('../runtime-event-source.helpers');

    window.go = { desktop: { App: { SearchRuntimeEvents: vi.fn() } } } as never;

    expect(isRuntimeEventSourceAvailable()).toBe(false);
  });

  it('reports the runtime-event bindings as unavailable when only the summary read is attached', async () => {
    const { isRuntimeEventSourceAvailable } = await import('../runtime-event-source.helpers');

    window.go = { desktop: { App: { SummarizeRuntimeEvents: vi.fn() } } } as never;

    expect(isRuntimeEventSourceAvailable()).toBe(false);
  });

  it('keeps source-adapter declarations in colocated sibling modules with no barrel', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/runtime-event-source');

    expect(existsSync(join(sourceRoot, 'index.ts'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'runtime-event-source.types.ts'))).toBe(true);
    expect(existsSync(join(sourceRoot, 'runtime-event-source.constants.ts'))).toBe(true);
    expect(existsSync(join(sourceRoot, 'runtime-event-source.helpers.ts'))).toBe(true);
  });
});
