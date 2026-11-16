import type { ConnectedDevice } from '../../../../shared/contracts/devices.types';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import type { AsyncViewSource } from '../../../../shared/query/async-view/async-view.types';
import type { ConnectedDeviceChipColor, ConnectedDeviceViewModel, ConnectedDevicesView, UnpairMutationState } from './connected-devices-panel.types';

/**
 * Converts raw connected-device DTOs into stable UI rows so the component only renders data.
 */
export function toConnectedDeviceRows(devices: readonly ConnectedDevice[]): readonly ConnectedDeviceViewModel[] {
  return devices.map((device) => ({
    id: device.device_id,
    name: device.device_name || device.device_id,
    lastSyncLabel: formatLastSync(device.last_seen_at_ms),
    syncStatus: device.sync_status || 'active',
    connectionStatus: device.connection_status || 'disconnected',
    authState: device.auth_state || 'active',
    blocksPruning: device.blocks_changelog_pruning,
  }));
}

/**
 * Formats the last sync timestamp while keeping empty sync state explicit for users.
 */
export function formatLastSync(lastSeenAtMs: number): string {
  if (lastSeenAtMs <= 0) {
    return 'Never synced';
  }
  return new Date(lastSeenAtMs).toLocaleString();
}

/**
 * Resolves the chip color for a device row. `connectionStatus` (live websocket
 * presence) takes priority since it is the signal a user actually cares about;
 * `syncStatus` (sync health) only breaks the tie for a device that is not
 * currently connected, keeping the historical "stale" warning meaningful
 * instead of losing it now that "connected" is a reachable value.
 */
export function getConnectionStatusColor(connectionStatus: string, syncStatus: string): ConnectedDeviceChipColor {
  if (connectionStatus === 'connected') {
    return 'success';
  }
  if (syncStatus === 'stale') {
    return 'warning';
  }
  return 'default';
}

/**
 * The rejected unpair to show: its message until the device list loads again
 * (a pairing, an acknowledgment, or a later successful unpair re-reads it), as
 * the panel cleared it on every reload.
 * @param unpair The unpair mutation's state.
 * @param dataUpdatedAt When the device list last loaded, epoch milliseconds.
 * @returns The failure message, or '' when there is none to show.
 */
export function toVisibleUnpairFailure(unpair: UnpairMutationState, dataUpdatedAt: number): string {
  return unpair.status === 'error' && unpair.submittedAt >= dataUpdatedAt ? (unpair.error?.message ?? '') : '';
}

/**
 * The one state the panel renders (ADR-032 §4): a visible unpair failure wins,
 * otherwise the device-list query's view with its rows made render-ready. A
 * refetch after an event keeps the previous rows in place (`isRefreshing`).
 * @param query The device-list query.
 * @param unpairFailure The visible unpair failure, or ''.
 * @returns The panel view.
 */
export function toConnectedDevicesView(query: AsyncViewSource<readonly ConnectedDevice[]>, unpairFailure: string): ConnectedDevicesView {
  if (unpairFailure !== '') {
    return { kind: 'failure', code: 'internal', message: unpairFailure };
  }

  const view = toAsyncView(query);
  return view.kind === 'ready' ? { ...view, data: toConnectedDeviceRows(view.data) } : view;
}
