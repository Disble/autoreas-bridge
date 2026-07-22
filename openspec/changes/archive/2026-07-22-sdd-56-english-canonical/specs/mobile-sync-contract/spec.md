# Delta for Mobile Sync Contract

SDD-16 defined the mobile-facing REST/WS contract using the Legacy-Spanish
field vocabulary (`_id`, `nombre`, `estado`, `nrocapvisto`, `activo`,
`primeravez`, `dias`, `generos`, `portada`, date fields, …), since Bridge's
storage codec spoke Spanish. SDD-56 performs a hard cutover of the storage
codec to English (see the `bridge-native-persistence` delta), and this
delta updates the mobile-facing serialization contract to match: every
field the mobile client reads from `GET /api/animes`,
`GET /api/animes/{id}`, `GET /api/animes/changes`, and WebSocket payloads
is now English, with no Spanish field name emitted anywhere. This is a
**breaking** change for `autoreas-mobile`, coordinated per the `openapi`
delta's lockstep-deploy requirement.

## MODIFIED Requirements

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

### Requirement: OpenAPI Parity

The system MUST document every English-only REST route and WS event
contract in `docs/openapi.yaml`, reflecting the SDD-56 breaking cutover.

#### Scenario: Route parity gate passes

- GIVEN the SDD-56 implementation is complete
- WHEN `go run ./tools/checkopenapi` is executed
- THEN the check passes with the English-only route/field documentation
