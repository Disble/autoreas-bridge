import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../infrastructure/backup-source';
import { useBackupImport } from '../use-backup-import';

function buildPreview(overrides: Partial<BackupImportPreviewDTO> = {}): BackupImportPreviewDTO {
  return {
    cancelled: false,
    bundlePath: 'C:/backups/autoreas-backup-20260731-120000.zip',
    formatVersion: 1,
    bridgeVersion: 'dev',
    createdAt: '2026-07-31T12:00:00Z',
    bundleChecksum: 'deadbeef',
    groups: [{ name: 'anime_snapshots', recordCount: 512 }],
    unknownGroups: [],
    absentGroups: [],
    versionNotes: [],
    ...overrides,
  };
}

function buildResult(overrides: Partial<BackupImportResultDTO> = {}): BackupImportResultDTO {
  return {
    importedGroups: [{ name: 'anime_snapshots', recordCount: 512 }],
    failedGroup: '',
    unattemptedGroups: [],
    restorePointPath: 'C:/data/bridge-restore-point-20260731-120000.db',
    errorMessage: '',
    ...overrides,
  };
}

describe('useBackupImport', () => {
  it('starts idle with no preview, no result, and no error', () => {
    const { result } = renderHook(() => useBackupImport({ previewBackupImport: vi.fn(), confirmBackupImport: vi.fn() }));

    expect(result.current.phase).toBe('idle');
    expect(result.current.preview).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('moves to previewed and holds the DTO after a successful preview', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview());
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }));

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('previewed'));
    expect(result.current.preview).toEqual(buildPreview());
  });

  it('returns to idle with no error when the dialog is cancelled', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview({ cancelled: true }));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }));

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.preview).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports a preview error as failed', async () => {
    const previewBackupImport = vi.fn().mockRejectedValue(new Error('not a valid bundle'));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }));

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('failed'));
    expect(result.current.errorMessage).toBe('not a valid bundle');
  });

  it('does nothing when confirm is called with no preview', () => {
    const confirmBackupImport = vi.fn();
    const { result } = renderHook(() => useBackupImport({ previewBackupImport: vi.fn(), confirmBackupImport }));

    act(() => {
      result.current.onConfirm();
    });

    expect(confirmBackupImport).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('passes the previewed bundleChecksum verbatim to confirmBackupImport', async () => {
    const preview = buildPreview({ bundleChecksum: 'the-exact-checksum' });
    const previewBackupImport = vi.fn().mockResolvedValue(preview);
    const confirmBackupImport = vi.fn().mockResolvedValue(buildResult());
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }));

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));

    expect(confirmBackupImport).toHaveBeenCalledWith('the-exact-checksum');
  });

  it('does not fire a second confirm while one is already in flight', async () => {
    const preview = buildPreview();
    const previewBackupImport = vi.fn().mockResolvedValue(preview);
    const deferred: { resolve: (value: BackupImportResultDTO) => void } = { resolve: () => undefined };
    const pending = new Promise<BackupImportResultDTO>((resolve) => {
      deferred.resolve = resolve;
    });
    const confirmBackupImport = vi.fn().mockImplementation(() => pending);
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }));

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applying'));

    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });
    expect(confirmBackupImport).toHaveBeenCalledTimes(1);

    act(() => {
      deferred.resolve(buildResult());
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));
  });

  it('keeps the restore point path visible after a failed apply', async () => {
    const preview = buildPreview();
    const previewBackupImport = vi.fn().mockResolvedValue(preview);
    const confirmBackupImport = vi.fn().mockResolvedValue(
      buildResult({
        importedGroups: [],
        failedGroup: 'seasons',
        unattemptedGroups: ['season_animes'],
        errorMessage: 'insert record 1: UNIQUE constraint failed',
      }),
    );
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }));

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });

    await waitFor(() => expect(result.current.phase).toBe('failed'));
    expect(result.current.result?.restorePointPath).toBe('C:/data/bridge-restore-point-20260731-120000.db');
  });
});
