import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogSource } from '../../../../../infrastructure/observability-log-source';
import type { ObservabilityLogEntry } from '../../../../../shared/contracts/observability.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store';
import { useNetworkPanel } from '../use-network-panel';

function entry(overrides: Partial<ObservabilityLogEntry> = {}): ObservabilityLogEntry {
  return {
    timestamp: '2026-06-20T00:00:00Z',
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

describe('useNetworkPanel', () => {
  afterEach(() => {
    resetNetworkStore();
  });

  it('starts with an empty rows list, no selection, and isLoading true before the replay resolves', () => {
    let resolveRecentLogs: ((value: readonly ObservabilityLogEntry[]) => void) | undefined;
    const source = createFakeSource({
      getRecentLogs: vi.fn().mockImplementation(
        () =>
          new Promise<readonly ObservabilityLogEntry[]>((resolve) => {
            resolveRecentLogs = resolve;
          }),
      ),
    });

    const { result } = renderHook(() => useNetworkPanel(source));

    expect(result.current.rows).toEqual([]);
    expect(result.current.selectedEntry).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => {
      resolveRecentLogs?.([]);
    });
  });

  it('disconnects the shared network bridge when the panel unmounts', () => {
    const unsubscribe = vi.fn();
    const source = createFakeSource({ subscribe: vi.fn().mockReturnValue(unsubscribe) });

    const { unmount } = renderHook(() => useNetworkPanel(source));

    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('exposes one row per entry mapped from the replayed entries once getRecentLogs resolves', async () => {
    const recent = [
      entry({ timestamp: 't1', domain: 'anime', message: 'publishing anime.changed', eventType: 'anime.publish' }),
      entry({ timestamp: 't2', eventType: 'http.request', metadata: { method: 'GET', path: '/sync', status: 200 } }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows.map((row) => row.message)).toEqual(['publishing anime.changed', 'GET /sync']);
  });

  it('does NOT fold rows by correlationId — entries sharing a correlationId still render as separate rows', async () => {
    const recent = [
      entry({ timestamp: 't1', correlationId: 'c1', message: 'first' }),
      entry({ timestamp: 't2', correlationId: 'c1', message: 'second' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });
  });

  it('onSelect sets selectedEntry to the matching entry detail', async () => {
    const recent = [entry({ timestamp: 't1', message: 'hello' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    const rowId = result.current.rows[0].id;

    act(() => {
      result.current.onSelect(rowId);
    });

    expect(result.current.selectedEntry?.message).toBe('hello');
  });

  it('onQueryChange narrows the rows to those matching the query', async () => {
    const recent = [
      entry({ timestamp: 't1', message: 'syncing catalogue' }),
      entry({ timestamp: 't2', message: 'pairing device' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onQueryChange('pair');
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].message).toBe('pairing device');
  });

  it('onLevelFilterChange narrows rows to the matching level', async () => {
    const recent = [
      entry({ timestamp: 't1', level: 'info', message: 'ok' }),
      entry({ timestamp: 't2', level: 'error', message: 'boom' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onLevelFilterChange('error');
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].message).toBe('boom');
  });

  it('reports captureUnavailable as false once loading finishes when the Wails runtime is present', async () => {
    window.go = { main: { App: {} } };
    window.runtime = {};

    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue([]) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.captureUnavailable).toBe(false);

    window.go = undefined;
    window.runtime = undefined;
  });

  it('reports captureUnavailable as true once loading finishes when the Wails runtime is absent', async () => {
    window.go = undefined;
    window.runtime = undefined;

    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue([]) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.captureUnavailable).toBe(true);
  });

  it('defaults detailTab to "general"', async () => {
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue([]) });

    const { result } = renderHook(() => useNetworkPanel(source));

    expect(result.current.detailTab).toBe('general');
  });

  it('onDetailTabChange switches the active detail tab', async () => {
    const recent = [entry({ timestamp: 't1', message: 'hello' })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    act(() => {
      result.current.onSelect(result.current.rows[0].id);
    });

    act(() => {
      result.current.onDetailTabChange('metadata');
    });

    expect(result.current.detailTab).toBe('metadata');
  });

  it('resets detailTab to "general" whenever the selected id changes', async () => {
    const recent = [
      entry({ timestamp: 't1', message: 'first' }),
      entry({ timestamp: 't2', message: 'second' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onSelect(result.current.rows[0].id);
    });
    act(() => {
      result.current.onDetailTabChange('trace');
    });

    expect(result.current.detailTab).toBe('trace');

    act(() => {
      result.current.onSelect(result.current.rows[1].id);
    });

    expect(result.current.detailTab).toBe('general');
  });

  it('onDomainFilterChange narrows rows to the matching domain', async () => {
    const recent = [
      entry({ timestamp: 't1', domain: 'sync', message: 'syncing' }),
      entry({ timestamp: 't2', domain: 'anime', message: 'publishing' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onDomainFilterChange('sync');
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].message).toBe('syncing');
    expect(result.current.domainFilter).toBe('sync');
  });

  it('derives entryCount, errorCount, and shownCount independent of active filters', async () => {
    const recent = [
      entry({ timestamp: 't1', level: 'info', message: 'ok' }),
      entry({ timestamp: 't2', level: 'error', message: 'boom' }),
      entry({ timestamp: 't3', level: 'error', message: 'kaboom' }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(3);
    });

    expect(result.current.entryCount).toBe(3);
    expect(result.current.errorCount).toBe(2);
    expect(result.current.shownCount).toBe(3);

    act(() => {
      result.current.onLevelFilterChange('error');
    });

    expect(result.current.entryCount).toBe(3);
    expect(result.current.errorCount).toBe(2);
    expect(result.current.shownCount).toBe(2);
  });
});
