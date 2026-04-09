# Writeback Fix Specification

## Purpose

Define the required behavior for durable REST PATCH write-back into `animes.dat`, explicit append-failure surfacing, and precise self-echo suppression.

## Requirements

### Requirement: PATCH success MUST mean the append already exists

The system MUST NOT report a successful `PATCH /api/animes/:id` response until the merged snapshot has been appended as a new JSON line to `animes.dat`.

#### Scenario: Successful PATCH durably appends before returning
- GIVEN an existing anime snapshot and a valid PATCH payload
- WHEN the client sends `PATCH /api/animes/:id`
- THEN the bridge SHALL append exactly one new JSON line for the merged document to `animes.dat`
- AND the appended line SHALL be present before the HTTP handler returns success
- AND the writer SHALL publish `AnimeChangedEvent` only after that append succeeds

### Requirement: Append failures MUST be visible

The system MUST surface append failures instead of returning false-positive success.

#### Scenario: Append failure rejects the PATCH request
- GIVEN the writer cannot append to `animes.dat`
- WHEN the client sends `PATCH /api/animes/:id`
- THEN the request SHALL fail instead of returning 200/204
- AND the failure SHALL be logged with the anime id and target path
- AND the system SHALL emit an explicit write-failure signal on the event bus

### Requirement: Writer confirmation MUST remain serialized

The system MUST preserve the single-writer append-only contract while adding request-cycle acknowledgment.

#### Scenario: Concurrent PATCH requests still use one writer lane
- GIVEN multiple PATCH requests arrive close together
- WHEN the bridge persists their updates
- THEN all appends SHALL still flow through one serialized writer worker
- AND no concurrent append opens against `animes.dat` SHALL be introduced by the fix

### Requirement: Self-echo MUST suppress only the bridge's own write

The watcher MUST ignore the bridge's own appended payload exactly once without hiding unrelated external changes.

#### Scenario: Bridge append is skipped by the watcher
- GIVEN the writer persisted a payload to `animes.dat`
- WHEN the watcher processes the resulting filesystem change
- THEN the watcher SHALL consume the matching self-echo entry
- AND it SHALL NOT publish a duplicate `AnimeChangedEvent` for that same payload

#### Scenario: Failed append does not poison future watcher processing
- GIVEN the writer registered self-echo for a payload but the append failed
- WHEN a later filesystem scan sees a different external change
- THEN the watcher SHALL continue processing that external change normally
- AND stale self-echo state from the failed append SHALL NOT suppress it

### Requirement: Diagnostics MUST distinguish sync traces from write confirmation

The system SHOULD expose write-back success/failure through signals that are not confused with tracer-bullet sync logs.

#### Scenario: Runtime investigation can distinguish flows
- GIVEN an operator inspects runtime logs or bus events after a PATCH attempt
- WHEN the append succeeds or fails
- THEN the available diagnostics SHALL identify the write-back outcome directly
- AND tracer-bullet messages about `SyncRequestedEvent` SHALL NOT be the only observable evidence
