# SDD-16 Specification: Mobile Sync Contract

## Purpose

Define the bridge-side REST, WebSocket, and serialization contract required for Autoreas Mobile to populate its local SQLite database, reconcile bridge-side changes after reconnects, and process realtime create/update/delete events without legacy-type mismatches.

## Requirements

### Requirement: GET /api/animes Full Snapshot

The system MUST expose an authenticated `GET /api/animes` endpoint that
returns the full effective snapshot list from `anime_snapshots`, serialized
using the English wire vocabulary.

(Previously: every item included the Spanish keys `_id`, `nombre`, `estado`,
`nrocapvisto`, `activo`, and `primeravez`, with `activo`/`primeravez`
serialized as `0`/`1`.)

#### Scenario: Initial sync after pairing
- GIVEN a valid bearer token
- AND the bridge has effective anime snapshots in SQLite
- WHEN the client sends `GET /api/animes`
- THEN the system returns 200 OK
- AND the response body is a JSON array
- AND every item includes `id`, `name`, `status`, `episodesWatched`,
  `active`, and `firstCycle`
- AND `active` and `firstCycle` are serialized as `0` or `1`
- AND `cover` is serialized as `string|null`
- AND no item includes a Spanish key (`_id`, `nombre`, `estado`,
  `nrocapvisto`, `activo`, `primeravez`, `portada`, …)

### Requirement: GET /api/animes/:id Detail Snapshot

The system MUST expose an authenticated `GET /api/animes/:id` endpoint that
returns one normalized snapshot by ID, serialized using the English wire
vocabulary.

#### Scenario: Existing anime requested by ID
- GIVEN a valid bearer token
- AND the anime exists in `anime_snapshots`
- WHEN the client sends `GET /api/animes/:id`
- THEN the system returns 200 OK
- AND the response body is the fully normalized anime object using only
  English field names

#### Scenario: Tombstoned or missing anime requested by ID
- GIVEN a valid bearer token
- AND the anime is absent from `anime_snapshots`
- WHEN the client sends `GET /api/animes/:id`
- THEN the system returns 404 Not Found

### Requirement: Mobile-Compatible Serialization

The system MUST normalize the English-keyed snapshot JSON into the mobile
contract, which is now identical in vocabulary to the storage codec.

(Previously: this requirement normalized *legacy* Spanish-keyed snapshot
JSON into an English-leaning mobile contract, translating field names and
value shapes at the serialization boundary. Now that the storage codec
itself speaks English per the `bridge-native-persistence` delta, this
boundary translation is a pass-through of already-English keys, plus the
existing value-shape normalizations below.)

#### Scenario: Boolean and cover normalization
- GIVEN an anime snapshot with `active: true`, `firstCycle: false`, and
  `cover: {"type":"url","path":"/foo.jpg"}`
- WHEN the system serializes that snapshot for REST
- THEN `active` is `1`
- AND `firstCycle` is `0`
- AND `cover` is `"/foo.jpg"`

#### Scenario: Arrays and dates are normalized
- GIVEN an anime snapshot with `days`, `genres`, `lastWatchedAt`, and
  `createdAt`
- WHEN the system serializes that snapshot for REST
- THEN `days` is an array of `{day, order}`
- AND `genres` is `string[]`
- AND date fields are numeric epoch-millisecond integers or `null` — not a
  `{"$$date": ...}` wrapper object

### Requirement: GET /api/animes/changes Incremental Sync

The system MUST expose an authenticated
`GET /api/animes/changes?since=<timestamp>` endpoint returning bridge
changelog entries strictly newer than the provided timestamp, with each
entry's `snapshot` field serialized using the English wire vocabulary —
including entries whose underlying `changelog.snapshot_json` row was
migrated in place by the SDD-56 vocabulary migration.

(Previously: the `snapshot` field on each change entry carried the Spanish
wire vocabulary, matching the then-Spanish storage codec.)

#### Scenario: Changes exist after client timestamp
- GIVEN a valid bearer token
- AND the bridge changelog contains entries newer than the provided
  timestamp
- WHEN the client sends `GET /api/animes/changes?since=...`
- THEN the system returns 200 OK
- AND the response contains `changes`
- AND every change includes `record_id`, `change_type`, `changed_fields`,
  `snapshot`, and `timestamp`
- AND every `snapshot` uses only the English field vocabulary
- AND the response includes `last_changelog_id`

#### Scenario: Historical changelog entries decode and serve in English

- GIVEN a `changelog` row persisted before the SDD-56 cutover, whose
  `snapshot_json` was rewritten in place to English keys by the
  `vocabulary_migrated_at`-gated migration
- WHEN that entry is served through `GET /api/animes/changes`
- THEN its `snapshot` field decodes successfully and serializes using only
  the English field vocabulary
- AND no field value differs from what the entry held before the migration

#### Scenario: No changes after client timestamp
- GIVEN a valid bearer token
- AND the bridge changelog has no newer entries
- WHEN the client sends `GET /api/animes/changes?since=...`
- THEN the system returns 200 OK
- AND `changes` is an empty array

### Requirement: Sync Reconcile Returns Bridge Changes

The system MUST accept an authenticated `POST /api/sync/reconcile` request
body compatible with the RFC/mobile shape and return bridge changelog
entries newer than `last_changelog_id`. Each entry in `applied_operations`
MUST carry the bridge's current OCC token for that anime as `modified_at`
whenever a write outcome was computed for that operation (applied, no-op,
or conflict) — including when that token's value is `0`, which is a
legitimate token in this codebase, never a sentinel for "no token" — and
MUST omit the `modified_at` key entirely when no write outcome was
computed, i.e. for an unsupported/skipped operation. A conflicting
operation MUST be reported as a per-operation outcome (`applied: false`)
rather than aborting the batch: the HTTP status, `last_changelog_id`, and
`bridge_changes` MUST be unaffected by a conflict, and the response MUST
still contain exactly one `applied_operations` entry per submitted pending
operation, in submission order. Every entry with `applied: false` MUST
carry a `reason` drawn from the closed vocabulary `unsupported_operation`
(permanent — discard the operation) or `conflict` (recoverable — re-base
on the echoed `modified_at` and retry); `reason` MUST be absent whenever
`applied` is `true`. A client that receives a `reason` value outside this
vocabulary MUST surface it rather than silently discarding the operation.
Once an operation for a given `anime_id` has conflicted within a batch, the
system MUST NOT apply any later operation for that same `anime_id` in that
same batch that omits `base`, and MUST report it as `applied: false` with
`reason: "conflict"` and the same winning `modified_at`. A later operation
for that `anime_id` that DOES carry `base` MUST still be evaluated on its
own merits.

Rationale, recorded because it is not deducible from the fields: omitting
`base` is the deliberate OCC bypass, so without this rule a batch could
have its first operation for a record correctly rejected as a conflict and
then a later base-less operation for the same record silently overwrite the
very value the rejection protected — the guard firing while the write lands
behind it. Aborting the batch used to prevent this as a side effect; making
a conflict non-fatal removes that accidental protection, so it is restored
deliberately here.

(Previously: `applied_operations` entries carried only `anime_id`,
`operation`, and `applied`, with no token echo and no failure
classification; a conflicting write was mapped to an error that aborted
the batch mid-loop and produced HTTP 500, discarding `applied_operations`,
`bridge_changes`, and `last_changelog_id` for the entire request — a
behavior `docs/openapi.yaml` had already documented as reachable, even
though it never was.)

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
- AND the corresponding entry's `modified_at` is the bridge's token for that anime after the write
- AND the response still returns bridge-side changes successfully

#### Scenario: Applied pending operation echoes its new token
- GIVEN a pending `update` operation that changes at least one field on an anime the bridge accepts
- WHEN the bridge applies that operation
- THEN the operation's `applied_operations` entry has `applied: true`
- AND the entry's `modified_at` is the new bridge-assigned token for that anime
- AND the entry omits `reason`

#### Scenario: No-op pending operation echoes the bridge's unchanged token, including zero
- GIVEN a pending `update` operation whose payload is byte-identical to the anime's current stored value
- AND that anime's current bridge token (`modified_at`) is `0`
- WHEN the bridge processes that operation as a no-op
- THEN the operation's `applied_operations` entry has `applied: true`
- AND the entry's serialized JSON body includes the key `"modified_at":0`, present rather than omitted
- AND the entry omits `reason`

#### Scenario: Conflict is reported per-operation without aborting the batch
- GIVEN a pending `update` operation whose base token no longer matches the anime's current bridge token
- WHEN the bridge processes the reconcile request
- THEN the HTTP response status is unchanged at 202 Accepted
- AND the operation's `applied_operations` entry has `applied: false` and `reason: "conflict"`
- AND the entry's `modified_at` is the bridge's current winning token for that anime
- AND the response still includes `last_changelog_id` and `bridge_changes`
- AND operations submitted after the conflicting one are still processed

#### Scenario: Unsupported pending operations are ignored during reconcile
- GIVEN a reconcile request contains pending operations the bridge does not yet support server-side
- WHEN the system processes the request
- THEN unsupported operation types are ignored
- AND the response marks those operations as `applied=false` in `applied_operations`
- AND each such entry has `reason: "unsupported_operation"`
- AND each such entry's serialized JSON body omits the `modified_at` key entirely
- AND supported update-compatible operations are still applied

#### Scenario: A mixed batch preserves submission order and outer response fields
- GIVEN a reconcile request whose `pending_operations` contains one operation the bridge applies, one that conflicts, and one of an unsupported type, in that order
- WHEN the bridge processes the batch
- THEN `applied_operations` contains exactly three entries, in the same order as submitted
- AND the first entry has `applied: true` with `reason` omitted
- AND the second entry has `applied: false`, `reason: "conflict"`, and a present `modified_at`
- AND the third entry has `applied: false`, `reason: "unsupported_operation"`, and an omitted `modified_at`
- AND the response still includes `last_changelog_id` and `bridge_changes`

#### Scenario: A base-less operation after a conflict on the same anime is not applied
- GIVEN a reconcile batch containing two `update` operations for the same `anime_id`, in that order
- AND the first carries a `base` that no longer matches the anime's current bridge token
- AND the second omits `base` entirely
- WHEN the bridge processes the batch
- THEN the first entry has `applied: false` and `reason: "conflict"`
- AND the second entry also has `applied: false` and `reason: "conflict"`
- AND the second operation's payload is NOT written to the anime
- AND both entries carry the same winning `modified_at`
- AND the HTTP response status is unchanged at 202 Accepted

#### Scenario: A based operation after a conflict on the same anime is still evaluated
- GIVEN a reconcile batch containing two `update` operations for the same `anime_id`, in that order
- AND the first carries a stale `base` and is rejected as a conflict
- AND the second carries a `base` equal to the anime's current bridge token
- WHEN the bridge processes the batch
- THEN the first entry has `applied: false` and `reason: "conflict"`
- AND the second entry has `applied: true` with `reason` omitted
- AND the second operation's payload IS written to the anime

#### Scenario: Reason is absent whenever an operation is applied
- GIVEN a reconcile batch containing only operations the bridge applies successfully, including a no-op write
- WHEN the bridge builds `applied_operations`
- THEN every entry has `applied: true`
- AND every entry's serialized JSON body omits the `reason` key entirely

### Requirement: WebSocket Event Coverage

The system MUST emit realtime events using the English wire vocabulary for
any payload that carries anime field data.

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

The system MUST document every English-only REST route and WS event
contract in `docs/openapi.yaml`, reflecting the SDD-56 breaking cutover.

#### Scenario: Route parity gate passes
- GIVEN the SDD-56 implementation is complete
- WHEN `go run ./tools/checkopenapi` is executed
- THEN the check passes with the English-only route/field documentation

### Requirement: WebSocket Reconcile Capture Preserves Protocol Compatibility

The system MUST treat authenticated WebSocket `reconcile` messages as captured mobile requests for observability. This capture MUST preserve the existing mobile message contract, MUST NOT add required client fields or new protocol steps, and MUST NOT change the canonical operation-application semantics of the existing handler.

#### Scenario: Authenticated reconcile message is captured and correlated
- GIVEN an authenticated WebSocket client sends a valid `reconcile` message
- WHEN the bridge applies pending operations and triggers reconcile
- THEN the message is persisted as one sanitized captured mobile request
- AND the capture links any available device, changelog, conflict, or activity correlations

#### Scenario: Rejected authenticated reconcile message is classified safely
- GIVEN an authenticated WebSocket client sends a `reconcile` message rejected by current pending-operation or reconcile rules
- WHEN the bridge rejects that message under the existing handler behavior
- THEN the existing WebSocket protocol behavior stays unchanged
- AND one sanitized captured mobile request is persisted with outcome `rejected`

#### Scenario: Non-reconcile websocket traffic is not reclassified
- GIVEN an authenticated WebSocket client sends `season_rating` or another non-reconcile message
- WHEN the bridge handles that message under current rules
- THEN the existing protocol behavior stays unchanged
- AND no captured mobile request is created for that traffic

#### Scenario: Malformed websocket payload does not change protocol behavior
- GIVEN an authenticated WebSocket client sends malformed JSON
- WHEN the bridge reads the payload
- THEN the existing malformed-message handling stays unchanged
- AND no captured mobile request is created from unreadable content
