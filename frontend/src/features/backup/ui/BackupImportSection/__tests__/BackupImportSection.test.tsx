import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../shared/contracts/backup.types';
import type { BackupImportPhase } from '../backup-import-section.types';

/** Spy for the hook's preview action. */
const onPreview = vi.fn();
/** Spy for the hook's confirm action. */
const onConfirm = vi.fn();
/** Spy for the hook's cancel action. */
const onCancel = vi.fn();
/** The mocked hook's state; each case sets the fields it renders. */
const hookState: {
  phase: BackupImportPhase;
  preview: BackupImportPreviewDTO | null;
  result: BackupImportResultDTO | null;
  errorMessage: string | null;
  onPreview: typeof onPreview;
  onConfirm: typeof onConfirm;
  onCancel: typeof onCancel;
} = {
  phase: 'idle',
  preview: null,
  result: null,
  errorMessage: null,
  onPreview,
  onConfirm,
  onCancel,
};

vi.mock('../use-backup-import', () => ({
  useBackupImport: () => hookState,
}));

import { BackupImportSection } from '../BackupImportSection';

/** A previewed bundle with every disclosure line populated. */
const basePreview: BackupImportPreviewDTO = {
  cancelled: false,
  bundlePath: 'C:/backups/autoreas-backup-20260731-120000.zip',
  formatVersion: 1,
  bridgeVersion: 'dev',
  createdAt: '2026-07-31T12:00:00Z',
  bundleChecksum: 'deadbeef',
  groups: [{ name: 'anime_snapshots', recordCount: 512 }],
  unknownGroups: ['future_table'],
  absentGroups: ['seasons', 'season_animes'],
  versionNotes: ['v2 added foo'],
};

/** An apply that failed partway, with a restore point. */
const baseFailedResult: BackupImportResultDTO = {
  importedGroups: [],
  failedGroup: 'seasons',
  unattemptedGroups: ['season_animes'],
  restorePointPath: 'C:/data/bridge-restore-point-20260731-120000.db',
  errorMessage: 'insert record 1: UNIQUE constraint failed',
};

afterEach(() => {
  cleanup();
  Object.assign(hookState, { phase: 'idle', preview: null, result: null, errorMessage: null });
});

describe('BackupImportSection', () => {
  it('offers only the preview action on idle, without confirm or cancel, and fires onPreview', () => {
    render(<BackupImportSection />);

    expect(screen.getByRole('button', { name: 'Preview import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Preview import' }).click();
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('disables actions and shows the busy label while previewing', () => {
    Object.assign(hookState, { phase: 'previewing' });
    render(<BackupImportSection />);

    expect(screen.getByRole('button', { name: 'Previewing…' })).toBeDisabled();
  });

  it('disables actions and shows the busy label while applying', () => {
    Object.assign(hookState, { phase: 'applying', preview: basePreview });
    render(<BackupImportSection />);

    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
  });

  it('renders the preview summary with confirm and cancel while previewed, and fires each', () => {
    Object.assign(hookState, { phase: 'previewed', preview: basePreview });
    render(<BackupImportSection />);

    expect(screen.getByText(/512 animes/)).toBeInTheDocument();
    expect(screen.getByText(/Left untouched/)).toBeInTheDocument();
    expect(screen.getByText(/Ignored/)).toBeInTheDocument();
    expect(screen.getByText(/future_table/)).toBeInTheDocument();
    expect(screen.getByText('v2 added foo')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Confirm import' }).click();
    screen.getByRole('button', { name: 'Cancel' }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the outcome summary with the restore point path on failed', () => {
    Object.assign(hookState, {
      phase: 'failed',
      result: baseFailedResult,
      errorMessage: 'insert record 1: UNIQUE constraint failed',
    });
    render(<BackupImportSection />);

    expect(screen.getByText(/seasons/)).toBeInTheDocument();
    expect(screen.getByText(/bridge-restore-point-20260731-120000\.db/)).toBeInTheDocument();
  });
});
