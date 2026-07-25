# Delta for Observability

## ADDED Requirements

### Requirement: Capture Storage Uses Transport-Neutral Names

Captured request telemetry MUST be stored under transport-neutral names, because the capture pipeline records every `/api/*` request, every inbound WebSocket reconcile message, and every hub connection/broadcast event — not only mobile-originated traffic. The capture table MUST be named `request_captures`, its metadata table `request_capture_metadata`, its schema-version key `request_capture_schema_version`, and its indexes MUST carry the matching `idx_request_captures_*` names. The stored capture schema version MUST be `3`.

#### Scenario: Fresh database is created with the transport-neutral names

- GIVEN a bridge database that has never been bootstrapped
- WHEN bootstrap runs
- THEN the database MUST contain `request_captures` and `request_capture_metadata`
- AND it MUST contain the five `idx_request_captures_*` indexes
- AND `request_capture_schema_version` MUST be `3`
- AND no table, index, or metadata key named `mobile_request_capture*` MUST exist
- AND no rename operation MUST have been executed

#### Scenario: Capture behavior is unchanged by the rename

- GIVEN a request, WebSocket message, or hub broadcast that was captured before the rename
- WHEN the same event is captured after the rename
- THEN the recorded row MUST carry the same columns, values, sanitization, correlations, and enrichment merge result as before
- AND the emitted `capture.transaction` runtime event MUST carry the unchanged `CaptureRow` wire shape

### Requirement: Existing Capture Tables Are Renamed Without Data Loss

Bootstrapping a database that already holds the previously-named capture tables MUST rename them in place using `ALTER TABLE ... RENAME TO`, preserving every existing row and column value. The rename MUST run before the schema-descriptor pass that would otherwise create a fresh empty table under the new name, MUST also retire the previously-named indexes and the previously-named schema-version key, and MUST be idempotent across repeated bootstraps.

#### Scenario: Existing capture rows survive the rename

- GIVEN a bridge database containing `mobile_request_captures` with captured rows and `mobile_request_capture_metadata` at schema version `2`
- WHEN bootstrap runs
- THEN `request_captures` MUST contain exactly the same rows, with identical column values, that `mobile_request_captures` held
- AND `mobile_request_captures` and `mobile_request_capture_metadata` MUST no longer exist
- AND `request_capture_schema_version` MUST be `3`
- AND the previously-named `mobile_request_capture_schema_version` key MUST no longer exist

#### Scenario: A new empty capture table is never created alongside existing data

- GIVEN a bridge database whose capture data lives under the previous table name
- WHEN bootstrap runs
- THEN the system MUST NOT create an empty `request_captures` table while leaving the populated previously-named table in place
- AND no captured row MUST be orphaned or unreachable through the read path

#### Scenario: Stale index names do not survive

- GIVEN a bridge database carrying the five previously-named capture indexes
- WHEN bootstrap runs
- THEN no `idx_mobile_request_captures_*` index MUST remain
- AND the five `idx_request_captures_*` indexes MUST exist on `request_captures`

#### Scenario: Rename is idempotent

- GIVEN a database that has already been renamed and stamped at schema version `3`
- WHEN bootstrap runs again
- THEN the rename step MUST be a no-op
- AND the schema, index set, row set, and version stamp MUST be unchanged

### Requirement: Capture Read Path Tolerates Both Table Generations

The capture read path MUST resolve the live capture and metadata table names once when the database is opened, preferring the transport-neutral names and falling back to the previously-named tables. It MUST accept stored schema versions `1`, `2`, and `3`. A database that is valid but not yet renamed MUST open and serve reads — the read path MUST NOT fail closed on a recognizable older generation. Only a database with neither table generation present constitutes a missing capture schema.

#### Scenario: Un-migrated database still opens and serves

- GIVEN a bridge database still holding `mobile_request_captures` / `mobile_request_capture_metadata` at schema version `2`
- WHEN the read path opens it and executes a search, get, resolve, or summary
- THEN the open MUST succeed
- AND the results MUST be identical to those the same rows produce after the rename

#### Scenario: Migrated database is preferred

- GIVEN a bridge database holding `request_captures` / `request_capture_metadata` at schema version `3`
- WHEN the read path opens it
- THEN the transport-neutral tables MUST be the ones queried
- AND the open MUST succeed without consulting the previously-named tables

#### Scenario: Neither generation present still fails closed

- GIVEN a bridge database containing neither `request_captures` nor `mobile_request_captures`
- WHEN the read path opens it
- THEN the open MUST fail with a schema-mismatch error
- AND it MUST NOT fabricate an empty successful result

#### Scenario: Unsupported version is rejected

- GIVEN a capture metadata row stamping an unrecognized schema version
- WHEN the read path opens the database
- THEN the open MUST fail with a schema-mismatch error

### Requirement: Mobile-Protocol Surface Is Unaffected

The rename MUST be confined to the capture and MCP sidecar surface. Every identifier, file, spec, and document that genuinely describes the mobile application or the desktop-mobile sync protocol MUST remain unchanged.

#### Scenario: Mobile sync contract is untouched

- GIVEN the `mobile-sync-contract` capability, the mobile anime DTOs and their query ports, the mobile pairing/QR and OCC documents, the mobile activity/grade source values, and the mobile pairing deep-link scheme
- WHEN the capture nomenclature rename is applied
- THEN none of them MUST be renamed, moved, or altered
- AND the REST, WebSocket, and pairing wire contracts MUST be byte-identical to before the change
