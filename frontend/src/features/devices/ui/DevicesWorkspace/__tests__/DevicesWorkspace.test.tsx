import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The reconcile action the mocked hook hands the button. */
const onTriggerSync = vi.fn();

/** The reconcile feedback the mocked hook reports; a case sets it. */
const feedback = { syncResult: '', isSyncFailed: false };

vi.mock('../use-devices-workspace', () => ({
  useDevicesWorkspace: () => ({
    isSyncing: false,
    onTriggerSync,
    ...feedback,
    syncingAnimeRefreshToken: 0,
  }),
}));
vi.mock('../../../../dashboard/ui/PairingPanel/PairingPanel', () => ({
  PairingPanel: () => <div>Pairing Panel</div>,
}));
vi.mock('../../../../preferences/ui/ConnectedDevicesPanel/ConnectedDevicesPanel', () => ({
  ConnectedDevicesPanel: () => <div>Connected Devices Panel</div>,
}));
vi.mock('../../../../dashboard/ui/SyncingAnimePanel/SyncingAnimePanel', () => ({
  SyncingAnimePanel: () => <div>Syncing Anime Panel</div>,
}));

import { DevicesWorkspace } from '../DevicesWorkspace';

describe('DevicesWorkspace', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all four sections: Pairing, Connected Devices, Syncing Now, and Trigger Reconcile', () => {
    render(<DevicesWorkspace />);

    expect(screen.getByText('Pairing Panel')).toBeInTheDocument();
    expect(screen.getByText('Connected Devices Panel')).toBeInTheDocument();
    expect(screen.getByText('Syncing Anime Panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trigger Reconcile' })).toBeInTheDocument();
  });

  it('owns a rejected reconcile promise at the press boundary', () => {
    const catchHandler = vi.fn();
    onTriggerSync.mockReturnValueOnce({ catch: catchHandler });

    render(<DevicesWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Reconcile' }));

    expect(onTriggerSync).toHaveBeenCalledTimes(1);
    expect(catchHandler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a succeeded reconcile as success', 'ok', false, 'alert--success'],
    ['a rejected reconcile as danger', 'sync is starting', true, 'alert--danger'],
  ])('shows %s', (_case, syncResult, isSyncFailed, alertClass) => {
    Object.assign(feedback, { syncResult, isSyncFailed });

    render(<DevicesWorkspace />);

    expect(screen.getByText(syncResult).closest('[data-slot="alert-root"]')).toHaveClass(alertClass);
    Object.assign(feedback, { syncResult: '', isSyncFailed: false });
  });
});
