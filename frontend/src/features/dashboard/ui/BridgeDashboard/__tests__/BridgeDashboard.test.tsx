import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const onTriggerSync = vi.fn();

vi.mock('../use-bridge-dashboard', () => ({
  useBridgeDashboard: () => ({
    isSyncing: false,
    onTriggerSync,
    syncResult: '',
    syncingAnimeRefreshToken: 0,
  }),
}));
vi.mock('../../BridgeStatusCard/BridgeStatusCard', () => ({ BridgeStatusCard: () => null }));
vi.mock('../../ObservabilityPanel/ObservabilityPanel', () => ({ ObservabilityPanel: () => null }));
vi.mock('../../PairingPanel/PairingPanel', () => ({ PairingPanel: () => null }));
vi.mock('../../SyncingAnimePanel/SyncingAnimePanel', () => ({ SyncingAnimePanel: () => null }));

import { BridgeDashboard } from '../BridgeDashboard';

describe('BridgeDashboard', () => {
  it('owns a rejected reconcile promise at the press boundary', () => {
    const catchHandler = vi.fn();
    onTriggerSync.mockReturnValueOnce({ catch: catchHandler });

    render(<BridgeDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Reconcile' }));

    expect(onTriggerSync).toHaveBeenCalledTimes(1);
    expect(catchHandler).toHaveBeenCalledTimes(1);
  });
});
