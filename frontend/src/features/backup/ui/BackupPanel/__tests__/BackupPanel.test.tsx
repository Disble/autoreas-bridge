import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const onExport = vi.fn();
const hookState = {
  status: 'idle' as const,
  result: null as null,
  errorMessage: null as null,
  onExport,
};

vi.mock('../use-backup-panel', () => ({
  useBackupPanel: () => hookState,
}));

import { BackupPanel } from '../BackupPanel';

afterEach(cleanup);

describe('BackupPanel', () => {
  it('renders an export button that fires onExport', () => {
    render(<BackupPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('disables the export button while busy and shows the exporting label', () => {
    Object.assign(hookState, { status: 'busy' });
    render(<BackupPanel />);

    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  });

  it('renders the destination path and per-group counts on success', () => {
    Object.assign(hookState, {
      status: 'success',
      result: {
        cancelled: false,
        destinationPath: 'C:/backups/backup.zip',
        formatVersion: 1,
        createdAt: '2026-07-31T12:00:00Z',
        groups: [{ name: 'anime_snapshots', recordCount: 512 }],
        bundleChecksum: 'deadbeef',
      },
    });
    render(<BackupPanel />);

    expect(screen.getByText(/Exported 512 animes to C:\/backups\/backup\.zip/)).toBeInTheDocument();
  });

  it('renders the error message on failure', () => {
    Object.assign(hookState, { status: 'error', result: null, errorMessage: 'save dialog failed' });
    render(<BackupPanel />);

    expect(screen.getByText('save dialog failed')).toBeInTheDocument();
  });

  it('returns to idle silently on cancel, with no error text', () => {
    Object.assign(hookState, { status: 'cancelled', result: { cancelled: true, destinationPath: '', formatVersion: 0, createdAt: '', groups: [], bundleChecksum: '' }, errorMessage: null });
    render(<BackupPanel />);

    expect(screen.queryByText('save dialog failed')).not.toBeInTheDocument();
  });
});
