import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../shared/query/test-support/bridge-modules.test-support';
import type { SQLiteStatusSource } from '../sync-status-chip.types';
import { useSyncStatusChip } from '../use-sync-status-chip';

/** Builds a status source whose ping resolves `status`. */
function createFakeSource(getSQLiteStatus = vi.fn().mockResolvedValue('ok')): SQLiteStatusSource {
  return { getSQLiteStatus };
}

/** A query wrapper whose readiness gate reports the backup module ready. */
function readyBackupWrapper() {
  return createModulesTestWrapper({ module: 'backup', state: 'ready' }).wrapper;
}

describe('useSyncStatusChip', () => {
  it('reads the status once through the backup source and links to Devices', async () => {
    const source = createFakeSource();

    const { result } = renderHook(() => useSyncStatusChip(source), { wrapper: readyBackupWrapper() });

    await waitFor(() => {
      expect(result.current.status).toBe('ok');
    });

    expect(result.current.statusTone).toBe('success');
    expect(source.getSQLiteStatus).toHaveBeenCalledTimes(1);
    expect(result.current.linkTo).toBe('/devices');
  });

  it('reports loading before the status resolves', async () => {
    let resolvePromise: ((value: string) => void) | undefined;
    const source = createFakeSource(
      vi.fn().mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolvePromise = resolve;
        }),
      ),
    );

    const { result } = renderHook(() => useSyncStatusChip(source), { wrapper: readyBackupWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe('');

    await waitFor(() => {
      expect(resolvePromise).toBeDefined();
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolvePromise?.('ok');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('shows a failed ping as its message in danger', async () => {
    const source = createFakeSource(vi.fn().mockRejectedValue(createBridgeError('internal', 'database is locked')));

    const { result } = renderHook(() => useSyncStatusChip(source), { wrapper: readyBackupWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe('database is locked');
    expect(result.current.statusTone).toBe('danger');
  });

  it('pings nothing and shows no chip while the backup module starts', async () => {
    const source = createFakeSource();
    const { wrapper } = createModulesTestWrapper({ module: 'backup', state: 'starting' });

    const { result } = renderHook(() => useSyncStatusChip(source), { wrapper });
    await act(async () => {});

    expect(result.current.isLoading).toBe(true);
    expect(source.getSQLiteStatus).not.toHaveBeenCalled();
  });

  it('shows the failed backup module reason in danger without pinging', async () => {
    const source = createFakeSource();
    const { wrapper } = createModulesTestWrapper({ module: 'backup', state: 'failed', reason: 'backup: bridge database was not wired' });

    const { result } = renderHook(() => useSyncStatusChip(source), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toContain('bridge database was not wired');
    expect(result.current.statusTone).toBe('danger');
    expect(source.getSQLiteStatus).not.toHaveBeenCalled();
  });
});
