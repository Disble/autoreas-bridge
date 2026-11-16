import {
  GetConnectedDevices,
  GetEffectiveAddress,
  GetPairingToken,
  GetSyncingAnimeItems,
  TriggerReconcile,
  UnpairDevice,
} from '../../../wailsjs/go/desktop/App';
import type { ConnectedDevice, DevicesSource } from '../../shared/contracts/devices.types';
import type { SyncingAnime } from '../../shared/contracts/syncing-anime.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one Devices binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callDevicesBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `DevicesSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call rejects
 * with its module's `unavailable` / `failed_precondition` failure rather than
 * answer `''`, `[]` or a status string.
 * @returns The source.
 */
export function createDevicesSource(): DevicesSource {
  return {
    getEffectiveAddress: () => callDevicesBinding('GetEffectiveAddress', () => GetEffectiveAddress()),
    getPairingToken: () => callDevicesBinding('GetPairingToken', () => GetPairingToken()),
    getConnectedDevices: () => callDevicesBinding<readonly ConnectedDevice[]>('GetConnectedDevices', () => GetConnectedDevices()),
    unpairDevice: (deviceId) => callDevicesBinding('UnpairDevice', () => UnpairDevice(deviceId)),
    getSyncingAnimeItems: () => callDevicesBinding<readonly SyncingAnime[]>('GetSyncingAnimeItems', () => GetSyncingAnimeItems()),
    triggerReconcile: () => callDevicesBinding('TriggerReconcile', () => TriggerReconcile()),
  };
}
