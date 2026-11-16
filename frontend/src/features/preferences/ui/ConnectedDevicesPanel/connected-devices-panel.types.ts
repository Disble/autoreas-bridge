import type { DevicesSource } from '../../../../shared/contracts/devices.types';
import type { BridgeError } from '../../../../shared/query/bridge-error/bridge-error.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

/** Props for the ConnectedDevicesPanel; source is injectable for tests. */
export interface ConnectedDevicesPanelProps {
  readonly source?: ConnectedDevicesSource;
}

/**
 * The Devices port calls the panel makes: read the paired devices and revoke one.
 * A pairing or a device acknowledgment re-reads the list through the
 * `BRIDGE_INVALIDATIONS` rules, so the panel subscribes to nothing itself.
 */
export type ConnectedDevicesSource = Pick<DevicesSource, 'getConnectedDevices' | 'unpairDevice'>;

/** Semantic HeroUI chip colors used by the connection-status presentation. */
export type ConnectedDeviceChipColor = 'default' | 'success' | 'warning';

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

/** The one state the panel renders: loading, failure, empty or the device rows. */
export type ConnectedDevicesView = AsyncView<readonly ConnectedDeviceViewModel[]>;

/** The part of the unpair mutation its visible failure is derived from (a `useBridgeMutation` result fits it). */
export interface UnpairMutationState {
  readonly status: 'idle' | 'pending' | 'success' | 'error';
  readonly error: BridgeError | null;
  /** When the last unpair was submitted, epoch milliseconds. */
  readonly submittedAt: number;
}
