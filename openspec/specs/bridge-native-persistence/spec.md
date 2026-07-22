# Specification: Bridge Native Persistence

New capability introduced by the SDD-55 full cold cut: Bridge stops being a
synchronization bridge to the Legacy Delphi app and becomes the sole owner of
its anime state in SQLite. There is no external source of truth, no
reconciliation, and no way to re-establish a Legacy channel after this change
ships.

## Requirements

### Requirement: SQLite Is the Sole Source of Truth

Bridge MUST treat its own SQLite database as the sole and complete source of
truth for anime state. Bridge MUST NOT read from, write to, watch, or depend
on `animes.dat` or any other Legacy-owned file at any point in its runtime
lifecycle.

#### Scenario: Boot has zero Legacy file references

- **GIVEN** Bridge starts up
- **WHEN** the process initializes its services and background workers
- **THEN** no code path opens, watches, parses, or appends to `animes.dat`
- **AND** startup succeeds using only the SQLite database, with no dependency
  on a Legacy file existing on disk

#### Scenario: Anime state is served without a Legacy fallback

- **GIVEN** a client requests anime state through the REST API or WebSocket
- **WHEN** Bridge resolves the response
- **THEN** it is resolved entirely from SQLite
- **AND** no fallback, reconcile, or catch-up path to a Legacy file is
  consulted

### Requirement: No Runtime Legacy Channel Remains

Bridge MUST NOT contain an fsnotify watcher, startup catch-up, snapshot
reconcile, or ownership-arbitration mechanism for Legacy data. The SDD-48
`bridge_native_registry` / `restore_bridge_native` ownership-arbitration
mechanism MUST be removed entirely, since arbitration between Legacy and
Bridge ownership no longer applies when Legacy is not a data source.

#### Scenario: No filesystem watcher is registered

- **GIVEN** Bridge is running
- **WHEN** its background workers are enumerated
- **THEN** no fsnotify watcher targeting a Legacy directory or file exists

#### Scenario: No ownership arbitration path is reachable

- **GIVEN** the anime domain package
- **WHEN** its exported symbols are inspected
- **THEN** no `bridge_native_registry` or `restore_bridge_native` reconciliation
  contract remains reachable from the application wiring

### Requirement: No Import Path From Legacy Exists

Bridge MUST NOT provide any tool, command, or code path — one-time or
recurring — that imports, migrates, or pulls data from `animes.dat` into
SQLite. Re-establishing a Legacy data channel MUST require reverting this
change in source control, not running a provided tool.

#### Scenario: No import tool ships with the release

- **GIVEN** the shipped Bridge binary and its `tools/` and `cmd/` entry points
- **WHEN** the available commands are enumerated
- **THEN** none of them read or import `animes.dat` into SQLite

### Requirement: Existing SQLite Data Survives the Cut Unmodified

Removing the Legacy channel MUST NOT delete, truncate, or otherwise mutate
existing Bridge SQLite data beyond the additive schema migrations tracked by
the `episode-vocabulary` and `openapi` capabilities. Bridge MUST boot and read
back this data unchanged after the Legacy channel is removed.

#### Scenario: Pre-existing anime rows remain readable after the cut

- **GIVEN** a SQLite database populated before this change, containing anime
  rows previously synchronized from Legacy
- **WHEN** Bridge boots after the Legacy channel is removed
- **THEN** every pre-existing row is still present and readable through the
  SQLite-backed repositories
- **AND** no row is dropped, truncated, or reset as a side effect of removing
  the Legacy channel

### Requirement: Legacy Boundary Linter Is Retired

The `tools/checkarchitecture/legacy_boundary*` static-analysis gate, which
enforced the byte-compat Legacy/Bridge boundary policy, MUST be removed once
the code paths it protected no longer exist. No replacement Legacy-boundary
gate MUST be introduced, since there is no Legacy boundary left to enforce.

#### Scenario: Boundary gate no longer runs

- **GIVEN** the repository's pre-commit and CI gates after this change
- **WHEN** the gate list is inspected
- **THEN** no `legacy_boundary` check remains registered
- **AND** `go test ./...`, `golangci-lint run`, and
  `go run ./tools/checkgofilesize` continue to pass without it

### Requirement: Storage Codec Speaks English

The `internal/anime/store` codec (`wire.go`, `mapper.go`, `create.go`,
`editor_mutation.go`, `projection.go`, `wire_validation.go`) MUST encode and
decode `snapshot_json` using only the English key vocabulary: `id`, `name`,
`episodesWatched`, `status`, `active`, `firstCycle`, `days`, `day`, `order`,
`createdAt`, `premieredAt`, `lastWatchedAt`, `deletedAt`, `totalEpisodes`,
`durationMinutes`, `kind`, `sourceUrl`, `folder`, `origin`, `studios`,
`genres`, `cover`, `repetitions`, `numRepetitions`, `repeatedAt`. No codec
path MUST read or write the superseded Spanish keys (`_id`, `nombre`,
`nrocapvisto`, `estado`, `activo`, `primeravez`, `dias`, `dia`, `orden`,
`fechaCreacion`, `fechaEstreno`, `fechaUltCapVisto`, `fechaEliminacion`,
`totalcap`, `duracion`, `tipo`, `pagina`, `carpeta`, `origen`, `estudios`,
`generos`, `portada`, `repetir`, `numrepeticion`, `fechaRepeticion`) as the
live wire vocabulary. The `dias[].dia` weekday VALUE (e.g. `"Lunes"`) is
unaffected — only the wrapping keys `dias`/`dia` rename to `days`/`day`.

#### Scenario: Codec encodes a new snapshot with English keys

- **GIVEN** the anime store codec creates a new `snapshot_json` payload
- **WHEN** it serializes an anime's fields
- **THEN** every key in the resulting JSON is drawn from the English
  vocabulary
- **AND** no Spanish key from the superseded vocabulary appears in the output

#### Scenario: Codec decodes English-keyed snapshot_json

- **GIVEN** a `snapshot_json` row already stored using English keys
- **WHEN** the codec decodes it into the domain model
- **THEN** every field maps correctly with no data loss

#### Scenario: Weekday value is unaffected by the key rename

- **GIVEN** an anime's `days` array containing an entry with `day: "Lunes"`
- **WHEN** the codec encodes or decodes that entry
- **THEN** the `day` key holds the value `"Lunes"` unchanged — only the key
  name changed from `dia` to `day`, not the Spanish weekday value

### Requirement: `kind` and `sourceUrl` Are the Single Canonical Names

The storage codec, domain model, and editor mutation path MUST converge on
exactly one canonical name per concept: `tipo` / `ContentType` / editor
`kind` all become **`kind`**; `pagina` / `SourceURL` / editor `page` all
become **`sourceUrl`**. No code path reachable from `internal/anime/store`
or `internal/api/contracts/editor.go` MUST retain a second, differently
named field for either concept.

#### Scenario: A single `kind` field round-trips through storage and editor

- **GIVEN** an anime's content-type value
- **WHEN** it flows from the editor mutation path through the storage codec
  and back
- **THEN** exactly one field name, `kind`, carries that value at every layer

#### Scenario: A single `sourceUrl` field round-trips through storage and editor

- **GIVEN** an anime's source-page URL value
- **WHEN** it flows from the editor mutation path through the storage codec
  and back
- **THEN** exactly one field name, `sourceUrl`, carries that value at every
  layer

### Requirement: `$$date` Wrapper Is Flattened to a Plain Epoch-Millis Integer

The storage codec MUST stop wrapping nullable date fields in the NeDB
`{"$$date": <epoch-ms>}` object (`legacyDateWrapper` in `wire.go`) and MUST
instead encode them as a plain integer number of epoch milliseconds, or
`null` when absent. No codec path MUST emit or expect the `$$date` wrapper
key on new writes.

#### Scenario: A date field encodes as a plain integer

- **GIVEN** an anime with a non-null `lastWatchedAt` timestamp
- **WHEN** the codec serializes it into `snapshot_json`
- **THEN** the value is a plain JSON integer of epoch milliseconds
- **AND** it is not wrapped in a `{"$$date": ...}` object

#### Scenario: An absent date field encodes as null

- **GIVEN** an anime with no `deletedAt` timestamp
- **WHEN** the codec serializes it into `snapshot_json`
- **THEN** the field is `null`, not an absent key or a `$$date` wrapper

### Requirement: One-Shot Idempotent Vocabulary Migration Rewrites Every Decode-Reachable Column

The system MUST add a `vocabulary_migrated_at` marker column following the
`schedule_day_migrated_at` marker pattern in `internal/sync/schema_tables.go`,
gating a one-shot content-rewrite pass over **every decode-reachable
Spanish-keyed column across 4 tables (5 columns)**, not just the live
`anime_snapshots` table:

- `anime_snapshots.snapshot_json`
- `changelog.snapshot_json` (rows where the column is non-null)
- `anime_write_operations.base_snapshot_json`
- `anime_write_operations.desired_snapshot_json`
- `conflicts.local_snapshot_json` and `conflicts.remote_snapshot_json`
- `anime_changed_outbox.payload_json` (rows with `status = 'pending'`)

These columns are not decoded through the `AnimeRaw` codec at storage time,
but each is reachable through a finalize, recover, or publish path that would
reintroduce Spanish content after cutover if left unmigrated: bootstrap
`gateway.Recover` finalizes staged write operations *after* this migration
runs, and `finalizeWriteOperation` copies `desired_snapshot_json` verbatim
into both `anime_snapshots.snapshot_json` and
`anime_changed_outbox.payload_json`; `conflicts.{local,remote}_snapshot_json`
are served verbatim as raw bytes over `GET /api/conflicts` with no codec in
the path; and pending `anime_changed_outbox.payload_json` rows are published
verbatim to mobile. All 5 columns MUST therefore be rewritten by the same
migration pass.

The migration MUST run synchronously inside the `TableSchema.Migrate`
bootstrap hook, before any handler, gateway, or background worker performs
its first decode of any of these columns, and specifically before
`gateway.Recover` finalizes any staged write operation. The migration MUST
use a temporary private legacy-Spanish decoder — reachable only from the
migration path, not from any live request-serving code — to read the
pre-cutover Spanish-keyed payloads and MUST re-encode them using the English
codec described above. The migration MUST preserve every field value
unchanged; it is a key rename, not a data transformation, and MUST NOT drop,
truncate, or reinterpret any value. All 5 columns MUST be rewritten inside a
single database transaction: if any row in any of the 4 tables fails to
rewrite, the entire transaction MUST roll back, leaving no table
partially migrated.

#### Scenario: Fresh install has no legacy rows to migrate

- **GIVEN** a brand-new SQLite database with no pre-existing rows in
  `anime_snapshots`, `changelog`, `anime_write_operations`, `conflicts`, or
  `anime_changed_outbox`
- **WHEN** the bootstrap `TableSchema.Migrate` hook runs
- **THEN** the `vocabulary_migrated_at` marker is set
- **AND** no rewrite work is performed, since there is no Spanish-keyed data

#### Scenario: Existing anime_snapshots rows are rewritten to English keys

- **GIVEN** a SQLite database with `anime_snapshots` rows whose
  `snapshot_json` uses the pre-cutover Spanish key vocabulary
- **WHEN** the bootstrap migration runs
- **THEN** every row's `snapshot_json` is rewritten in place to use the
  English key vocabulary
- **AND** every field's value is unchanged from before the migration
- **AND** the `vocabulary_migrated_at` marker is set after the pass completes

#### Scenario: Existing non-null changelog.snapshot_json rows are rewritten

- **GIVEN** a `changelog` table with rows whose `snapshot_json` column is
  non-null and uses the pre-cutover Spanish key vocabulary
- **WHEN** the bootstrap migration runs
- **THEN** every non-null `changelog.snapshot_json` row is rewritten in
  place to use the English key vocabulary, with values unchanged
- **AND** rows with a null `snapshot_json` are left untouched

#### Scenario: Staged write-operation snapshots are rewritten before recovery finalizes them

- **GIVEN** an `anime_write_operations` row with Spanish-keyed
  `base_snapshot_json` and `desired_snapshot_json`, staged before the cutover
  and not yet finalized
- **WHEN** the bootstrap migration runs, followed by `gateway.Recover`
  finalizing that operation
- **THEN** both `base_snapshot_json` and `desired_snapshot_json` are
  rewritten to the English key vocabulary before `Recover` runs
- **AND** `finalizeWriteOperation` copies the already-English
  `desired_snapshot_json` into `anime_snapshots.snapshot_json` and
  `anime_changed_outbox.payload_json`, so no Spanish content reaches the
  migrated `anime_snapshots` table or a mobile publish

#### Scenario: Conflict snapshots are rewritten for verbatim serving

- **GIVEN** a `conflicts` row with Spanish-keyed `local_snapshot_json` and
  `remote_snapshot_json`
- **WHEN** the bootstrap migration runs
- **THEN** both columns are rewritten to the English key vocabulary
- **AND** `GET /api/conflicts`, which serves these columns verbatim as raw
  bytes with no codec in the path, subsequently returns English-keyed JSON

#### Scenario: Pending outbox payloads are rewritten before publish

- **GIVEN** an `anime_changed_outbox` row with `status = 'pending'` and a
  Spanish-keyed `payload_json`
- **WHEN** the bootstrap migration runs
- **THEN** `payload_json` is rewritten to the English key vocabulary before
  `ListPendingAnimeChanged` publishes it verbatim to mobile

#### Scenario: Migration runs before any decode-reachable code path executes

- **GIVEN** the application boot sequence
- **WHEN** the bootstrap hook chain executes
- **THEN** the `vocabulary_migrated_at`-gated content rewrite completes
  before any REST handler, WebSocket gateway, sync worker, or
  `gateway.Recover` finalization performs its first read of any of the 5
  migrated columns

#### Scenario: All 5 columns are rewritten in one transaction

- **GIVEN** the bootstrap migration begins its content-rewrite pass
- **WHEN** it rewrites rows across `anime_snapshots`, `changelog`,
  `anime_write_operations`, `conflicts`, and `anime_changed_outbox`
- **THEN** every rewrite across all 4 tables occurs inside a single database
  transaction
- **AND** if any row fails to rewrite, the transaction rolls back entirely,
  leaving every table exactly as it was before the migration attempt (no
  partially migrated table)

#### Scenario: Re-running the migration is a no-op

- **GIVEN** a database already migrated, with `vocabulary_migrated_at` set
- **WHEN** the application restarts and the migration registry runs again
- **THEN** it detects the marker is already set and skips the rewrite pass
  without error and without re-decoding any row

#### Scenario: Zero data loss verified on a real fixture

- **GIVEN** a SQLite database populated from a real pre-cutover snapshot
  (derived from `resources/autoreas-data/animes.dat` history or an
  equivalent real fixture) with Spanish-keyed data across all 5 migrated
  columns
- **WHEN** the migration runs and the rows are subsequently decoded through
  the English-only codec
- **THEN** every field's value matches the pre-migration value exactly,
  field-for-field, with no row dropped and no value altered, in every one
  of the 4 tables

#### Scenario: The temporary legacy decoder is not reachable from live traffic

- **GIVEN** the application's REST handlers, WebSocket gateway, and sync
  workers
- **WHEN** their code paths are inspected for decoding any of the 5 migrated
  columns
- **THEN** none of them import or call the temporary private legacy-Spanish
  decoder — it is reachable only from the bootstrap migration path

### Requirement: Migration Recomputes Content Hashes and Leaves OCC Tokens Untouched

Because `snapshot_hash`, `base_hash`, and `desired_hash` are SHA-256 digests
of the canonical JSON bytes, renaming keys changes those bytes and therefore
changes the correct hash value. The migration MUST recompute
`anime_snapshots.snapshot_hash` from the rewritten `snapshot_json` using
`anime.HashSnapshot`, and MUST recompute
`anime_write_operations.base_hash`/`desired_hash` from the rewritten
`base_snapshot_json`/`desired_snapshot_json` using the same canonical
hashing function. Skipping hash recomputation MUST NOT be an accepted
implementation, since a stale hash would silently break OCC comparison and
write-operation dedup. Conversely, `modified_at` — the integer mobile OCC
token — MUST be left completely untouched by the migration: it carries no
Spanish vocabulary and its value MUST be bit-for-bit identical before and
after the migration, so no mobile client's cached OCC state is invalidated
by this change.

#### Scenario: snapshot_hash is recomputed after key rewrite

- **GIVEN** an `anime_snapshots` row whose `snapshot_json` is rewritten from
  Spanish to English keys by the migration
- **WHEN** the migration completes that row's rewrite
- **THEN** `snapshot_hash` is recomputed from the new English-keyed bytes
  using `anime.HashSnapshot`
- **AND** it is not left holding the hash of the pre-migration Spanish bytes

#### Scenario: base_hash and desired_hash are recomputed for staged operations

- **GIVEN** an `anime_write_operations` row whose `base_snapshot_json` and
  `desired_snapshot_json` are rewritten by the migration
- **WHEN** the migration completes that row's rewrite
- **THEN** `base_hash` and `desired_hash` are each recomputed from their
  respective rewritten English-keyed bytes
- **AND** neither hash is left holding a value computed from the
  pre-migration Spanish bytes

#### Scenario: modified_at is untouched by the migration

- **GIVEN** an `anime_snapshots` row with a `modified_at` OCC token value
- **WHEN** the migration rewrites that row's `snapshot_json` and recomputes
  `snapshot_hash`
- **THEN** `modified_at` holds the exact same integer value it held before
  the migration
- **AND** no mobile client's OCC comparison against that token is
  invalidated by this change

### Requirement: Existing SQLite Data Survives the Vocabulary Cutover Unmodified

The vocabulary migration MUST NOT delete, truncate, or lose any pre-existing
row or field value beyond the intentional key rename. Bridge MUST boot and
serve this data correctly after the cutover, exactly as it did before, modulo
the renamed keys.

#### Scenario: Pre-existing anime rows remain readable and correct after the cutover

- **GIVEN** a SQLite database populated before this change, containing anime
  rows with Spanish-keyed `snapshot_json`
- **WHEN** Bridge boots after the vocabulary cutover ships
- **THEN** every pre-existing row is present, decodes successfully under the
  English-only codec, and every field's value matches what was stored before
  the cutover
