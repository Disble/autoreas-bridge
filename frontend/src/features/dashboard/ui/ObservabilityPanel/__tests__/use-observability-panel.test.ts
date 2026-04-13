import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OBSERVABILITY_EVENT_NAME } from '../observability-panel.constants';

const getRecentLogsMock = vi.fn();
const eventsOnMock = vi.fn();

vi.mock('../../../dashboard.bindings', () => ({
  getRecentLogs: () => getRecentLogsMock(),
  subscribeToEvent: (eventName: string, callback: (...data: unknown[]) => void) => eventsOnMock(eventName, callback),
}));

import { useObservabilityPanel } from '../use-observability-panel';

describe('useObservabilityPanel', () => {
  afterEach(() => {
    getRecentLogsMock.mockReset();
    eventsOnMock.mockReset();
  });

  it('loads recent logs on mount', async () => {
    getRecentLogsMock.mockResolvedValueOnce([
      { timestamp: '2026-04-08T00:00:00Z', domain: 'anime', level: 'info', message: 'booted' },
    ]);
    eventsOnMock.mockReturnValue(() => undefined);

    const { result } = renderHook(() => useObservabilityPanel());

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });

    expect(result.current.entries[0]?.entry.message).toBe('booted');
    expect(eventsOnMock).toHaveBeenCalledWith(OBSERVABILITY_EVENT_NAME, expect.any(Function));
  });

  it('appends entries from live events', async () => {
    let handler: ((entry: unknown) => void) | undefined;

    getRecentLogsMock.mockResolvedValueOnce([]);
    eventsOnMock.mockImplementation((_eventName: string, callback: (entry: unknown) => void) => {
      handler = callback;
      return () => undefined;
    });

    const { result } = renderHook(() => useObservabilityPanel());

    await waitFor(() => {
      expect(getRecentLogsMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handler?.({ timestamp: '2026-04-08T00:01:00Z', domain: 'sync', level: 'warn', message: 'queued reconcile' });
    });

    expect(result.current.entries[0]?.entry.message).toBe('queued reconcile');
  });
});
