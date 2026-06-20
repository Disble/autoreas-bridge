import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObservabilityLogSource } from '../../../../../infrastructure/observability-log-source';
import { OBSERVABILITY_EVENT_NAME } from '../observability-panel.constants';
import { useObservabilityPanel } from '../use-observability-panel';

function createFakeSource(overrides: Partial<ObservabilityLogSource> = {}): ObservabilityLogSource {
  return {
    subscribe: vi.fn().mockReturnValue(() => undefined),
    getRecentLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('useObservabilityPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads recent logs on mount via the injected source', async () => {
    const source = createFakeSource({
      getRecentLogs: vi
        .fn()
        .mockResolvedValue([{ timestamp: '2026-04-08T00:00:00Z', domain: 'anime', level: 'info', message: 'booted' }]),
    });

    const { result } = renderHook(() => useObservabilityPanel(source));

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    expect(result.current.entries[0]?.entry.message).toBe('booted');
    expect(source.subscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it('appends entries from the injected source live stream', async () => {
    let handler: ((entry: unknown) => void) | undefined;
    const source = createFakeSource({
      subscribe: vi.fn().mockImplementation((listener: (entry: unknown) => void) => {
        handler = listener;
        return () => undefined;
      }),
    });

    const { result } = renderHook(() => useObservabilityPanel(source));

    await waitFor(() => {
      expect(source.getRecentLogs).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handler?.({ timestamp: '2026-04-08T00:01:00Z', domain: 'sync', level: 'warn', message: 'queued reconcile' });
    });

    expect(result.current.entries[0]?.entry.message).toBe('queued reconcile');
  });

  it('uses the default singleton source when no source is injected', async () => {
    const { result } = renderHook(() => useObservabilityPanel());

    await waitFor(() => {
      expect(result.current.entries).toEqual([]);
    });
  });

  it('references OBSERVABILITY_EVENT_NAME for backward compatibility with the constants module', () => {
    expect(OBSERVABILITY_EVENT_NAME).toBe('observability.log');
  });
});
