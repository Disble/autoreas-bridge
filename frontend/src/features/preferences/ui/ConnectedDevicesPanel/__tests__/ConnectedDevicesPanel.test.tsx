import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectedDevicesPanel } from '../ConnectedDevicesPanel';

describe('ConnectedDevicesPanel', () => {
  it('renders connected devices with an unpair action', async () => {
    const source = {
      getConnectedDevices: vi.fn().mockResolvedValue([
        {
          auth_state: 'active',
          blocks_changelog_pruning: true,
          connection_status: 'disconnected',
          device_id: 'device-1',
          device_name: 'Galaxy Tab',
          last_ack_changelog_id: 42,
          last_seen_at_ms: 0,
          paired_at_ms: 100,
          sync_status: 'active',
        },
      ]),
      unpairDevice: vi.fn(),
    };

    render(<ConnectedDevicesPanel source={source} />);

    await waitFor(() => expect(screen.getByText('Galaxy Tab')).toBeInTheDocument());
    expect(screen.getByText('device-1')).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpair' })).toBeInTheDocument();
  });
});
