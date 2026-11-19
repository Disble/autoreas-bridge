import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../shared/contracts/backup.types';
import { loadKeymapOverrides } from '../../../../../shared/keyboard/keymap-load.helpers';
import { createBridgeQueryTestWrapper } from '../../../../../shared/query/test-support/bridge-query.test-support';
import { useBackupImport } from '../use-backup-import';

vi.mock('../../../../../shared/keyboard/keymap-load.helpers', () => ({
  loadKeymapOverrides: vi.fn(),
}));

/** Builds a valid preview DTO, overriding only what a case needs. */
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

/** Builds a valid apply-result DTO, overriding only what a case needs. */
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
  it('starts idle with nothing held, and ignores a confirm before any preview', () => {
    const confirmBackupImport = vi.fn();
    const { result } = renderHook(() => useBackupImport({ previewBackupImport: vi.fn(), confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    expect(result.current.phase).toBe('idle');
    expect(result.current.preview).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();

    act(() => {
      result.current.onConfirm();
    });

    expect(confirmBackupImport).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('holds the previewed DTO, then drops it and its error when the user cancels', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview());
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('previewed'));
    expect(result.current.preview).toEqual(buildPreview());

    act(() => {
      result.current.onCancel();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.preview).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('returns to idle with no error when the dialog is cancelled', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview({ cancelled: true }));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.preview).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports a preview error as failed', async () => {
    const previewBackupImport = vi.fn().mockRejectedValue(new Error('not a valid bundle'));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });

    await waitFor(() => expect(result.current.phase).toBe('failed'));
    expect(result.current.errorMessage).toBe('not a valid bundle');
  });

  it('does not fire a second confirm while one is already in flight', async () => {
    const preview = buildPreview();
    const previewBackupImport = vi.fn().mockResolvedValue(preview);
    const deferred: { resolve: (value: BackupImportResultDTO) => void } = { resolve: () => undefined };
    const pending = new Promise<BackupImportResultDTO>((resolve) => {
      deferred.resolve = resolve;
    });
    const confirmBackupImport = vi.fn().mockImplementation(() => pending);
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applying'));

    // Async act flushes the microtasks a mutation runs its function in, so an unguarded call shows.
    await act(async () => {
      result.current.onConfirm();
      result.current.onConfirm();
      result.current.onPreview();
    });
    expect(confirmBackupImport).toHaveBeenCalledTimes(1);
    expect(previewBackupImport).toHaveBeenCalledTimes(1);

    act(() => {
      deferred.resolve(buildResult());
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));
  });

  it('does not fire a second preview while one is already in flight', async () => {
    const previewBackupImport = vi.fn().mockImplementation(() => new Promise<BackupImportPreviewDTO>(() => undefined));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport: vi.fn() }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewing'));
    await act(async () => {
      result.current.onPreview();
    });

    expect(previewBackupImport).toHaveBeenCalledTimes(1);
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
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

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

describe('post-import keymap refresh', () => {
  beforeEach(() => {
    vi.mocked(loadKeymapOverrides).mockClear();
  });

  // The sole-group positive case ("a successful confirm naming
  // keyboard_keymap calls the loader") is deliberately not repeated here: it
  // is proven end-to-end, through the real loader and the real keyboard
  // store rather than this mock, by
  // use-backup-import.keymap-refresh.test.ts.

  it('reloads the keymap store when keyboard_keymap lands alongside other imported groups, not only when it is the sole one', async () => {
    // Kills the `.some()` -> `.every()` mutant: a single-element array carrying
    // only keyboard_keymap cannot distinguish the two, since both agree there.
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview());
    const confirmBackupImport = vi.fn().mockResolvedValue(
      buildResult({
        importedGroups: [
          { name: 'anime_snapshots', recordCount: 5 },
          { name: 'keyboard_keymap', recordCount: 1 },
        ],
      }),
    );
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));

    expect(vi.mocked(loadKeymapOverrides)).toHaveBeenCalledTimes(1);
  });

  it('confirms with the previewed checksum verbatim and leaves the keymap alone without keyboard_keymap', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview({ bundleChecksum: 'the-exact-checksum' }));
    const confirmBackupImport = vi.fn().mockResolvedValue(buildResult());
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('applied'));

    expect(confirmBackupImport).toHaveBeenCalledWith('the-exact-checksum');
    expect(vi.mocked(loadKeymapOverrides)).not.toHaveBeenCalled();
  });

  it('does not reload the keymap store when confirm fails', async () => {
    const previewBackupImport = vi.fn().mockResolvedValue(buildPreview());
    const confirmBackupImport = vi.fn().mockRejectedValue(new Error('apply failed'));
    const { result } = renderHook(() => useBackupImport({ previewBackupImport, confirmBackupImport }), { wrapper: createBridgeQueryTestWrapper().wrapper });

    act(() => {
      result.current.onPreview();
    });
    await waitFor(() => expect(result.current.phase).toBe('previewed'));

    act(() => {
      result.current.onConfirm();
    });
    await waitFor(() => expect(result.current.phase).toBe('failed'));

    expect(vi.mocked(loadKeymapOverrides)).not.toHaveBeenCalled();
  });
});
