import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventPage, RuntimeEventQuery } from '../../../../../shared/contracts/runtime-event.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { useNetworkPanel } from '../use-network-panel';
import {
  createFakeSource,
  createPushableSource,
  eventPage,
  eventSummary,
  record,
  scrollNearBottom,
} from './network-panel.test-support';

/**
 * The Runtime Events rail's asynchronous edges, driven through the composition
 * root the way `use-transaction-panel.test.ts` drives its own sync hook: server-
 * side filters, the cursor-paged load-more, the unfiltered domain facet, the
 * live push overlay, disclosed availability, and the persisted sibling lookup.
 */
describe('useNetworkPanelSync (through useNetworkPanel)', () => {
  afterEach(() => {
    resetNetworkStore();
  });

  it('sends the free-text, level, and domain filters to the backend rather than filtering the loaded page', async () => {
    const searchEvents = vi.fn().mockResolvedValue(eventPage([record(1)]));
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onDomainFilterChange('download');
    });
    act(() => {
      result.current.onLevelFilterChange('error');
    });
    act(() => {
      result.current.onQueryChange('timeout');
    });

    await vi.waitFor(() => {
      expect(searchEvents).toHaveBeenLastCalledWith({
        limit: 20,
        filters: { text: 'timeout', level: 'error', domain: 'download' },
      });
    });
  });

  it('derives the domain options from the UNFILTERED summary aggregate, including a domain no hardcoded list held', async () => {
    const summarizeEvents = vi.fn().mockResolvedValue(
      eventSummary([
        { key: 'websocket', count: 1_693 },
        { key: 'download', count: 463 },
      ]),
    );
    const source = createFakeSource({ summarizeEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.domainOptions).toHaveLength(3);
    });

    expect(summarizeEvents).toHaveBeenCalledWith({});
    expect(result.current.domainOptions.map((option) => option.value)).toEqual(['all', 'websocket', 'download']);
  });

  it('keeps the derived domain options while a domain filter is active, so every other domain stays reachable', async () => {
    const summarizeEvents = vi.fn().mockResolvedValue(eventSummary([{ key: 'websocket', count: 2 }, { key: 'download', count: 1 }]));
    const source = createFakeSource({ summarizeEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.domainOptions).toHaveLength(3);
    });

    act(() => {
      result.current.onDomainFilterChange('download');
    });

    await vi.waitFor(() => {
      expect(result.current.domainFilter).toBe('download');
    });

    expect(result.current.domainOptions.map((option) => option.value)).toEqual(['all', 'websocket', 'download']);
    expect(summarizeEvents).toHaveBeenCalledTimes(1);
  });

  it('overlays a live push on top of the persisted page without replacing it', async () => {
    const { source, push } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { occurredAtMs: 5_000, message: 'persisted' })])),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      push({ timestamp: new Date(9_000).toISOString(), domain: 'sync', level: 'info', message: 'pushed live' });
    });

    expect(result.current.rows.map((row) => row.message)).toEqual(['pushed live', 'persisted']);
  });

  it('does not inject a pushed event that falls outside the active domain filter', async () => {
    const { source, push } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { occurredAtMs: 5_000, domain: 'sync', message: 'persisted' })])),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onDomainFilterChange('sync');
    });

    await vi.waitFor(() => {
      expect(result.current.domainFilter).toBe('sync');
    });

    act(() => {
      push({ timestamp: new Date(9_000).toISOString(), domain: 'anime', level: 'info', message: 'other domain' });
    });

    expect(result.current.rows.map((row) => row.message)).not.toContain('other domain');
  });

  it('appends the next cursor page below the existing rows when the window runs past what is loaded', async () => {
    const firstPage = eventPage(Array.from({ length: 50 }, (_unused, index) => record(index)), { nextCursor: 'cursor-1' });
    const secondPage = eventPage(Array.from({ length: 10 }, (_unused, index) => record(100 + index)));
    const searchEvents = vi
      .fn()
      .mockImplementation((query: RuntimeEventQuery) => Promise.resolve(query.cursor === 'cursor-1' ? secondPage : firstPage));
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.entryCount).toBe(50);
    });

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });
    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(60);
    });

    expect(result.current.entryCount).toBe(60);
    expect(searchEvents).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-1', filters: { text: undefined, level: undefined, domain: undefined } });
    expect(result.current.rows[0].message).toBe('event 0');
    expect(result.current.rows[50].message).toBe('event 100');
  });

  it('stops requesting once the backend returned a page carrying no continuation cursor', async () => {
    const searchEvents = vi.fn().mockResolvedValue(eventPage(Array.from({ length: 50 }, (_unused, index) => record(index))));
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.entryCount).toBe(50);
    });

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });
    act(() => {
      result.current.onScroll(scrollNearBottom());
    });
    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(searchEvents).toHaveBeenCalledTimes(1);
  });

  it('issues no second page request while one is already in flight', async () => {
    const firstPage = eventPage(Array.from({ length: 50 }, (_unused, index) => record(index)), { nextCursor: 'cursor-1' });
    let resolveSecondPage: ((value: RuntimeEventPage) => void) | undefined;
    const searchEvents = vi.fn().mockImplementation((query: RuntimeEventQuery) =>
      query.cursor === 'cursor-1'
        ? new Promise<RuntimeEventPage>((resolve) => {
            resolveSecondPage = resolve;
          })
        : Promise.resolve(firstPage),
    );
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.entryCount).toBe(50);
    });

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });
    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(searchEvents).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(searchEvents).toHaveBeenCalledTimes(2);

    act(() => {
      resolveSecondPage?.(eventPage([]));
    });
  });

  it('reports an absent persisted store instead of presenting an empty successful result', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([], { available: false })),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.statusMessage).toContain('no persisted runtime-event store');
    expect(result.current.emptyMessage).toBe(result.current.statusMessage);
  });

  it('reports a failed read as degraded rather than as an old database', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([], { degraded: true })),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.statusMessage).toContain('could not be read');
  });

  it('reports nothing to disclose when the store is available and the read succeeded', async () => {
    const source = createFakeSource({ searchEvents: vi.fn().mockResolvedValue(eventPage([record(1)])) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    expect(result.current.statusMessage).toBeNull();
  });

  it('resolves trace siblings from the persisted store, not from the loaded page', async () => {
    const loadedPage = eventPage([record(2, { occurredAtMs: 2_000, correlationId: 'trace-1', message: 'selected' })]);
    const siblingPage = eventPage([
      record(9, { occurredAtMs: 9_000, correlationId: 'trace-1', message: 'sibling from the store' }),
      record(2, { occurredAtMs: 2_000, correlationId: 'trace-1', message: 'selected' }),
    ]);
    const searchEvents = vi
      .fn()
      .mockImplementation((query: RuntimeEventQuery) =>
        Promise.resolve(query.filters?.correlationId === 'trace-1' ? siblingPage : loadedPage),
      );
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onSelect('event-2');
    });

    await vi.waitFor(() => {
      expect(result.current.selectedDetail?.traceEntries).toHaveLength(2);
    });

    expect(searchEvents).toHaveBeenLastCalledWith({ limit: 20, filters: { correlationId: 'trace-1' } });
    expect(result.current.selectedDetail?.traceEntries.map((entry) => entry.message)).toEqual([
      'selected',
      'sibling from the store',
    ]);
  });

  it('issues no sibling query and reports the absence explicitly for an event with no correlation id', async () => {
    const searchEvents = vi.fn().mockResolvedValue(eventPage([record(1, { message: 'uncorrelated' })]));
    const source = createFakeSource({ searchEvents });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onSelect('event-1');
    });

    expect(result.current.selectedDetail?.hasCorrelation).toBe(false);
    expect(result.current.selectedDetail?.traceEntries).toEqual([]);
    expect(searchEvents).toHaveBeenCalledTimes(1);
  });

  it('releases the live subscription when the panel unmounts', async () => {
    const unsubscribe = vi.fn();
    const source = createFakeSource({ subscribe: vi.fn().mockReturnValue(unsubscribe) });

    const { unmount } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(source.subscribe).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
