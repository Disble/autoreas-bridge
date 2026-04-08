# SDD-10 Specification: REST API Write & Sync

## Purpose

Defines the requirements and behaviors for the `PATCH /api/animes/:id` and `POST /api/sync/reconcile` endpoints, including anti-zombie constraints and cross-field state machine rules.

## Requirements

### Requirement: PATCH /api/animes/:id Happy Path

The system MUST accept valid PATCH requests to update an anime, applying changes and stamping the server timestamp.

#### Scenario: Valid update with fractional chapter
- GIVEN a valid bearer token AND an active anime
- WHEN the client sends `PATCH /api/animes/:id` with `{"nrocapvisto": 0.5}`
- THEN the system updates `nrocapvisto` to 0.5
- AND the server MUST stamp its own timestamp
- AND returns 200/204

#### Scenario: Update inactive anime
- GIVEN a valid bearer token AND an inactive anime (`activo=false`) present in snapshots
- WHEN the client sends `PATCH /api/animes/:id` with valid data
- THEN the system applies the update
- AND returns 200/204

### Requirement: Validation Errors

The system MUST validate payload and authorization, returning appropriate HTTP errors.

#### Scenario: Missing authorization
- GIVEN an unauthenticated client
- WHEN the client sends a PATCH request
- THEN the system returns 401 Unauthorized

#### Scenario: Invalid state value
- GIVEN a valid bearer token
- WHEN the client sends `estado=4` or negative `nrocapvisto`
- THEN the system returns 400 Bad Request

### Requirement: Anti-Zombie Protection

The system MUST NOT allow recreation or updating of tombstoned records.

#### Scenario: Tombstoned ID
- GIVEN an anime tombstoned (`$$deleted: true`) in `animes.dat` but absent from `anime_snapshots`
- WHEN the client sends a PATCH request for this ID
- THEN the system returns 404 Not Found

### Requirement: Cross-Field State Machine

The system MUST automatically enforce the `estado` to 1 (Finalizado) when `nrocapvisto` reaches or exceeds `totalcap` (> 0).

#### Scenario: Auto-completion
- GIVEN an anime with `totalcap=12`
- WHEN the client sends `{"nrocapvisto": 12}`
- THEN the system forces `estado=1` (Finalizado) regardless of the payload

#### Scenario: No auto-completion for missing totalcap
- GIVEN an anime with `totalcap=0` or `null`
- WHEN the client sends `{"nrocapvisto": 12}`
- THEN the system MUST NOT auto-force `estado=1`

### Requirement: Clock Skew / Timestamp

The system MUST ignore client-provided timestamps and generate its own.

#### Scenario: Client sends timestamp
- GIVEN a valid PATCH request with a client timestamp
- WHEN the system processes the request
- THEN the client timestamp is discarded
- AND the server stamps `time.Now().UnixMilli()` and publishes it in `AnimeUpdateRequestedEvent`

### Requirement: Full Payload Integrity

The system MUST load the full snapshot, merge patch fields, and publish the complete document.

#### Scenario: Merge and publish
- GIVEN a valid PATCH request with partial data
- WHEN the system processes the request
- THEN the system loads the full effective record from `anime_snapshots`
- AND merges only the patch fields without dropping untouched fields
- AND publishes the complete merged document

### Requirement: Sync Reconcile

The system MUST accept valid POST requests to trigger a sync reconciliation.

#### Scenario: Valid sync trigger
- GIVEN a valid bearer token
- WHEN the client sends `POST /api/sync/reconcile`
- THEN the system returns 202 Accepted
- AND triggers `SyncRequestedEvent` on the event bus

### Requirement: Method Enforcement

The system MUST prohibit unauthorized methods inherited from SDD-09.

#### Scenario: Forbidden POST/DELETE
- GIVEN any client (authenticated or not)
- WHEN the client sends `POST /api/animes` or `DELETE /api/animes/:id`
- THEN the system returns 405 Method Not Allowed
