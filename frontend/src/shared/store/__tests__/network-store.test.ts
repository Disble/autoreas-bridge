import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogEntry } from '../../contracts/observability.types';
import type { ObservabilityLogSource } from '../../../infrastructure/observability-log-source';
import { connectNetworkStore, resetNetworkStore, useNetworkStore } from '../network-store';

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

    resetNetworkStore();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(useNetworkStore.getState().selectedId).toBeNull();
    expect(useNetworkStore.getState().buffer).toEqual([]);
  });
});
