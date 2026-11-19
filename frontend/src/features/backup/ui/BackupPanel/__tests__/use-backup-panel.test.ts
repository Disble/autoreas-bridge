import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackupExportResultDTO } from '../../../../../shared/contracts/backup.types';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { useBackupPanel } from '../use-backup-panel';

/** Builds a valid export result DTO, overriding only what a case needs. */
function buildResult(overrides: Partial<BackupExportResultDTO> = {}): BackupExportResultDTO {
  return {
    cancelled: false,
    destinationPath: 'C:/backups/backup.zip',
    formatVersion: 1,
    createdAt: '2026-07-31T12:00:00Z',
    groups: [{ name: 'anime_snapshots', recordCount: 3 }],
    bundleChecksum: 'deadbeef',
    ...overrides,
  };
}

describe('useBackupPanel', () => {
  it('starts idle, ignores a second export while one is in flight, and stores the completed result', async () => {
    const deferred: { resolve: (value: BackupExportResultDTO) => void } = { resolve: () => undefined };
    const pending = new Promise<BackupExportResultDTO>((resolve) => {
      deferred.resolve = resolve;
    });
    const exportBackup = vi.fn().mockImplementation(() => pending);
    const { result } = renderHook(() => useBackupPanel({ exportBackup }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();

    act(() => {
      result.current.onExport();
    });
    await waitFor(() => expect(result.current.status).toBe('busy'));

    // Async act flushes the microtasks a mutation runs its function in, so an unguarded call shows.
    await act(async () => {
      result.current.onExport();
      result.current.onExport();
    });

    expect(exportBackup).toHaveBeenCalledTimes(1);

    act(() => {
      deferred.resolve(buildResult());
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.result).toEqual(buildResult());
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports cancelled without an error when the dialog is dismissed', async () => {
    const exportBackup = vi.fn().mockResolvedValue(buildResult({ cancelled: true }));
    const { result } = renderHook(() => useBackupPanel({ exportBackup }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('cancelled'));
    expect(result.current.errorMessage).toBeNull();
  });

  it('surfaces a binding error through describeExportError', async () => {
    const exportBackup = vi.fn().mockRejectedValue(new Error('save dialog failed'));
    const { result } = renderHook(() => useBackupPanel({ exportBackup }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('save dialog failed');
  });

  it('clears a failed export when the next export succeeds', async () => {
    const exportBackup = vi.fn().mockRejectedValueOnce(new Error('backup is starting')).mockResolvedValueOnce(buildResult());
    const { result } = renderHook(() => useBackupPanel({ exportBackup }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onExport();
    });
    await waitFor(() => expect(result.current.errorMessage).toBe('backup is starting'));
    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.errorMessage).toBeNull();
    expect(exportBackup).toHaveBeenCalledTimes(2);
  });
});
