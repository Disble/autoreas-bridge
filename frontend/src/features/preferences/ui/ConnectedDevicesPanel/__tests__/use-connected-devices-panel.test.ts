import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectedDevice } from '../connected-devices-panel.types';
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
      onDeviceAcknowledged: vi.fn().mockReturnValue(() => undefined),
      unpairDevice: vi.fn(),
    };

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.name).toBe('Galaxy Tab');
  });

  it('keeps loading state until the device request resolves', async () => {
    let resolveDevices!: (devices: readonly ConnectedDevice[]) => void;
    const source = {
      getConnectedDevices: vi.fn(
        () =>
          new Promise<readonly ConnectedDevice[]>((resolve) => {
            resolveDevices = resolve;
          }),
      ),
      onDeviceAcknowledged: vi.fn().mockReturnValue(() => undefined),
      unpairDevice: vi.fn(),
    };

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveDevices([]);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('clears loading state when the device request fails', async () => {
    const source = {
      getConnectedDevices: vi.fn().mockRejectedValue(new Error('offline')),
      onDeviceAcknowledged: vi.fn().mockReturnValue(() => undefined),
      unpairDevice: vi.fn(),
    };

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));

    await waitFor(() => expect(result.current.errorMessage).toBe('Could not load connected devices.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('unpairs a device and refreshes the list', async () => {
    const source = {
      getConnectedDevices: vi.fn().mockResolvedValue([]),
      onDeviceAcknowledged: vi.fn().mockReturnValue(() => undefined),
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

  it('subscribes to onDeviceAcknowledged on mount', async () => {
    const source = {
      getConnectedDevices: vi.fn().mockResolvedValue([]),
      onDeviceAcknowledged: vi.fn().mockReturnValue(() => undefined),
      unpairDevice: vi.fn(),
    };

    renderHook(() => useConnectedDevicesPanel({ source }));

    await waitFor(() => expect(source.onDeviceAcknowledged).toHaveBeenCalledTimes(1));
  });

  it('refetches in place on a device-acknowledged event without flashing the loading state', async () => {
    const initialDevices: readonly ConnectedDevice[] = [
      {
        auth_state: 'active',
        blocks_changelog_pruning: false,
        connection_status: 'connected',
        device_id: 'device-1',
        device_name: 'Galaxy Tab',
        last_ack_changelog_id: 1,
        last_seen_at_ms: 100,
        paired_at_ms: 50,
        sync_status: 'active',
      },
    ];
    let resolveRefetch!: (devices: readonly ConnectedDevice[]) => void;
    const getConnectedDevices = vi
      .fn()
      .mockResolvedValueOnce(initialDevices)
      .mockImplementationOnce(
        () =>
          new Promise<readonly ConnectedDevice[]>((resolve) => {
            resolveRefetch = resolve;
          }),
      );
    let acknowledgedListener: (() => void) | undefined;
    const source = {
      getConnectedDevices,
      onDeviceAcknowledged: vi.fn().mockImplementation((listener: () => void) => {
        acknowledgedListener = listener;
        return () => undefined;
      }),
      unpairDevice: vi.fn(),
    };

    const { result } = renderHook(() => useConnectedDevicesPanel({ source }));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);

    act(() => {
      acknowledgedListener?.();
    });

    // Assert the negative mid-flight: the previous rows stay rendered and loading never flips
    // true, so the panel never shows the loading branch and its populated rows together.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]?.id).toBe('device-1');

    await act(async () => {
      resolveRefetch([{ ...initialDevices[0]!, last_seen_at_ms: 999 }]);
    });

    await waitFor(() => expect(result.current.rows[0]?.lastSyncLabel).toBe(new Date(999).toLocaleString()));
    expect(result.current.isLoading).toBe(false);
  });

  it('unsubscribes from onDeviceAcknowledged on unmount and stops refreshing', async () => {
    const unsubscribe = vi.fn();
    let acknowledgedListener: (() => void) | undefined;
    const source = {
      getConnectedDevices: vi.fn().mockResolvedValue([]),
      onDeviceAcknowledged: vi.fn().mockImplementation((listener: () => void) => {
        acknowledgedListener = listener;
        // Mirrors the real shared-subscription contract: `unsubscribe` stops
        // future delivery, so a stray call after unmount is a true no-op
        // rather than a mock that merely records it was invoked.
        return () => {
          unsubscribe();
          acknowledgedListener = undefined;
        };
      }),
      unpairDevice: vi.fn(),
    };

    const { unmount } = renderHook(() => useConnectedDevicesPanel({ source }));
    await waitFor(() => expect(source.getConnectedDevices).toHaveBeenCalledTimes(1));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    acknowledgedListener?.();
    expect(source.getConnectedDevices).toHaveBeenCalledTimes(1);
  });
});
