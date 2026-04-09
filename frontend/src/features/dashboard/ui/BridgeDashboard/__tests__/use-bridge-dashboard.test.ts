import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const triggerReconcileMock = vi.fn();

vi.mock('../../../dashboard.bindings', () => ({
  triggerReconcile: () => triggerReconcileMock(),
}));

import { useBridgeDashboard } from '../use-bridge-dashboard';

describe('useBridgeDashboard', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBridgeDashboard());

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('');
  });

  it('reconciles and stores the returned result', async () => {
    let resolvePromise: ((value: string) => void) | undefined;

    triggerReconcileMock.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result } = renderHook(() => useBridgeDashboard());

    let syncPromise: Promise<void> | undefined;

    act(() => {
      syncPromise = result.current.onTriggerSync();
    });

    expect(result.current.isSyncing).toBe(true);

    await act(async () => {
      resolvePromise?.('done');
      await syncPromise;
    });

    expect(triggerReconcileMock).toHaveBeenCalledTimes(1);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('done');
  });
});
