import type { ConnectedDevice, ConnectedDeviceChipColor, ConnectedDeviceViewModel } from './connected-devices-panel.types';

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
