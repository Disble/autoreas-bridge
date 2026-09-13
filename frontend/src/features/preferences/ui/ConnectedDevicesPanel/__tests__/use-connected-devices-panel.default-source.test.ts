import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: {
    getConnectedDevices: vi.fn().mockResolvedValue([]),
    unpairDevice: vi.fn(),
  },
}));

describe('useConnectedDevicesPanel default source', () => {
  // The mocked runtime exposes NEITHER subscription, which is what a browser or a
  // test environment without Wails bound actually looks like. Both must degrade.
  it('degrades to mount-only refresh when the runtime exposes no event sources at all', async () => {
    const { useConnectedDevicesPanel } = await import('../use-connected-devices-panel');
    const { bridgeRuntimeSource } = await import(
      '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers'
    );

    const { result } = renderHook(() => useConnectedDevicesPanel({}));

    await waitFor(() => expect(bridgeRuntimeSource.getConnectedDevices).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });
});
