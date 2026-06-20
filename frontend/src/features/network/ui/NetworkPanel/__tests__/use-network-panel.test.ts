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
    expect(result.current.selectedRow).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => {
      resolveRecentLogs?.([]);
    });
  });

  it('exposes filtered rows mapped from the replayed entries once getRecentLogs resolves', async () => {
    const recent = [
      entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } }),
      entry({ timestamp: 't2', metadata: { method: 'POST', path: '/pair', status: 201 } }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows.map((row) => row.name)).toEqual(['/sync', '/pair']);
  });

  it('onSelect sets selectedRow to the matching row', async () => {
    const recent = [entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } })];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });

    const rowId = result.current.rows[0].id;

    act(() => {
      result.current.onSelect(rowId);
    });

    expect(result.current.selectedRow?.correlationId).toBe(rowId);
  });

  it('onQueryChange narrows the rows to those matching the query', async () => {
    const recent = [
      entry({ timestamp: 't1', metadata: { method: 'GET', path: '/sync', status: 200 } }),
      entry({ timestamp: 't2', metadata: { method: 'POST', path: '/pair', status: 201 } }),
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
    expect(result.current.rows[0].name).toBe('/pair');
  });

  it('onStatusFilterChange narrows rows to the matching status bucket', async () => {
    const recent = [
      entry({ timestamp: 't1', metadata: { method: 'GET', path: '/ok', status: 200 } }),
      entry({ timestamp: 't2', metadata: { method: 'GET', path: '/fail', status: 500 } }),
    ];
    const source = createFakeSource({ getRecentLogs: vi.fn().mockResolvedValue(recent) });

    const { result } = renderHook(() => useNetworkPanel(source));

    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
    });

    act(() => {
      result.current.onStatusFilterChange('error');
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('/fail');
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
});
