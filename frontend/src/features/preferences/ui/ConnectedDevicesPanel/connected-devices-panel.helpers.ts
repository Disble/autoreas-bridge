import type { ConnectedDevice, ConnectedDeviceViewModel } from './connected-devices-panel.types';

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
