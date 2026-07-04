import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConnectedDevicesPanel } from '../use-connected-devices-panel';

describe('useConnectedDevicesPanel', () => {
  it('loads connected devices from the source', async () => {
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

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.name).toBe('Galaxy Tab');
  });

  it('unpairs a device and refreshes the list', async () => {
    const source = {
      getConnectedDevices: vi.fn().mockResolvedValue([]),
      unpairDevice: vi.fn().mockResolvedValue('ok'),
    };

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));
    await waitFor(() => expect(source.getConnectedDevices).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.unpairDevice('device-1');
    });

    await waitFor(() => expect(source.unpairDevice).toHaveBeenCalledWith('device-1'));
    await waitFor(() => expect(source.getConnectedDevices).toHaveBeenCalledTimes(2));
  });
});
