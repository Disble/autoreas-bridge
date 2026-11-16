import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { useDevicesWorkspace } from '../use-devices-workspace';

/**
 * Renders the hook under a query wrapper.
 * @param triggerReconcile The reconcile command the hook runs.
 * @returns The hook render.
 */
function renderWorkspace(triggerReconcile: () => Promise<void>) {
  return renderHook(() => useDevicesWorkspace({ triggerReconcile }), { wrapper: createBridgeQueryTestWrapper().wrapper });
}

describe('useDevicesWorkspace', () => {
  it('starts idle', () => {
    const { result } = renderWorkspace(vi.fn());

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncResult).toBe('');
    expect(result.current.isSyncFailed).toBe(false);
    expect(result.current.syncingAnimeRefreshToken).toBe(0);
  });

  it('reconciles through the source, shows the success feedback and bumps the syncing refresh token', async () => {
    let finishReconcile: () => void = () => undefined;
    const triggerReconcile = vi.fn(() => new Promise<void>((resolve) => (finishReconcile = resolve)));
    const { result } = renderWorkspace(triggerReconcile);

    let syncPromise: Promise<void> | undefined;
    act(() => {
      syncPromise = result.current.onTriggerSync();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(true));
    expect(result.current.syncResult).toBe('');

    await act(async () => {
      finishReconcile();
      await syncPromise;
    });

    expect(triggerReconcile).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.syncResult).toBe('ok'));
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.isSyncFailed).toBe(false);
    expect(result.current.syncingAnimeRefreshToken).toBe(1);
  });

  it('shows the failure message and keeps the syncing refresh token when the reconcile is rejected', async () => {
    const { result } = renderWorkspace(vi.fn().mockRejectedValue(createBridgeError('unavailable', 'sync is starting')));

    await act(async () => {
      await result.current.onTriggerSync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.syncResult).toBe('sync is starting'));
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.isSyncFailed).toBe(true);
    expect(result.current.syncingAnimeRefreshToken).toBe(0);
  });
});
