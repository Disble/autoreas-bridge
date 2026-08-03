import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import type { ObservabilityLogSource } from '../../../infrastructure/observability-log-source/observability-log-source.types';
import { connectNetworkStore, getNetworkStoreState, resetNetworkStore, selectFilteredRows } from '../network-store/network-store.helpers';

function entry(overrides: Partial<ObservabilityLogEntry>): ObservabilityLogEntry {
  return {
    timestamp: '2026-06-19T00:00:00Z',
    domain: 'api',
    message: '',
    ...overrides,
  };
}

function createFakeSource(overrides: Partial<ObservabilityLogSource> = {}): ObservabilityLogSource {
  return {
    subscribe: vi.fn().mockReturnValue(() => undefined),
    getRecentLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('network-store', () => {
  afterEach(() => {
    resetNetworkStore();
  });

  it('starts with an empty buffer, no selection, no filters', () => {
    const state = getNetworkStoreState();

    expect(state.buffer).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.query).toBe('');
    expect(state.statusFilter).toBe('all');
    expect(state.levelFilter).toBe('all');
    expect(state.domainFilter).toBe('all');
  });

  it('ingest appends an entry and caps the buffer at 200', () => {
    const { ingest } = getNetworkStoreState();

    for (let index = 0; index < 205; index += 1) {
      ingest(entry({ timestamp: `t${index}` }));
    }

    const { buffer } = getNetworkStoreState();

    expect(buffer).toHaveLength(200);
    expect(buffer[0].timestamp).toBe('t5');
    expect(buffer[199].timestamp).toBe('t204');
  });

  it('seed replaces the buffer with a capped recent snapshot', () => {
    const { seed } = getNetworkStoreState();
    const recent = Array.from({ length: 3 }, (_, index) => entry({ timestamp: `r${index}` }));

    seed(recent);

    expect(getNetworkStoreState().buffer).toEqual(recent);
  });

  it('select sets and clears the selected correlationId', () => {
    const { select } = getNetworkStoreState();

    select('c1');
    expect(getNetworkStoreState().selectedId).toBe('c1');

    select(null);
    expect(getNetworkStoreState().selectedId).toBeNull();
  });

  it('setQuery and setStatusFilter update filter state', () => {
    const { setQuery, setStatusFilter } = getNetworkStoreState();

    setQuery('sync');
    setStatusFilter('error');

    expect(getNetworkStoreState().query).toBe('sync');
    expect(getNetworkStoreState().statusFilter).toBe('error');
  });

  it('setLevelFilter updates the level filter state independent of statusFilter', () => {
    const { setLevelFilter } = getNetworkStoreState();

    setLevelFilter('error');

    expect(getNetworkStoreState().levelFilter).toBe('error');
  });

  it('setDomainFilter updates the domain filter state independent of other filters', () => {
    const { setDomainFilter } = getNetworkStoreState();

    setDomainFilter('sync');

    expect(getNetworkStoreState().domainFilter).toBe('sync');
  });

  it('select keys selection on a per-entry id (not just correlationId)', () => {
    const { select } = getNetworkStoreState();

    select('__row_1');
    expect(getNetworkStoreState().selectedId).toBe('__row_1');

    select(null);
    expect(getNetworkStoreState().selectedId).toBeNull();
  });

  it('connectNetworkStore seeds from getRecentLogs then subscribes to live ingest', async () => {
    const recent = [entry({ timestamp: 'r0' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => {
      expect(getNetworkStoreState().buffer).toEqual(recent);
    });

    expect(source.subscribe).toHaveBeenCalledTimes(1);

    disconnect();
  });

  it('shares one bridge across consumers and releases it after the final disconnect', () => {
    const unsubscribe = vi.fn();
    const source = createFakeSource({ subscribe: vi.fn().mockReturnValue(unsubscribe) });

    const disconnectA = connectNetworkStore(source);
    const disconnectB = connectNetworkStore(source);

    expect(source.subscribe).toHaveBeenCalledTimes(1);

    disconnectA();
    expect(unsubscribe).not.toHaveBeenCalled();

    disconnectB();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('connectNetworkStore forwards live events from subscribe into ingest', async () => {
    let handler: ((entry: ObservabilityLogEntry) => void) | undefined;
    const source = createFakeSource({
      subscribe: vi.fn().mockImplementation((listener: (entry: ObservabilityLogEntry) => void) => {
        handler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => {
      expect(source.subscribe).toHaveBeenCalledTimes(1);
    });

    handler?.(entry({ timestamp: 'live-1' }));

    expect(getNetworkStoreState().buffer.some((item) => item.timestamp === 'live-1')).toBe(true);

    disconnect();
  });

  it('keeps one entry when replay resolves before live delivers the same entry', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const replayedEntry = entry({
      timestamp: 't1',
      correlationId: 'c1',
      eventType: 'http.request',
      message: 'request completed',
      metadata: { method: 'GET', path: '/sync', status: 200 },
    });
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => {
      expect(getNetworkStoreState().buffer).toEqual([replayedEntry]);
    });

    liveHandler?.({ ...replayedEntry, metadata: { status: 200, path: '/sync', method: 'GET' } });

    expect(getNetworkStoreState().buffer).toEqual([replayedEntry]);

    disconnect();
  });

  it('keeps different events that share a correlationId', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const replayedEntry = entry({ correlationId: 'c1', eventType: 'request.started', message: 'started' });
    const liveEntry = entry({ correlationId: 'c1', eventType: 'request.finished', message: 'finished' });
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);
    await vi.waitFor(() => expect(getNetworkStoreState().buffer).toEqual([replayedEntry]));

    liveHandler?.(liveEntry);

    expect(getNetworkStoreState().buffer).toEqual([replayedEntry, liveEntry]);
    disconnect();
  });

  it('keeps the same message when timestamps differ', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const replayedEntry = entry({ timestamp: 't1', message: 'sync complete' });
    const liveEntry = entry({ timestamp: 't2', message: 'sync complete' });
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);
    await vi.waitFor(() => expect(getNetworkStoreState().buffer).toEqual([replayedEntry]));

    liveHandler?.(liveEntry);

    expect(getNetworkStoreState().buffer).toEqual([replayedEntry, liveEntry]);
    disconnect();
  });

  it('keeps distinct entries without correlation IDs', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const replayedEntry = entry({ timestamp: 't1', message: 'request', metadata: { path: '/one' } });
    const liveEntry = entry({ timestamp: 't1', message: 'request', metadata: { path: '/two' } });
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);
    await vi.waitFor(() => expect(getNetworkStoreState().buffer).toEqual([replayedEntry]));

    liveHandler?.(liveEntry);

    expect(getNetworkStoreState().buffer).toEqual([replayedEntry, liveEntry]);
    disconnect();
  });

  it('replay replaces stale pre-connection state', async () => {
    const staleEntry = entry({ timestamp: 'stale' });
    const replayedEntry = entry({ timestamp: 'replayed' });
    getNetworkStoreState().ingest(staleEntry);
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]) });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => expect(getNetworkStoreState().buffer).toEqual([replayedEntry]));
    disconnect();
  });

  it('matches metadata deterministically regardless of key order', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const replayedEntry = entry({ metadata: { method: 'GET', nested: { path: '/sync', status: 200 } } });
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockResolvedValue([replayedEntry]),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);
    await vi.waitFor(() => expect(getNetworkStoreState().buffer).toEqual([replayedEntry]));

    liveHandler?.(entry({ metadata: { nested: { status: 200, path: '/sync' }, method: 'GET' } }));

    expect(getNetworkStoreState().buffer).toEqual([replayedEntry]);
    disconnect();
  });

  it('ignores a replay that resolves after the final disconnect', async () => {
    let resolveRecentLogs: ((value: readonly ObservabilityLogEntry[]) => void) | undefined;
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockImplementation(
        () =>
          new Promise<readonly ObservabilityLogEntry[]>((resolve) => {
            resolveRecentLogs = resolve;
          }),
      ),
    });

    const disconnect = connectNetworkStore(source);
    disconnect();
    resolveRecentLogs?.([entry({ timestamp: 'stale-replay' })]);

    await Promise.resolve();

    expect(getNetworkStoreState().buffer).toEqual([]);
  });

  it('resetNetworkStore tears down the bridge and clears state', () => {
    const unsubscribeMock = vi.fn();
    const sourceWithUnsubscribe = createFakeSource({ subscribe: vi.fn().mockReturnValue(unsubscribeMock) });

    connectNetworkStore(sourceWithUnsubscribe);
    getNetworkStoreState().select('c1');
    getNetworkStoreState().setDomainFilter('sync');

    resetNetworkStore();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(getNetworkStoreState().selectedId).toBeNull();
    expect(getNetworkStoreState().buffer).toEqual([]);
    expect(getNetworkStoreState().levelFilter).toBe('all');
    expect(getNetworkStoreState().domainFilter).toBe('all');
  });

  it('a realistic set of http.request entries (no correlationId) renders N distinct rows end-to-end via connectNetworkStore + selectFilteredRows', async () => {
    const recent = [
      entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } }),
      entry({ timestamp: 't2', metadata: { method: 'POST', path: '/pair', status: 201 } }),
      entry({ timestamp: 't3', metadata: { method: 'GET', path: '/status', status: 200 } }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => {
      expect(getNetworkStoreState().buffer).toHaveLength(3);
    });

    const { buffer, query, statusFilter } = getNetworkStoreState();
    const rows = selectFilteredRows(buffer, query, statusFilter);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.path)).toEqual(['/sync', '/pair', '/status']);

    disconnect();
  });

  it('does not double-render an entry replayed via getRecentLogs AND re-delivered on the live stream before seed resolves', async () => {
    let liveHandler: ((liveEntry: ObservabilityLogEntry) => void) | undefined;
    const sharedEntry = entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } });

    let resolveRecentLogs: ((value: readonly ObservabilityLogEntry[]) => void) | undefined;
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockImplementation(
        () =>
          new Promise<readonly ObservabilityLogEntry[]>((resolve) => {
            resolveRecentLogs = resolve;
          }),
      ),
      subscribe: vi.fn().mockImplementation((listener: (liveEntry: ObservabilityLogEntry) => void) => {
        liveHandler = listener;
        return () => undefined;
      }),
    });

    const disconnect = connectNetworkStore(source);

    // Live stream redelivers the same entry BEFORE the recent-logs replay resolves.
    liveHandler?.(sharedEntry);
    resolveRecentLogs?.([sharedEntry]);

    await vi.waitFor(() => {
      expect(getNetworkStoreState().buffer.length).toBeGreaterThan(0);
    });

    expect(getNetworkStoreState().buffer).toEqual([sharedEntry]);

    disconnect();
  });
});
