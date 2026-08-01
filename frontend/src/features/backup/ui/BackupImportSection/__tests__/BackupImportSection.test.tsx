import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../infrastructure/backup-source';
import type { BackupImportPhase } from '../backup-import-section.types';

const onPreview = vi.fn();
const onConfirm = vi.fn();
const onCancel = vi.fn();
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
  it('renders nothing extra on idle beyond the preview action', () => {
    render(<BackupImportSection />);

    expect(screen.getByRole('button', { name: 'Preview import' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('fires onPreview when the preview action is pressed', () => {
    render(<BackupImportSection />);

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

  it('renders the preview summary including untouched and ignored group lines and version notes while previewed', () => {
    Object.assign(hookState, { phase: 'previewed', preview: basePreview });
    render(<BackupImportSection />);

    expect(screen.getByText(/512 animes/)).toBeInTheDocument();
    expect(screen.getByText(/Left untouched/)).toBeInTheDocument();
    expect(screen.getByText(/Ignored/)).toBeInTheDocument();
    expect(screen.getByText(/future_table/)).toBeInTheDocument();
    expect(screen.getByText('v2 added foo')).toBeInTheDocument();
  });

  it('renders confirm and cancel only while previewed', () => {
    Object.assign(hookState, { phase: 'previewed', preview: basePreview });
    render(<BackupImportSection />);

    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel from their respective actions', () => {
    Object.assign(hookState, { phase: 'previewed', preview: basePreview });
    render(<BackupImportSection />);

    screen.getByRole('button', { name: 'Confirm import' }).click();
    screen.getByRole('button', { name: 'Cancel' }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not render confirm or cancel outside previewed', () => {
    render(<BackupImportSection />);

    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
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
