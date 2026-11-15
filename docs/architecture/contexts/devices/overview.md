# Devices — overview

Devices pairs the mobile app with Bridge, authenticates it, and shows on the desktop which devices
are paired and what is still waiting to sync to them. Bridge owns the anime state (ADR-008); a paired
device only reads changes and acknowledges them. The desktop side reads through module handles and
`useBridgeQuery` (ADR-032).

For the readiness, failure codes and query runtime it relies on, read
`../../cross-cutting/async-state.md`. For where each handle is bound at startup, read
`../desktop/overview.md`.

## Responsibility

- Owns: pairing tokens (`pairing_tokens`), paired devices (`devices`), and the per-device sync
  progress the desktop shows (`device_sync_state`, written by `internal/sync`).
- Does not own: the changelog and its pruning (`internal/sync`), the HTTP/WebSocket server
  (`internal/api`, `internal/realtime`), or the anime state itself (`internal/anime`).

## Package map

| Package | Role |
|---|---|
| `internal/device` | `Service` (pairing, token authentication, `ListDevices`, `RevokeDevice`), `SQLiteStore` |
| `internal/sync` (`service.go`) | `TriggerService`: `TriggerReconcile`, `AcknowledgeDevice`, `ListPendingAnimeSyncs` |
| `internal/api` | REST routes `/api/devices/pair`, `/api/devices`, `/api/devices/{id}` (`router.go`) |
| `internal/desktop/app_runtime.go` | the six Wails bindings below and `bindDevicesModule` |

## Ports and adapters

- Driving: the mobile app through REST (`internal/api/router.go`); the desktop WebView through the
  Wails bindings in `internal/desktop/app_runtime.go`.
- Driven: `device.Store` (adapter `device.SQLiteStore`), `device.SyncStateStore` (sync state from
  `bridge.db`) and `device.PresenceStore` (the realtime hub), both set by `bindDevicesModule` when
  their source exists.

## Readiness and failures

The bindings use three handles (`appModules` in `internal/desktop/app_readiness.go`):

| Handle | Ready when | Bindings |
|---|---|---|
| `api` | the HTTP server is built (bound in `startHTTPServer`) and started | `GetEffectiveAddress() (string, error)` |
| `sync` | the changelog recorder and the sync trigger are wired (trigger bound in `startHTTPServer`) | `TriggerReconcile() error`, `GetSyncingAnimeItems() ([]SyncingAnimeItem, error)`; `GetSQLiteStatus` and the backup bindings are served by the `backup` handle (`../desktop/overview.md`) |
| `devices` | the device store is wired (bound by `bindDevicesModule`) | `GetPairingToken() (string, error)`, `GetConnectedDevices() ([]DeviceInfo, error)`, `UnpairDevice(id) error` |

- `unavailable` while the module starts, `failed_precondition` with the startup reason after it
  failed, `internal` when the service fails. `GetPairingToken` wraps its store errors as
  `token cleanup failed: …`, `token lookup failed: …`, `token generation failed: …` and
  `token persist failed: …` (`TestRuntimeModuleServiceFailuresAreInternal`).
- An empty device list or pending queue is `[]`, never a failure; a failure is never `[]`.
- `GetPairingToken` reuses the newest unconsumed token younger than `device.PairingTokenTTL`
  (10 minutes) and prunes the expired ones before creating a new token.

## Events

| Event | Published when | Consumers |
|---|---|---|
| `pairing.token-consumed` | `POST /api/devices/pair` pairs a device (`api.ServerConfig.OnPairingTokenConsumed`) | `BRIDGE_INVALIDATIONS`: the pairing token and the paired-device list |
| `sync.device_acknowledged` | `TriggerService.AcknowledgeDevice` records an acknowledgment | `BRIDGE_INVALIDATIONS`: the paired-device list |

## Storage

`bridge.db` (DDL in `internal/sync/schema.go`):

- `pairing_tokens(token, created_at_ms, consumed_at_ms)`
- `devices(device_id, name, auth_token UNIQUE, paired_at_ms)`
- `device_sync_state(device_id, last_ack_changelog_id, last_seen_at_ms, sync_status DEFAULT 'active')`

## Invariants

- Each binding answers through its handle and returns an error (`tools/checkarchitecture`, rules
  `binding-uses-handle` and `binding-signature`; none of the six is in the baseline).
- Production startup binds all three handles: `TestProductionStartupGatesTheEpisodeSchedule` calls
  `GetEffectiveAddress`, `GetSyncingAnimeItems` and `GetConnectedDevices` after a real startup and
  fails with `"<module> is ready without services"` when a bind is missing.

## Frontend

- Screen: Devices (`frontend/src/features/devices/ui/DevicesWorkspace`), composing
  `features/dashboard/ui/PairingPanel`, `features/dashboard/ui/SyncingAnimePanel` and
  `features/preferences/ui/ConnectedDevicesPanel`.
- Source port and adapter: `DevicesSource` (`frontend/src/shared/contracts/devices.types.ts`),
  `createDevicesSource` (`frontend/src/infrastructure/bridge-runtime-source/devices-source.helpers.ts`),
  built once as `BRIDGE_DEVICES_SOURCE` in `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
- Query keys: `devicesKeys`, `DEVICES_PAIRING_TOKEN_KEY`, `DEVICES_CONNECTED_KEY`
  (`frontend/src/shared/query/query-keys/query-keys.constants.ts`); the two events above invalidate
  them. The syncing panel's key carries the workspace's refresh token, bumped after a reconcile.
- Loading, empty and failure:
  - PairingPanel: address (module `api`) and token (module `devices`); loading, then the QR, or a
    failure Alert. After a pairing it hides the consumed token while the new one loads.
  - SyncingAnimePanel (module `sync`): loading, empty, rows, or a failure Alert; a new refresh token
    shows loading instead of the superseded rows.
  - ConnectedDevicesPanel (module `devices`): skeleton rows inside the table (`aria-busy`, a labelled
    status region), the empty message, the rows, or the "Connected devices unavailable" Alert. An
    event re-reads the list in place (`isRefreshing`). A rejected unpair shows the same Alert until
    the list loads again.
  - DevicesWorkspace: the reconcile runs through `useBridgeMutation`; a rejection shows its message
    in a danger Alert.
- Activity reads the paired devices through the same `BRIDGE_DEVICES_SOURCE.getConnectedDevices`
  (`features/activity/feed/use-activity-phone-status.ts`).

## Entry points

| Trigger | Entry |
|---|---|
| Wails binding | `internal/desktop/app_runtime.go` `GetEffectiveAddress`, `GetPairingToken`, `GetConnectedDevices`, `UnpairDevice`, `TriggerReconcile`, `GetSyncingAnimeItems` |
| REST | `internal/api/router.go` `/api/devices/pair`, `/api/devices`, `/api/devices/{id}` |

## Known drift

- `use-activity-phone-status.ts` still polls `getConnectedDevices` from a `useEffect` instead of
  `useBridgeQuery`: a rejection while `devices` starts keeps the last devices (none at first).
- ConnectedDevicesPanel's empty state is a plain `<p>` ("No connected devices yet."), not
  `AirisEmptyState`; this unit kept it.
- This page is not yet listed in `docs/architecture/README.md`.
