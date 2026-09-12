import type { DeviceAcknowledgedNotice } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

/** Props for the ConnectedDevicesPanel; source is injectable for tests. */
export interface ConnectedDevicesPanelProps {
  readonly source?: ConnectedDevicesSource;
}

/**
 * Runtime source used by the panel to read devices, revoke pairing, and
 * subscribe to sync-state changes. `onDeviceAcknowledged` is required here
 * (unlike its optional counterpart on `BridgeRuntimeSource`): the panel
 * cannot refresh in place without it, so an injected fixture that forgets it
 * fails at compile time instead of shipping a silently stale panel.
 */
export interface ConnectedDevicesSource {
  readonly getConnectedDevices: () => Promise<readonly ConnectedDevice[]>;
  readonly onDeviceAcknowledged: (listener: (notice: DeviceAcknowledgedNotice) => void) => () => void;
  readonly unpairDevice: (deviceID: string) => Promise<string>;
}

/** Connected device DTO returned by the Wails bridge binding. */
export interface ConnectedDevice {
  readonly device_id: string;
  readonly device_name: string;
  readonly paired_at_ms: number;
  readonly last_seen_at_ms: number;
  readonly last_ack_changelog_id: number;
  readonly sync_status: string;
  readonly connection_status: string;
  readonly auth_state: string;
  readonly blocks_changelog_pruning: boolean;
}

/** UI-ready connected device row with display labels already resolved. */
export interface ConnectedDeviceViewModel {
  readonly id: string;
  readonly name: string;
  readonly lastSyncLabel: string;
  readonly syncStatus: string;
  readonly connectionStatus: string;
  readonly authState: string;
  readonly blocksPruning: boolean;
}
