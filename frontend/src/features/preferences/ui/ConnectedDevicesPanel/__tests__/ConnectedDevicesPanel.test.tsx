import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { ConnectedDevicesPanel } from '../ConnectedDevicesPanel';
import type { ConnectedDevicesSource } from '../connected-devices-panel.types';

/** A paired tablet as `GetConnectedDevices` answers it. */
const GALAXY_TAB = {
  auth_state: 'active',
  blocks_changelog_pruning: true,
  connection_status: 'disconnected',
  device_id: 'device-1',
  device_name: 'Galaxy Tab',
  last_ack_changelog_id: 42,
  last_seen_at_ms: 0,
  paired_at_ms: 100,
  sync_status: 'active',
};

/**
 * Renders the panel under a query wrapper whose devices module reports `devices`.
 * @param source The Devices port.
 * @param devices The devices module's readiness.
 * @returns The render result and the readiness `emit` control.
 */
function renderPanel(source: ConnectedDevicesSource, devices = status('devices', 'ready')) {
  const { wrapper, emit } = createModulesTestWrapper(devices);
  return { ...render(<ConnectedDevicesPanel source={source} />, { wrapper }), emit };
}

/** The status region the panel announces while the list loads. */
const loadingStatus = () => screen.queryByRole('status', { name: 'Loading connected devices...' });

describe('ConnectedDevicesPanel', () => {
  afterEach(cleanup);

  it('renders connected devices with an unpair action', async () => {
    renderPanel({ getConnectedDevices: vi.fn().mockResolvedValue([GALAXY_TAB]), unpairDevice: vi.fn() });

    await waitFor(() => expect(screen.getByText('Galaxy Tab')).toBeInTheDocument());
    expect(screen.getByText('device-1')).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpair' })).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
    expect(screen.queryByTestId('connected-devices-skeleton-row')).toBeNull();
  });

  it('labels a device that does not block pruning, and unpairs the device whose button is pressed', async () => {
    const unpairDevice = vi.fn().mockResolvedValue(undefined);
    renderPanel({ getConnectedDevices: vi.fn().mockResolvedValue([{ ...GALAXY_TAB, blocks_changelog_pruning: false }]), unpairDevice });

    expect(await screen.findByText('Not blocking')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    await waitFor(() => expect(unpairDevice).toHaveBeenCalledWith('device-1'));
  });

  it('keeps the table with skeleton rows, and no real row or empty message, while the devices module starts', async () => {
    const { container, emit } = renderPanel({ getConnectedDevices: vi.fn().mockResolvedValue([GALAXY_TAB]), unpairDevice: vi.fn() }, status('devices', 'starting'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(loadingStatus()).toBeInTheDocument();
    expect(screen.getAllByTestId('connected-devices-skeleton-row')).toHaveLength(2);
    expect(container.querySelector('[data-slot="table"][aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText('Galaxy Tab')).toBeNull();
    expect(screen.queryByText('No connected devices yet.')).toBeNull();

    act(() => emit(status('devices', 'ready')));

    expect(await screen.findByText('Galaxy Tab')).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows the empty message once no paired device resolves', async () => {
    renderPanel({ getConnectedDevices: vi.fn().mockResolvedValue([]), unpairDevice: vi.fn() });

    expect(await screen.findByText('No connected devices yet.')).toBeInTheDocument();
    expect(loadingStatus()).toBeNull();
  });

  it('shows only the failure Alert when the list cannot be read', async () => {
    renderPanel({ getConnectedDevices: vi.fn().mockRejectedValue(createBridgeError('internal', 'offline')), unpairDevice: vi.fn() });

    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.getByText('Connected devices unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpair' })).toBeNull();
    expect(loadingStatus()).toBeNull();
  });
});
