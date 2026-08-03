import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackupExportResultDTO } from '../../../../../infrastructure/backup-source/backup-source.types';
import { useBackupPanel } from '../use-backup-panel';

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
  it('starts idle with no result and no error', () => {
    const { result } = renderHook(() => useBackupPanel({ exportBackup: vi.fn() }));

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports success and stores the result after a completed export', async () => {
    const exportBackup = vi.fn().mockResolvedValue(buildResult());
    const { result } = renderHook(() => useBackupPanel({ exportBackup }));

    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.result).toEqual(buildResult());
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports cancelled without an error when the dialog is dismissed', async () => {
    const exportBackup = vi.fn().mockResolvedValue(buildResult({ cancelled: true }));
    const { result } = renderHook(() => useBackupPanel({ exportBackup }));

    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('cancelled'));
    expect(result.current.errorMessage).toBeNull();
  });

  it('surfaces a binding error through describeExportError', async () => {
    const exportBackup = vi.fn().mockRejectedValue(new Error('save dialog failed'));
    const { result } = renderHook(() => useBackupPanel({ exportBackup }));

    act(() => {
      result.current.onExport();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('save dialog failed');
  });

  it('does not fire a second export while one is already in flight', async () => {
    const deferred: { resolve: (value: BackupExportResultDTO) => void } = { resolve: () => undefined };
    const pending = new Promise<BackupExportResultDTO>((resolve) => {
      deferred.resolve = resolve;
    });
    const exportBackup = vi.fn().mockImplementation(() => pending);
    const { result } = renderHook(() => useBackupPanel({ exportBackup }));

    act(() => {
      result.current.onExport();
    });
    await waitFor(() => expect(result.current.status).toBe('busy'));

    act(() => {
      result.current.onExport();
      result.current.onExport();
    });

    expect(exportBackup).toHaveBeenCalledTimes(1);

    act(() => {
      deferred.resolve(buildResult());
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
  });
});
