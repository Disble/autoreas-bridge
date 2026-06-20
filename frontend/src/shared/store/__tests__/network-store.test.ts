import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import type { ObservabilityLogSource } from '../../../infrastructure/observability-log-source';
import { connectNetworkStore, resetNetworkStore, useNetworkStore } from '../network-store';
import { selectFilteredRows } from '../network-store.helpers';

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
    const state = useNetworkStore.getState();

    expect(state.buffer).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.query).toBe('');
    expect(state.statusFilter).toBe('all');
    expect(state.levelFilter).toBe('all');
    expect(state.domainFilter).toBe('all');
  });

  it('ingest appends an entry and caps the buffer at 200', () => {
    const { ingest } = useNetworkStore.getState();

    for (let index = 0; index < 205; index += 1) {
      ingest(entry({ timestamp: `t${index}` }));
    }

    const { buffer } = useNetworkStore.getState();

    expect(buffer).toHaveLength(200);
    expect(buffer[0].timestamp).toBe('t5');
    expect(buffer[199].timestamp).toBe('t204');
  });

  it('seed replaces the buffer with a capped recent snapshot', () => {
    const { seed } = useNetworkStore.getState();
    const recent = Array.from({ length: 3 }, (_, index) => entry({ timestamp: `r${index}` }));

    seed(recent);

    expect(useNetworkStore.getState().buffer).toEqual(recent);
  });

  it('select sets and clears the selected correlationId', () => {
    const { select } = useNetworkStore.getState();

    select('c1');
    expect(useNetworkStore.getState().selectedId).toBe('c1');

    select(null);
    expect(useNetworkStore.getState().selectedId).toBeNull();
  });

  it('setQuery and setStatusFilter update filter state', () => {
    const { setQuery, setStatusFilter } = useNetworkStore.getState();

    setQuery('sync');
    setStatusFilter('error');

    expect(useNetworkStore.getState().query).toBe('sync');
    expect(useNetworkStore.getState().statusFilter).toBe('error');
  });

  it('setLevelFilter updates the level filter state independent of statusFilter', () => {
    const { setLevelFilter } = useNetworkStore.getState();

    setLevelFilter('error');

    expect(useNetworkStore.getState().levelFilter).toBe('error');
  });

  it('setDomainFilter updates the domain filter state independent of other filters', () => {
    const { setDomainFilter } = useNetworkStore.getState();

    setDomainFilter('sync');

    expect(useNetworkStore.getState().domainFilter).toBe('sync');
  });

  it('select keys selection on a per-entry id (not just correlationId)', () => {
    const { select } = useNetworkStore.getState();

    select('__row_1');
    expect(useNetworkStore.getState().selectedId).toBe('__row_1');

    select(null);
    expect(useNetworkStore.getState().selectedId).toBeNull();
  });

  it('connectNetworkStore seeds from getRecentLogs then subscribes to live ingest', async () => {
    const recent = [entry({ timestamp: 'r0' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const disconnect = connectNetworkStore(source);

    await vi.waitFor(() => {
      expect(useNetworkStore.getState().buffer).toEqual(recent);
    });

    expect(source.subscribe).toHaveBeenCalledTimes(1);

    disconnect();
  });

  it('connectNetworkStore is idempotent across multiple calls (single bridge)', () => {
    const source = createFakeSource();

    const disconnectA = connectNetworkStore(source);
    const disconnectB = connectNetworkStore(source);

    expect(disconnectA).toBe(disconnectB);
    expect(source.subscribe).toHaveBeenCalledTimes(1);

    disconnectA();
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

    expect(useNetworkStore.getState().buffer.some((item) => item.timestamp === 'live-1')).toBe(true);

    disconnect();
  });

  it('resetNetworkStore tears down the bridge and clears state', () => {
    const unsubscribeMock = vi.fn();
    const sourceWithUnsubscribe = createFakeSource({ subscribe: vi.fn().mockReturnValue(unsubscribeMock) });

    connectNetworkStore(sourceWithUnsubscribe);
    useNetworkStore.getState().select('c1');
    useNetworkStore.getState().setDomainFilter('sync');

    resetNetworkStore();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(useNetworkStore.getState().selectedId).toBeNull();
    expect(useNetworkStore.getState().buffer).toEqual([]);
    expect(useNetworkStore.getState().levelFilter).toBe('all');
    expect(useNetworkStore.getState().domainFilter).toBe('all');
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
      expect(useNetworkStore.getState().buffer).toHaveLength(3);
    });

    const { buffer, query, statusFilter } = useNetworkStore.getState();
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
      expect(useNetworkStore.getState().buffer.length).toBeGreaterThan(0);
    });

    const { buffer, query, statusFilter } = useNetworkStore.getState();
    const rows = selectFilteredRows(buffer, query, statusFilter);

    expect(rows).toHaveLength(1);

    disconnect();
  });
});
