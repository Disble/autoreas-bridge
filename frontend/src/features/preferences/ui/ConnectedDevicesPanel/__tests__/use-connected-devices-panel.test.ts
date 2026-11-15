import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectedDevice } from '../../../../../shared/contracts/devices.types';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { connectBridgeEvents, createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import type { ConnectedDevicesSource } from '../connected-devices-panel.types';
import { useConnectedDevicesPanel } from '../use-connected-devices-panel';

/** A paired tablet as `GetConnectedDevices` answers it. */
const GALAXY_TAB: ConnectedDevice = {
  auth_state: 'active',
  blocks_changelog_pruning: true,
  connection_status: 'connected',
  device_id: 'device-1',
  device_name: 'Galaxy Tab',
  last_ack_changelog_id: 42,
  last_seen_at_ms: 100,
  paired_at_ms: 50,
  sync_status: 'active',
};

/**
 * Builds the Devices port double: no device and a successful unpair unless a test overrides them.
 * @param overrides The calls a test spells out.
 * @returns The source.
 */
function createSource(overrides: Partial<ConnectedDevicesSource> = {}): ConnectedDevicesSource {
  return { getConnectedDevices: vi.fn().mockResolvedValue([]), unpairDevice: vi.fn().mockResolvedValue(undefined), ...overrides };
}

/**
 * Renders the hook under a query wrapper whose `devices` module reports `devices`, with the app's
 * invalidation rules connected to a fake backend event source.
 * @param source The Devices port.
 * @param devices The devices module's readiness.
 * @returns The hook render, the readiness `emit` and the backend event `fire`.
 */
function renderPanel(source: ConnectedDevicesSource, devices: ModuleReadiness = status('devices', 'ready')) {
  const { client, wrapper, emit } = createModulesTestWrapper(devices);
  const events = connectBridgeEvents(client);
  return { ...renderHook(() => useConnectedDevicesPanel({ source }), { wrapper }), emit, fire: events.emit };
}

/**
 * The rows the view renders, or none outside the ready state.
 * @param view The hook's view.
 * @returns The rows.
 */
function rowsOf(view: ReturnType<typeof useConnectedDevicesPanel>['view']) {
  return view.kind === 'ready' ? view.data : [];
}

describe('useConnectedDevicesPanel', () => {
  it('stays loading without reading while the devices module starts, then shows the devices once ready', async () => {
    const source = createSource({ getConnectedDevices: vi.fn().mockResolvedValue([GALAXY_TAB]) });
    const { result, emit } = renderPanel(source, status('devices', 'starting'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.view.kind).toBe('loading');
    expect(source.getConnectedDevices).not.toHaveBeenCalled();

    act(() => emit(status('devices', 'ready')));

    await waitFor(() => expect(rowsOf(result.current.view).map((row) => row.name)).toEqual(['Galaxy Tab']));
  });

  it('is empty, not loading, once no paired device resolves', async () => {
    const { result } = renderPanel(createSource());

    await waitFor(() => expect(result.current.view.kind).toBe('empty'));
  });

  it.each([
    ['the devices module failed', status('devices', 'failed', 'devices: database locked'), createSource(), 'devices: database locked'],
    ['the read rejects', status('devices', 'ready'), createSource({ getConnectedDevices: vi.fn().mockRejectedValue(createBridgeError('internal', 'offline')) }), 'offline'],
  ])('shows the failure, never an empty list, when %s', async (_case, devices, source, message) => {
    const { result } = renderPanel(source, devices);

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'failure', message }));
  });

  it('unpairs a device and re-reads the list', async () => {
    const source = createSource({ getConnectedDevices: vi.fn().mockResolvedValueOnce([GALAXY_TAB]).mockResolvedValueOnce([]) });
    const { result } = renderPanel(source);
    await waitFor(() => expect(rowsOf(result.current.view)).toHaveLength(1));

    act(() => result.current.unpairDevice('device-1'));

    await waitFor(() => expect(result.current.view.kind).toBe('empty'));
    expect(source.unpairDevice).toHaveBeenCalledWith('device-1');
    expect(source.getConnectedDevices).toHaveBeenCalledTimes(2);
  });

  it('shows a rejected unpair until the list loads again', async () => {
    const source = createSource({
      getConnectedDevices: vi.fn().mockResolvedValue([GALAXY_TAB]),
      unpairDevice: vi.fn().mockRejectedValue(createBridgeError('internal', 'disk I/O error')),
    });
    const { result, fire } = renderPanel(source);
    await waitFor(() => expect(rowsOf(result.current.view)).toHaveLength(1));

    act(() => result.current.unpairDevice('device-1'));

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'failure', message: 'disk I/O error' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      fire('sync.device_acknowledged');
    });

    await waitFor(() => expect(rowsOf(result.current.view)).toHaveLength(1));
  });

  it.each([
    ['a device acknowledgment', 'sync.device_acknowledged'],
    ['a pairing', 'pairing.token-consumed'],
  ])('re-reads the list in place on %s, keeping the previous rows while it loads', async (_moment, eventName) => {
    let answerRefetch: (devices: readonly ConnectedDevice[]) => void = () => undefined;
    const getConnectedDevices = vi
      .fn()
      .mockResolvedValueOnce([GALAXY_TAB])
      .mockReturnValueOnce(new Promise((resolve) => (answerRefetch = resolve)));
    const { result, fire } = renderPanel(createSource({ getConnectedDevices }));
    await waitFor(() => expect(rowsOf(result.current.view)).toHaveLength(1));

    act(() => {
      fire(eventName);
    });

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'ready', isRefreshing: true }));
    expect(rowsOf(result.current.view)[0]?.id).toBe('device-1');

    await act(async () => answerRefetch([{ ...GALAXY_TAB, last_seen_at_ms: 999 }]));

    await waitFor(() => expect(rowsOf(result.current.view)[0]?.lastSyncLabel).toBe(new Date(999).toLocaleString()));
    expect(result.current.view).toMatchObject({ kind: 'ready', isRefreshing: false });
  });
});
