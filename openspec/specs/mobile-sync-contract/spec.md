# SDD-16 Specification: Mobile Sync Contract

## Purpose

Define the bridge-side REST, WebSocket, and serialization contract required for Autoreas Mobile to populate its local SQLite database, reconcile bridge-side changes after reconnects, and process realtime create/update/delete events without legacy-type mismatches.

## Requirements

### Requirement: GET /api/animes Full Snapshot

The system MUST expose an authenticated `GET /api/animes` endpoint that returns the full effective snapshot list from `anime_snapshots`, serialized to the mobile schema.

#### Scenario: Initial sync after pairing
- GIVEN a valid bearer token
- AND the bridge has effective anime snapshots in SQLite
- WHEN the client sends `GET /api/animes`
- THEN the system returns 200 OK
- AND the response body is a JSON array
- AND every item includes `_id`, `nombre`, `estado`, `nrocapvisto`, `activo`, and `primeravez`
- AND `activo` and `primeravez` are serialized as `0` or `1`
- AND `portada` is serialized as `string|null`

### Requirement: GET /api/animes/:id Detail Snapshot

The system MUST expose an authenticated `GET /api/animes/:id` endpoint that returns one normalized snapshot by ID.

#### Scenario: Existing anime requested by ID
- GIVEN a valid bearer token
- AND the anime exists in `anime_snapshots`
- WHEN the client sends `GET /api/animes/:id`
- THEN the system returns 200 OK
- AND the response body is the fully normalized anime object

#### Scenario: Tombstoned or missing anime requested by ID
- GIVEN a valid bearer token
- AND the anime is absent from `anime_snapshots`
- WHEN the client sends `GET /api/animes/:id`
- THEN the system returns 404 Not Found

### Requirement: Mobile-Compatible Serialization

The system MUST normalize legacy snapshot JSON into the mobile contract without altering the legacy write model.

#### Scenario: Boolean and portada normalization
- GIVEN a legacy anime snapshot with `activo: true`, `primeravez: false`, and `portada: {"type":"url","path":"/foo.jpg"}`
- WHEN the system serializes that snapshot for REST
- THEN `activo` is `1`
- AND `primeravez` is `0`
- AND `portada` is `"/foo.jpg"`

#### Scenario: Legacy arrays and dates are normalized
- GIVEN a legacy anime snapshot with `dias`, `generos`, `fechaUltCapVisto`, and `fechaCreacion`
- WHEN the system serializes that snapshot for REST
- THEN `dias` is an array of `{dia, orden}`
- AND `generos` is `string[]`
- AND date fields are numeric milliseconds or `null`

### Requirement: GET /api/animes/changes Incremental Sync

The system MUST expose an authenticated `GET /api/animes/changes?since=<timestamp>` endpoint returning bridge changelog entries strictly newer than the provided timestamp.

#### Scenario: Changes exist after client timestamp
- GIVEN a valid bearer token
- AND the bridge changelog contains entries newer than the provided timestamp
- WHEN the client sends `GET /api/animes/changes?since=...`
- THEN the system returns 200 OK
- AND the response contains `changes`
- AND every change includes `record_id`, `change_type`, `changed_fields`, `snapshot`, and `timestamp`
- AND the response includes `last_changelog_id`

#### Scenario: No changes after client timestamp
- GIVEN a valid bearer token
- AND the bridge changelog has no newer entries
- WHEN the client sends `GET /api/animes/changes?since=...`
- THEN the system returns 200 OK
- AND `changes` is an empty array

### Requirement: Sync Reconcile Returns Bridge Changes

The system MUST accept an authenticated `POST /api/sync/reconcile` request body compatible with the RFC/mobile shape and return bridge changelog entries newer than `last_changelog_id`.

#### Scenario: Reconcile request with compatibility body
- GIVEN a valid bearer token
- WHEN the client sends `POST /api/sync/reconcile` with `device_id`, `last_changelog_id`, and `pending_operations`
- THEN the system returns 202 Accepted or 200 OK
- AND the response includes `status`
- AND the response includes `last_changelog_id`
- AND the response includes `applied_operations`
- AND the response includes `bridge_changes`
- AND the response includes `conflicts`

#### Scenario: Pending update operations are applied compatibly during reconcile
- GIVEN the bridge still exposes `PATCH /api/animes/:id` as the canonical write path
- AND the client sends `pending_operations` with update-compatible payloads inside reconcile
- WHEN the bridge processes the reconcile request
- THEN the system applies those updates through the same validation and write rules used by `PATCH /api/animes/:id`
- AND the system appends the resulting merged snapshot to legacy `animes.dat`
- AND the response marks those operations as applied in `applied_operations`
- AND the response still returns bridge-side changes successfully

#### Scenario: Unsupported pending operations are ignored during reconcile
- GIVEN a reconcile request contains pending operations the bridge does not yet support server-side
- WHEN the system processes the request
- THEN unsupported operation types are ignored
- AND the response marks those operations as `applied=false` in `applied_operations`
- AND supported update-compatible operations are still applied

### Requirement: WebSocket Event Coverage

The system MUST emit realtime events that let the mobile client react to updates, creates, deletes, and reconnect gaps.

#### Scenario: Existing record updated
- GIVEN a connected authenticated WebSocket client
- WHEN the bridge observes or writes an update to an existing anime
- THEN the client receives `{"type":"anime_changed","anime_id":"..."}`

#### Scenario: New record created
- GIVEN a connected authenticated WebSocket client
- WHEN the bridge observes a newly created anime
- THEN the client receives `{"type":"anime_created","anime_id":"..."}`

#### Scenario: Record deleted
- GIVEN a connected authenticated WebSocket client
- WHEN the bridge observes an effective-state delete
- THEN the client receives `{"type":"anime_deleted","anime_id":"..."}`

#### Scenario: Connection established or re-established
- GIVEN a connected authenticated WebSocket client
- WHEN the handshake completes
- THEN the client receives `{"type":"sync_required"}`

#### Scenario: WebSocket reconcile compatibility message is accepted
- GIVEN a connected authenticated WebSocket client
- AND the client sends a reconcile-compatible message carrying `pending_operations`
- WHEN those operations are update-compatible
- THEN the system applies them through the same validation and write path used by REST reconcile
- AND the bridge emits `anime_changed` after the write is accepted

### Requirement: Device pairing distinguishes one-shot pairing from persistent authentication

The system MUST accept a one-time `pairing_token` to enroll a device and MUST return a persistent `auth_token` for all subsequent authenticated requests.

#### Scenario: Pair device with one-time pairing token
- GIVEN the bridge has generated a one-time pairing token for the pairing panel
- WHEN a mobile client sends `POST /api/devices/pair` with `{"pairing_token":"...","device_name":"AutoreasMobile"}`
- THEN the bridge SHALL validate and consume that pairing token
- AND the response SHALL include `device_id`, `device_name`, and `auth_token`

#### Scenario: QR payload carries pairing token only
- GIVEN the bridge renders a QR code for device pairing
- WHEN the QR payload is generated
- THEN the payload SHALL include the one-time `pairing_token`
- AND the payload SHALL NOT include `auth_token`

### Requirement: GET /api/status Bridge Diagnostics

The system MUST expose an authenticated `GET /api/status` endpoint for lightweight diagnostics.

#### Scenario: Bridge healthy
- GIVEN a valid bearer token
- WHEN the client sends `GET /api/status`
- THEN the system returns 200 OK
- AND the response reports bridge health and last known changelog position

### Requirement: Device Management Endpoints

The system MUST expose authenticated endpoints for listing paired devices and revoking one device.

#### Scenario: List paired devices
- GIVEN a valid bearer token
- WHEN the client sends `GET /api/devices`
- THEN the system returns 200 OK
- AND the response contains all paired devices with ID, name, and paired timestamp

#### Scenario: Revoke paired device
- GIVEN a valid bearer token
- AND a paired device exists
- WHEN the client sends `DELETE /api/devices/:id`
- THEN the system removes that device from the store
- AND future authentication with its token fails

### Requirement: Conflicts API Presence

The system MUST expose authenticated conflicts endpoints even if there are currently zero pending conflicts.

#### Scenario: No conflicts recorded
- GIVEN a valid bearer token
- WHEN the client sends `GET /api/conflicts`
- THEN the system returns 200 OK
- AND the response contains an empty `conflicts` array

#### Scenario: Resolve unknown conflict
- GIVEN a valid bearer token
- WHEN the client sends `POST /api/conflicts/:id/resolve` for a missing conflict
- THEN the system returns 404 Not Found

### Requirement: OpenAPI Parity

The system MUST document every new REST route and WS event contract update in `docs/openapi.yaml`.

#### Scenario: Route parity gate passes
- GIVEN the SDD-16 implementation is complete
- WHEN `go run ./tools/checkopenapi` is executed
- THEN the check passes with the updated route set
