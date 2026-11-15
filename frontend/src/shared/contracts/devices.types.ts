import type { SyncingAnime } from './syncing-anime.types';

/** One paired device as `GetConnectedDevices` answers it (mirrors the generated `contracts.DeviceInfo`). */
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

/**
 * Port of the Devices page's bindings (ADR-032 §4), served by three backend
 * modules: `api` (the effective address), `devices` (pairing token, paired
 * devices, unpair) and `sync` (pending anime syncs, reconcile). The Wails adapter
 * is `createDevicesSource` (`infrastructure/bridge-runtime-source/devices-source.helpers.ts`),
 * built once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every
 * method rejects with a `BridgeError` and never answers `''`, `[]` or `"ok"` in
 * place of a failure: `unavailable` while the module starts, `failed_precondition`
 * once it failed.
 */
export interface DevicesSource {
  /** The `host:port` the HTTP server actually bound (module `api`). */
  readonly getEffectiveAddress: () => Promise<string>;
  /** The live pairing token, minted when none is live (module `devices`). */
  readonly getPairingToken: () => Promise<string>;
  /** The paired devices with their sync and connection state (module `devices`). */
  readonly getConnectedDevices: () => Promise<readonly ConnectedDevice[]>;
  /** Revokes one paired device (module `devices`). */
  readonly unpairDevice: (deviceId: string) => Promise<void>;
  /** The anime with writes still pending sync (module `sync`). */
  readonly getSyncingAnimeItems: () => Promise<readonly SyncingAnime[]>;
  /** Asks for an immediate reconcile pass (module `sync`). */
  readonly triggerReconcile: () => Promise<void>;
}
