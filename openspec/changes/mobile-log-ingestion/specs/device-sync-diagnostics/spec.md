# Device Sync Diagnostics Specification

## Purpose

Defines `POST /api/sync/diagnostics`: the bridge-owned endpoint, wire
contract, storage schema, and validation rules that let a mobile device
durably report sync-cycle diagnostics instead of losing them on delivery
failure.

## Requirements

### Requirement: Authenticated Ingest With Closed-Vocabulary Validation

The system MUST expose `POST /api/sync/diagnostics`, on a path distinct from
the `/api/devices/` subtree, authenticated through the existing
`authenticate` seam. The handler MUST strict-decode
(`DisallowUnknownFields()`) into a bridge-owned contract type, never a
passthrough map. Every enumerated field MUST be validated against its closed
vocabulary; an off-list value MUST be rejected with `400 Bad Request` naming
the field, never coerced to `unknown` or any other member.

| Field | Members |
|---|---|
| `outcome` | `completed`, `failed`, `never_closed` |
| `trigger_source` (top level) | `foreground_service`, `background_task` |
| `previous_cycle.trigger_source` | `bootstrap, manual, app_active, network_regained, local_mutation, local_mutation_write, ws_sync_required, foreground_service, background_task` |
| `last_stage` (nullable) | `open, config, attempt_started, cycle_activated, backlog_read, claim_ops, http, parse_response, apply_write, prune, closed` |
| `error_name` | `LocalWriteError, BridgeTimeoutError, BridgeUnreachableError, ReconcileHttpError, SchemaValidationError, unknown` |
| `error_stage` | `begin, task, commit, rollback, deadline, unknown` |
| `error_cause` | `closed_resource, lock_contention, disk_full, io_error, timeout, unreachable, unknown` |
| `recent_events[].source` | `sync_cycle, websocket, mutation, foreground_resync, background_task, startup, reconcile_conflict` |
| `recent_events[].event` | `ws_opened, ws_closed, ws_error, ws_reconnect_scheduled, mutation_failed, mutation_sync_failed, resync_failed, write_failed, headless_task_registered, headless_task_missing, conflict_reason_unrecognized, conflict_token_missing, conflict_operation_stalled` |
| `degraded` (nullable) | `events, error_detail, previous_cycle` |

`unknown` is a valid member of three vocabularies; only unlisted values are
rejected. `app_state` is persisted but MUST NOT be a filter dimension —
mobile always reports `background`; top-level `trigger_source` is the
trustworthy one.

`trigger_source` (top level) and `previous_cycle.trigger_source` MUST be
validated as two distinctly named vocabularies that share a name but not a
domain: the top-level field answers which scheduler sent this telemetry,
deliberately narrow because only the two headless call sites emit
telemetry, and a value outside its two members MUST fail loudly as a client
bug. The nested field answers which scheduler ran the previous cycle, a
column any sync-recording caller writes — including foreground paths that
never send telemetry — so it MUST accept the full nine-member vocabulary.

#### Scenario: Unauthenticated or malformed request is rejected
- GIVEN no/invalid bearer token, an undeclared field, or an off-list vocabulary value
- WHEN the request reaches the handler
- THEN the bridge returns `401` (auth) or `400` naming the field (contract/vocabulary), and inserts nothing

#### Scenario: A vocabulary's own `unknown` member is accepted
- GIVEN a body whose `error_name` is `unknown`
- WHEN the handler validates it
- THEN the request is accepted

#### Scenario: The two `trigger_source` vocabularies are not interchangeable
- GIVEN a body with `previous_cycle.trigger_source` of `local_mutation` and top-level `trigger_source` of `background_task`
- WHEN the handler validates it
- THEN the request is accepted
- AND a body with top-level `trigger_source` of `local_mutation` instead is rejected with `400` naming the field

### Requirement: Shape-Constrained Fields Are Bounded, Not Enumerated

Two envelope fields are validated by shape rather than by a closed
vocabulary. `error_fingerprint` (nullable) MUST match `^[0-9a-f]{8}$` —
exactly 8 lowercase hex characters, fixed length, not a range — because it
is FNV-1a rendered as `(hash >>> 0).toString(16).padStart(8, '0')`. It is
non-null only for an unrecognized error class, the novel failure this field
exists to group, so a stricter or identifier-shaped pattern would reject
exactly the most valuable payloads. `native_errcode_byte` (nullable) MUST be
a bounded integer `0..65535`; it is a char code, not a SQLite result code —
`5` means the control byte was `0x05`, NOT `SQLITE_BUSY` — and the column
MUST NOT be named `error_code`.

#### Scenario: A digit-leading error_fingerprint is accepted
- GIVEN `error_fingerprint` is `"3f2a91b0"`
- WHEN the handler validates it
- THEN the request is accepted

#### Scenario: native_errcode_byte out of range is rejected
- GIVEN `native_errcode_byte` is `70000`
- WHEN the handler validates it
- THEN the bridge returns `400 Bad Request` naming `native_errcode_byte`

### Requirement: `recent_events` And `previous_cycle` Wire Shape

`recent_events` MUST be accepted up to 32 entries and rejected beyond that;
the server MUST re-serialize it from its own validated values before
persisting, never the client's raw bytes. The `previous_cycle` key MUST
always be present and MAY be explicitly `null`; a missing key MUST be
rejected with `400`. Rejecting a missing key is safe because the client
sheds by assignment, never by omission (`recent_events: []`,
`previous_cycle: null`) — every key is present on every legitimately
degraded payload, so a missing key can only mean a malformed client, never
shed data. Inside a non-null `previous_cycle`, only `outcome` is required
non-null — every other field, including `cycle_id`, MUST be independently
nullable and accepted as null. The schema MUST store the reporting
`cycle_id` (`UNIQUE NOT NULL`) and `previous_cycle_id` (nullable,
unconstrained) as two distinct columns.

#### Scenario: Persisted events reflect validated values
- GIVEN a valid `recent_events` array
- WHEN the row is persisted
- THEN the stored JSON is re-serialized from validated values, not copied from the request

#### Scenario: previous_cycle nullability is exact
- GIVEN body A omits `previous_cycle`, body B sets it non-null with every field null except `outcome` (including `cycle_id`)
- WHEN each is validated
- THEN A is rejected with `400`, and B is accepted with its nulls stored as given

### Requirement: `degraded` Records What Is Absent, Not Whether It Was Dropped

A nullable `degraded` column MUST be validated like any vocabulary and
required-key from the first request. It MUST be a top-level envelope field
positioned immediately after `cycle_id` — never nested under a `meta`
object — because it is metadata about the transmission that qualifies every
field below it, not an observation about the cycle; envelope order MUST be
`cycle_id, degraded, trigger_source, app_state, previous_cycle, counters,
recent_events`. One field does not earn a nested level; promoting `degraded`
into a container is a deliberate future contract change, not a default.

Its meaning MUST be exactly: each value implies every lighter piece is
ABSENT from this payload — shed or never present — never that a lighter
piece was dropped. The shed order `events` → `error_detail` →
`previous_cycle` MUST be treated as a two-sided contract this meaning
depends on, not an implementation detail. `degraded` MUST NOT be indexed.

`degraded` MUST be documented and treated as a FIDELITY signal, not a health
signal: its value is decided by the client's size cap at serialization
time, not by anything the cycle observed. A perfectly healthy cycle with a
full event ring MAY still ship `degraded: "events"`. No reader, dashboard,
or the OpenAPI field description MUST treat `degraded IS NOT NULL` as
indicating device or cycle health.

#### Scenario: A degraded payload is distinguishable from a first-run payload
- GIVEN two rows share `recent_events: []` and `previous_cycle: null`, one with `degraded: "previous_cycle"` and one with `degraded: null`
- WHEN both are read back
- THEN they remain distinguishable by `degraded`

#### Scenario: A degraded flag does not imply an unhealthy cycle
- GIVEN a cycle completed successfully with a full event ring that exceeded the client's size cap
- WHEN the envelope is serialized with `degraded: "events"` and stored
- THEN the record's `outcome` remains `completed`, and `degraded` is not read as a failure or health indicator

#### Scenario: Contract and documentation preserve envelope order
- GIVEN the bridge-owned contract type and its OpenAPI schema
- WHEN either is inspected
- THEN `degraded` appears immediately after `cycle_id`, ahead of `trigger_source`, `app_state`, `previous_cycle`, `counters`, and `recent_events`

### Requirement: Insert Is Idempotent By `cycle_id`

Idempotency, not the write-budget timeout, MUST be treated as load-bearing
for answering "did it land?": mobile cannot reliably observe a timeout in
the scenario this endpoint targets, so `cycle_id` MUST be `UNIQUE NOT NULL`,
and re-inserting an existing `cycle_id` MUST be a no-op
(`ON CONFLICT DO NOTHING`) that still returns `2xx` and creates no second
row — this is what lets mobile retry blind and remain correct. A conflict
no-op MUST NOT count toward the retention prune counter. No foreign key
MUST exist from `previous_cycle_id` to `cycle_id`.

#### Scenario: Duplicate cycle_id acks without duplicating
- GIVEN a row with a given `cycle_id` already exists
- WHEN the same `cycle_id` is POSTed again
- THEN the bridge returns `2xx`, and exactly one row for that `cycle_id` exists afterward

### Requirement: Write Budget Bounds The Database Call, Not The Response

The insert MUST run under a `context.WithTimeout` of 2 seconds, scoped to
the database call only, never the response. Preempting SQLite's own
`busy_timeout` (5000 ms) at 2 s MUST be treated as deliberate per-route
policy, not an accidental shortening: diagnostics is the lowest-value
traffic in the system and MUST yield rather than compete, and under
`SetMaxOpenConns(1)` the dominant wait is the `database/sql` pool wait, not
SQLite lock contention. This deadline MUST be treated as load-bearing rather
than a tuning preference: mobile's client-side timeout is suspended by
Android inside the headless background task, so in exactly the case this
endpoint exists for, mobile has no working client timeout — the bridge's
own deadline is the only exit, and answering sooner is strictly better than
waiting longer.

On expiry the handler MUST return `503 Service Unavailable` with a
`Retry-After: 5` header immediately, without waiting further for the
connection. It MUST NOT return `204` on expiry, and MUST NOT hold the
request open past the deadline. `5` (seconds) MUST sit comfortably above
the 2 s budget, so an immediate retry does not re-enter the same
contention, and well below mobile's 15 s foreground-service tick and
15-minute background interval, so it is honored naturally by the client's
own retry cadence.

#### Scenario: Expiry sheds immediately under contention
- GIVEN the single database connection is held by another writer past 2 seconds
- WHEN a diagnostics POST arrives
- THEN the bridge returns `503` with `Retry-After: 5` within approximately 2 seconds
- AND the response MUST NOT be `204`
- AND WHEN the holding writer then releases the connection
- THEN no row is EVER inserted for that shed request

Both trailing clauses are load-bearing and MUST NOT be simplified away. A
response deadline — one bound to the HTTP response rather than to
`ExecContext` — returns `503` at the budget too and is still queued at that
moment, so it passes a status assertion, an elapsed-time assertion, and a
row-count check taken immediately after the response. It diverges only after
the holder releases: the abandoned handler is still waiting, acquires the
connection, and inserts the row. Releasing the holder and re-checking is
therefore the only observable difference between a correct implementation and
a broken one, which makes this the most degradable scenario in this
specification.

### Requirement: Retention Caps Table Growth

The table MUST enforce a 5,000-row cap, pruning oldest-first by
`reported_at_ms` every 100 successful writes, with the prune counter seeded
from the existing row count at construction.

#### Scenario: Row count stays bounded under sustained writes
- GIVEN sustained inserts exceeding 5,000 rows across a process restart
- WHEN pruning runs at its configured cadence
- THEN the table never exceeds 5,000 rows by more than one prune cycle's writes

### Requirement: Reconcile Compatibility And Documentation

`ReconcileRequest` MUST declare `client_telemetry` as an accepted, ignored
field of unconstrained shape; reconcile decoding MUST NOT gain
`DisallowUnknownFields()` until mobile cuts over, and behavior MUST NOT
change based on the field's presence, absence, or shape. `docs/openapi.yaml`
MUST document the new endpoint (request/response, auth, error codes) and
mark `client_telemetry` optional, accepted, ignored, and deprecated.

#### Scenario: Reconcile behavior is unchanged by the field
- GIVEN a reconcile body carries `client_telemetry` with an arbitrary or evolving shape
- WHEN the reconcile handler processes it
- THEN the outcome and response are identical to the same request without that field

### Requirement: Cutover Signal Is A Floor, Not A Census

The dual-write cutover decision — retiring the `client_telemetry` piggyback
once the endpoint delivers at or above piggyback volume and carries
`cycle_id`s the piggyback never sent — MUST be documented as a floor, not a
census. Unmatched `cycle_id`s on the endpoint prove recovery is happening;
their absence MUST NOT be read as proof a cycle never ran, because mobile's
outbox is size-bounded with an eviction policy and MAY evict an envelope
before delivery under sustained contention. No consumer MUST treat the
endpoint's row count as a complete record of every sync cycle that occurred.

#### Scenario: Absent cycle_id does not imply the cycle never ran
- GIVEN mobile's outbox evicted an envelope under sustained contention before it could be delivered
- WHEN the endpoint's stored rows are reviewed for that time window
- THEN the missing `cycle_id` MUST NOT be interpreted as evidence that cycle never executed
