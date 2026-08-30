# Observability Specification

## Purpose

This specification defines shared bridge observability for terminal output and the Wails dashboard.

## Requirements

### Requirement: Shared Structured Logging

The system MUST provide a shared logging contract for bridge domains that produces normalized log entries with at least a domain, message, and timestamp.

#### Scenario: Terminal output remains human-readable
- GIVEN a bridge component records an operational event
- WHEN the shared logger writes to stdout
- THEN the rendered line MUST preserve the `domain: message` prefix style
- AND the message MUST be readable without frontend tooling

#### Scenario: Recent logs can be queried
- GIVEN log entries have been recorded
- WHEN a consumer requests recent logs
- THEN the system MUST return entries in newest-known buffer order
- AND the result MUST be bounded to in-memory retention

### Requirement: Domain Runtime Events Are Observable

The system MUST log meaningful runtime events for anime, sync, api, websocket, and system
flows. Each such event MUST carry its declared domain, and events about a product entity
MUST carry that entity's identifier and an event type in the guarded `domain.verb` shape, so
the event can be located by what happened and to what, rather than only by free-text search
over its message. The redundant `http.request` log line MUST be removed from the api domain
because the capture middleware is its full-fidelity, structured replacement.
(Previously: the `api` domain logged an `http.request` line per request via
`RequestLoggingMiddleware`, duplicating what the mobile-request capture pipeline already
recorded per handler.)

> **Merge note — SDD-65 Slice 0.** This requirement is the union of two changes that were
> applied out of archive order: `capture-middleware-realtime` (`0c0957c`, 2026-07-25) removed
> the `http.request` line, and SDD-64 (`e22d6b6`, 2026-08-30, already archived) added the
> declared-domain / guarded `domain.verb` / entity-locatability contract. Applying the older
> delta verbatim would have deleted SDD-64's later text, so both are kept; both hold in code.

#### Scenario: Anime runtime activity is logged

- GIVEN startup catch-up, watcher, or writer activity occurs
- WHEN the component completes an important step or warning path
- THEN the logger MUST record an entry in the `anime` or `system` domain

#### Scenario: Sync and websocket propagation is logged

- GIVEN an `anime.changed` flow reaches sync or websocket boundaries
- WHEN downstream services react
- THEN the logger MUST record the receiving or forwarding action with the relevant domain prefix

#### Scenario: An event about an entity is locatable by that entity

- GIVEN a runtime event is recorded about a specific anime
- WHEN the event log is queried by that anime's identifier
- THEN the event is returned
- AND the event carries an event type in the guarded `domain.verb` shape

#### Scenario: HTTP request log line is no longer emitted
- GIVEN a request completes through the capture middleware
- WHEN the middleware finishes recording the capture row
- THEN the `api` domain MUST NOT emit a separate `http.request` log line for that request
- AND the capture row remains the source of truth for that request's transport facts

### Requirement: Wails Exposes Recent Logs

The Wails app facade MUST expose recent in-memory log entries through a public binding.

#### Scenario: Frontend bootstraps dashboard state
- GIVEN the bridge has accumulated recent log entries
- WHEN the React frontend calls `GetRecentLogs()`
- THEN the method MUST return a serializable collection of log entries
- AND the call MUST NOT panic before or after startup completes

#### Scenario: Empty buffer is supported
- GIVEN no log entries have been recorded yet
- WHEN `GetRecentLogs()` is called
- THEN the method MUST return an empty collection

### Requirement: Dashboard Feed Stays Live

The frontend MUST display bridge runtime log entries under a clearly-named Runtime Events
surface, separate from the Activity Transactions view, and MUST update that feed during the
same application session without requiring manual refresh. The rendered feed MUST be the page
returned by the persisted runtime-event read path (see `activity-runtime-events`); entries
pushed live during the session MUST overlay that page rather than replace it. Activity MUST NOT
render `ObservabilityLogEntry` rows as if they were HTTP transactions.
(Previously: the feed rendered the recent buffered entries returned by the in-memory ring
buffer, under a separate "Events" route that no longer exists.)

#### Scenario: Runtime Events shows durable history
- GIVEN the Wails UI opens after backend activity already happened, including activity from an earlier run of the process
- WHEN the Runtime Events surface mounts
- THEN it MUST render the persisted runtime events the backend returns for the active filters
- AND that history MUST NOT be limited to entries recorded since the current process started

#### Scenario: Dashboard receives new entries
- GIVEN the Runtime Events surface is already mounted
- WHEN a new log-worthy backend event occurs
- THEN the new entry MUST appear in the feed during the active session
- AND the already-rendered persisted entries MUST remain ordered and visible

#### Scenario: Activity no longer mislabels the event log
- GIVEN a user opens the Activity Transactions view
- WHEN the view renders
- THEN it MUST show captured HTTP transactions (per `activity-network-transactions`), not `ObservabilityLogEntry` rows
- AND the runtime event log MUST remain reachable under its own clearly-named Runtime Events surface

### Requirement: Committed Writes Declare Their Changed Fields By Derivation

The system MUST record, for every committed anime write, the set of top-level snapshot
fields whose value differs between the operation's base snapshot and its desired snapshot.
That set MUST be derived inside the same transaction that finalizes the write, from the
snapshot pair the transaction already holds. It MUST NOT depend on any producer passing a
declared field list, because a declared list can be omitted without any failure surfacing.

The derived set MUST travel with the committed change to every downstream consumer that
already carries a changed-field list, so that the changelog reflects what actually changed
rather than an empty envelope.

#### Scenario: A single-field write declares exactly that field

- GIVEN an anime whose stored snapshot has a cover, three scheduled days, and two genres
- WHEN an editor save commits a write that changes only the cover
- THEN the recorded changed-field set contains the cover field
- AND it does not contain the days field or the genres field

#### Scenario: A write that empties a collection declares that collection

- GIVEN an anime whose stored snapshot has three scheduled days
- WHEN a write commits a desired snapshot whose days collection is empty
- THEN the recorded changed-field set contains the days field

#### Scenario: A no-op write declares no fields

- GIVEN an anime with a stored snapshot
- WHEN a write commits a desired snapshot identical to the base snapshot
- THEN the recorded changed-field set is empty
- AND the empty set is recorded as an empty list, never as a null or absent value

#### Scenario: Derivation survives a producer that passes nothing

- GIVEN a publishing service that supplies only the desired payload and no field list
- WHEN its write commits
- THEN the recorded changed-field set is still complete and correct
- AND no code path allows a committed write to record an empty set while fields differ

### Requirement: Silent Collection Truncation Is Detectable

The system MUST provide a repeatable check that identifies committed writes which reduced a
collection-valued snapshot field from non-empty to empty while that field was not part of
the write's intent. The check MUST operate over already-persisted write-operation data and
MUST NOT require new runtime instrumentation.

The check MUST report enough per-row identity for the result to serve directly as a recovery
list: the affected entity, the field, and when the write committed.

#### Scenario: A cover-only save that empties the schedule is reported

- GIVEN a committed write whose base snapshot has a non-empty days collection
- AND whose desired snapshot has an empty days collection
- AND whose changed-field set does not contain the days field
- WHEN the truncation check runs
- THEN that write is reported, naming the entity, the field, and the commit time

#### Scenario: An intentional clear is not reported

- GIVEN a committed write that empties the days collection
- AND whose changed-field set contains the days field
- WHEN the truncation check runs
- THEN that write is not reported

#### Scenario: A clean database reports nothing

- GIVEN no committed write reduced a collection from non-empty to empty outside its intent
- WHEN the truncation check runs
- THEN the check reports no findings and succeeds

### Requirement: Runtime Event Types Follow A Guarded Shape

Every runtime event type MUST name a domain and an action within it, in the shape
`domain.verb`, and that rule MUST be enforced by an automated check rather than left to
convention. A grouping over event type therefore partitions events into buckets that mean
something.

The rule is a SHAPE rather than a closed list of constants because at least one bounded
context emits its event types through a wrapper that takes the value as a parameter,
generating many values at its call sites; a central registry would fight that design
without improving the grouping.

#### Scenario: An event type names a domain and an action

- GIVEN a component emits a runtime event with a structured event type
- WHEN the vocabulary guard runs over the source
- THEN every emitted event type is accepted only if it names a domain and an action

#### Scenario: A subject with no action is rejected

- GIVEN a component emits an event type that names only a subject
- WHEN the vocabulary guard runs
- THEN the check fails and names the offending value and its file

### Requirement: Health Rollups Exclude Synthetic Entities

The system MUST distinguish runtime events about real product entities from events emitted
by demonstration or self-test harnesses. Any health rollup, coverage ratio, or dashboard
figure derived from runtime events MUST exclude synthetic entities.

A component MUST NOT derive an event's domain by parsing the text of its own message.

#### Scenario: A tracer-bullet event does not count toward health

- GIVEN the tracer bullet has emitted its demonstration event sequence
- WHEN a health rollup over runtime events is computed
- THEN none of those tracer-bullet events contributes to the rollup

#### Scenario: A domain is declared, not parsed from prose

- GIVEN a component records a message that contains a colon-separated prefix
- WHEN the resulting runtime event is persisted
- THEN its domain is the domain the component declared
- AND the domain is not affected by the message text

### Requirement: Real-Entity Event Coverage Is Measurable

The system MUST make it possible to compute the proportion of committed anime writes that
emitted a corresponding runtime event about the same real entity. The measure MUST be
expressed as a ratio over committed writes, not as an event count, so that synthetic or
transport traffic cannot inflate it.

#### Scenario: A silent write path lowers coverage

- GIVEN committed anime writes exist
- AND one write path commits without emitting a runtime event for its entity
- WHEN real-entity event coverage is computed
- THEN the result is below full coverage

#### Scenario: Synthetic traffic does not raise coverage

- GIVEN a large number of runtime events about synthetic entities exist
- WHEN real-entity event coverage is computed
- THEN the result is unchanged by those events

### Requirement: Captured Mobile Requests Are Auxiliary Observability Records

The system MUST persist captured mobile requests in auxiliary observability storage that is separate from canonical anime state. Every persisted capture record MUST include a normalized request kind, the authenticated device identity for that request, and the sanitized outcome classification. The capture record MUST preserve the trust boundary that Bridge SQLite owns anime state, while observability owns only sanitized request evidence and effect-correlation metadata.

#### Scenario: Capture links effects without becoming canonical state
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile causes bridge-side effects
- WHEN the capture record is written
- THEN the record may link device, changelog, conflict, or activity identifiers
- AND the record does not become an authority for anime state

#### Scenario: Kind and authenticated device identity are required without storing credentials
- GIVEN an authenticated mobile PATCH, REST reconcile, or WebSocket reconcile is captured
- WHEN the observability record is persisted
- THEN the record stores the request kind and authenticated device identity
- AND the record does not store auth credentials or raw authorization material

### Requirement: Sanitization and Privacy Are Default-Deny

The system MUST store only a sanctioned sanitized subset of request data defined by bridge policy/configuration. It MUST NOT persist auth tokens, `Authorization` headers, raw sensitive headers, or unrestricted raw request bodies. This sanitization policy MUST also apply to the additive response body, request header, and response header capture: response bodies MUST be sanitized before persistence, and captured request/response headers MUST exclude `Authorization` and any other configured sensitive header name, persisting only a sanctioned sanitized JSON subset.

#### Scenario: Sensitive request material is excluded
- GIVEN an authenticated mobile request carries bearer credentials and additional headers
- WHEN the capture record is persisted
- THEN forbidden secrets and raw sensitive headers are absent from storage
- AND only the sanctioned sanitized subset may remain

#### Scenario: Response body is sanitized before persistence
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile fails and returns an error response body
- WHEN the response body is captured
- THEN the persisted `response_body` contains only the sanctioned sanitized subset
- AND it MUST NOT contain forbidden secrets or unrestricted raw payload content

#### Scenario: Request and response headers exclude auth material
- GIVEN a mobile request carries an `Authorization` header and other request/response headers
- WHEN `request_headers` and `response_headers` are captured
- THEN the `Authorization` header and any other configured sensitive header are absent from the persisted JSON
- AND only sanctioned header names/values remain

### Requirement: Retention and Degradation Are Owned by Observability Policy

The system MUST manage captured-mobile-request retention separately from `anime_snapshots` through bridge-owned policy/configuration with safe defaults. Retention pruning, storage unavailability, or malformed capture rows MUST degrade observability only and MUST NOT block or alter canonical PATCH/reconcile behavior. This guarantee extends to failures or omissions while capturing the additive `response_body`, `request_headers`, `response_headers`, and `duration_ms` fields: any failure to capture, sanitize, or persist these fields MUST NOT block, delay, or alter the canonical response returned to the mobile client.

#### Scenario: Retention operates on auxiliary rows only
- GIVEN captured mobile requests have aged past the configured or default retention policy
- WHEN retention pruning runs
- THEN only auxiliary capture rows are eligible for removal
- AND canonical anime-state rows remain untouched

#### Scenario: Observability degradation does not change mobile semantics
- GIVEN capture storage is unavailable or a stored capture row is malformed
- WHEN a canonical mobile PATCH or reconcile flow executes
- THEN the mobile protocol and canonical response stay unchanged
- AND observability reports degradation through warning/error paths only

#### Scenario: Response body or header capture failure does not block the canonical flow
- GIVEN capturing the response body, request headers, or response headers for a request fails or the sanitizer rejects the payload
- WHEN a canonical mobile PATCH or reconcile flow executes
- THEN the canonical response to the mobile client is unaffected
- AND the capture record is persisted with the affected optional field left null, or the capture write is skipped, without surfacing an error to the mobile client

### Requirement: Additive Capture Schema for Response, Header, and Duration Telemetry

The system MUST extend the existing captured-mobile-request schema with additive, nullable-by-default columns: `response_body` (text, nullable), `request_headers` (JSON, sanitized, nullable), `response_headers` (JSON, sanitized, nullable), and `duration_ms` (integer, nullable). Existing rows captured before this change MUST remain valid and readable with these columns absent or null. The system MUST add indexes supporting `route + captured_at_ms`, `http_status + captured_at_ms`, and `anime_id + captured_at_ms` query patterns, and MUST support correlation lookup by `changelog_id` through the existing correlation table.

#### Scenario: Additive columns default to null for historical rows
- GIVEN a captured mobile request row was written before this change
- WHEN that row is read after the schema migration
- THEN `response_body`, `request_headers`, `response_headers`, and `duration_ms` are absent or null
- AND the row is still returned as well-formed by search and context tools

#### Scenario: New captures populate the additive columns when available
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile completes after this change
- WHEN the capture record is written
- THEN `duration_ms` is recorded for the request
- AND `response_body`, `request_headers`, and `response_headers` are recorded when captured and sanitized successfully

#### Scenario: Indexed query patterns remain performant at scale
- GIVEN a large volume of captured mobile requests spanning many routes, statuses, and anime IDs
- WHEN a query filters by route and time, HTTP status and time, or anime ID and time
- THEN the query uses the corresponding index
- AND the capture schema migration is purely additive, requiring no destructive rewrite of existing rows

### Requirement: Response Body Capture Is Scoped to Failed Requests

The system MUST capture and sanitize `response_body` for failed mobile PATCH, REST reconcile, and WebSocket reconcile requests. The system MAY omit response body capture for successful responses by default to limit storage growth and PII exposure surface.

#### Scenario: Failed request captures the sanitized response body
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile returns a validation or error response
- WHEN the capture record is written
- THEN `response_body` contains the sanitized bridge error/validation message
- AND it is retrievable via `get_mobile_request_context`

#### Scenario: Successful request may omit response body by default
- GIVEN a mobile PATCH, REST reconcile, or WebSocket reconcile succeeds
- WHEN the capture record is written
- THEN `response_body` MAY be null
- AND the omission MUST NOT be treated as a malformed row

### Requirement: Transport-Level Capture Middleware

A single HTTP middleware wrapping the mux MUST record transport facts (method, route, HTTP status, duration, request/response headers, response body) for every request reaching the mux, without any per-handler capture code. Handlers MUST contribute only semantic facts (outcome, error_code, anime_id, correlation/changelog/conflict IDs) through a request-scoped enrichment mechanism read by the middleware after the handler returns.

#### Scenario: New endpoint is captured with zero handler code
- GIVEN a new HTTP endpoint is registered on the mux with no capture-related code in its handler
- WHEN a request reaches that endpoint
- THEN the middleware MUST record a capture row with the transport facts (method, route, status, duration)
- AND the row MUST NOT require any handler-side capture-building code

#### Scenario: Handler enriches the transport capture
- GIVEN a handler processes a request and determines a semantic outcome (e.g. `accepted`, `conflict`) and correlation IDs
- WHEN the handler calls the enrichment mechanism before returning
- THEN the middleware-recorded capture row MUST include those semantic facts alongside the transport facts

#### Scenario: WebSocket upgrade still works when wrapped
- GIVEN the capture middleware wraps the WebSocket upgrade route
- WHEN a client performs the WS upgrade handshake
- THEN the upgrade MUST succeed (no 500) via the wrapped writer's `Hijack` passthrough

### Requirement: Capture Survives Handler Panic Or Early Exit

The capture middleware MUST record a valid transport-only capture row even when the wrapped handler panics or returns without producing enrichment data, and MUST NOT block or fail the response path while doing so.

#### Scenario: Handler panics before enrichment
- GIVEN a handler panics after the middleware has started timing the request
- WHEN the middleware's deferred capture logic runs
- THEN a capture row with the transport facts (method, route, status, duration) MUST still be recorded
- AND the missing semantic enrichment MUST NOT cause the capture write itself to fail or block the response

### Requirement: Centralized WebSocket Message And Hub Capture

Inbound WebSocket reconcile messages MUST be captured at the message-pump seam (arrival and terminal outcome), and connection open/close plus outbound broadcasts MUST be captured once at the realtime hub's single fan-out point. The message-handling business logic MUST NOT construct capture records itself.

#### Scenario: Inbound message capture brackets the pump
- GIVEN a WebSocket client sends a reconcile message
- WHEN the message pump receives it
- THEN an arrival capture row MUST be recorded before the inner handler runs
- AND a terminal capture row reflecting the inner handler's returned outcome MUST be recorded after it completes
- AND the inner message-handling function MUST contain no capture-record construction

#### Scenario: Hub captures connection lifecycle and outbound broadcasts
- GIVEN a client registers, unregisters, or the hub broadcasts an anime/preferences/season change
- WHEN that hub operation executes
- THEN a capture row MUST be recorded for that lifecycle or outbound event without any per-caller capture code

### Requirement: Semantic Behavior Parity Through Enrichment

The outcomes, error codes, and correlation IDs previously recorded by per-handler capture code MUST be preserved when handlers migrate to the enrichment mechanism.

#### Scenario: Enriched capture matches prior per-handler semantics
- GIVEN a handler that previously built and enqueued its own capture record with a specific outcome and error_code
- WHEN the same request is processed under the middleware architecture using `capture.Enrich`
- THEN the resulting capture row MUST contain the same outcome, error_code, and correlation data as before the migration

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

### Requirement: Persisted Runtime-Event Log

The system MUST persist runtime log entries (the `logger.LogEntry` shape: timestamp, domain,
level, message, correlation id, entity id, event type, duration, metadata) to a table owned by
the observability domain in bridge SQLite. Persisted events MUST survive an application restart
and remain queryable within a bounded retention window. This persisted log is additive with
respect to the in-memory feed: the `MemLogger` ring buffer and `GetRecentLogs()` MUST continue
to operate exactly as before, unaware of and unaffected by persistence. The Runtime Events
surface reads the persisted log instead of the ring buffer (see `activity-runtime-events`), and
that read-path change MUST NOT alter what the ring buffer records or what `GetRecentLogs()`
returns.
(Previously: the additive guarantee also asserted that the Runtime Events tab keeps operating
exactly as before, which the persisted read path replaces.)

#### Scenario: A logged event is queryable after an app restart

- GIVEN a runtime event was logged and persisted before the bridge process stopped
- WHEN the bridge restarts and the persisted event log is queried
- THEN the event is returned with its original domain, level, message, timestamp, and correlation/entity/event-type/duration/metadata fields intact

#### Scenario: In-memory feed is unaffected by persistence

- GIVEN the persisted event log is active
- WHEN the frontend calls `GetRecentLogs()`
- THEN the returned entries and their ordering behave exactly as they did before this change
- AND no persistence failure or slowdown is observable through that path

### Requirement: Non-Blocking Event Persistence Sink

The write path from the logger to the persisted event log MUST NOT block the logging hot path. It MUST use a bounded queue with drop-on-overflow semantics and a single serialized drain, so that a slow or unavailable store never delays the code that emitted the log entry.

#### Scenario: A slow store never delays the caller

- GIVEN the event persistence store is deliberately slow to accept writes
- WHEN a bridge component logs an event through the shared logger
- THEN the logging call returns without waiting for the persistence write to complete

#### Scenario: Overflow drops instead of stalling

- GIVEN the bounded event queue is full
- WHEN another event is logged
- THEN the new event is dropped rather than blocking the logger or growing the queue without bound
- AND already-logged entries in the in-memory ring buffer are unaffected by the drop

### Requirement: Bounded Event Retention

The persisted event log MUST enforce a row cap and prune rows beyond it on a write-count cadence — every N successful writes — rather than per write or on a timer, so pruning cost scales with event traffic instead of wall-clock time.

#### Scenario: Retention prunes on write cadence, not per write

- GIVEN the persisted event log has accumulated writes since the last prune
- WHEN the configured write-count threshold is reached
- THEN a prune runs and removes the oldest rows beyond the row cap
- AND no prune runs on the writes between thresholds

#### Scenario: Row cap is enforced over time

- GIVEN sustained event traffic that would otherwise grow the table without bound
- WHEN pruning runs at its configured cadence
- THEN the persisted event log never exceeds its configured row cap by more than the writes accumulated within one prune cycle

### Requirement: Debug-Level Persistence Policy Is Explicit and Configurable

Whether `debug`-level events are written to the persisted event log MUST be governed by an explicit, configurable policy rather than an implicit consequence of implementation. The policy MUST have a stated default and MUST be changeable without a code change.

#### Scenario: Default policy is documented and applied

- GIVEN the bridge starts with no explicit debug-persistence override
- WHEN runtime events are logged at `debug` level
- THEN the documented default policy determines whether they are persisted
- AND the applied behavior matches the documented default

#### Scenario: Policy can be reconfigured without a code change

- GIVEN an operator changes the debug-persistence configuration value
- WHEN the bridge restarts with the new configuration
- THEN subsequently logged `debug`-level events are persisted or dropped according to the new setting
- AND non-`debug` levels are unaffected by the setting

### Requirement: Activity Log Remains Untouched By Runtime-Event Persistence

The persisted runtime-event log MUST be a distinct table from `activity_log`. This change MUST NOT modify, read, or otherwise conflate `activity_log` with the persisted runtime-event log.

#### Scenario: Activity log is neither written nor read by this change

- GIVEN the persisted runtime-event log is active
- WHEN a runtime event is logged and persisted
- THEN no row is written to or read from `activity_log` as part of that persistence
- AND `activity_log`'s existing per-anime audit-trail behavior is unchanged

