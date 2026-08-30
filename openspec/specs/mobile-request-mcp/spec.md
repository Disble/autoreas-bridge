# mobile-request-mcp Specification

## Purpose

Define a local read-only MCP sidecar that lets operators inspect sanitized **captured mobile requests** and their bridge-side effects without mutating bridge state.

> **Capability identifier note.** This capability is still keyed `mobile-request-mcp` for
> continuity with its planning artifacts, but the runtime surface it describes is
> transport-neutral: the capture pipeline records every bridge request, not only
> mobile-originated traffic. `capture-nomenclature-rename` deferred renaming the
> capability identifier itself (see that change's "Out of Scope"); the rename remains open.

## Requirements

### Requirement: Local Stdio Sidecar Surface

> **Drift note — recorded 2026-08-30 by SDD-65 Slice 0.** The "exactly four tools" count
> below was superseded by `mcp-runtime-events-read` (commit `25f7531`, 2026-07-30), which
> grew the surface to seven. See "Bounded Tool Surface Grows To Seven Tools" below;
> `internal/mcp/requestcapture/server.go:21-22` registers all seven. That change shipped no
> delta for this requirement, so its four-tool sentence is stale, not authoritative.

The system MUST expose this capability through a separate local stdio sidecar. It MUST register exactly four tools, named without a transport prefix: `search_requests`, `get_request_context`, `resolve_request_context`, and `summary_requests`. The tool-name validator MUST accept exactly these four names and reject every other name, including the previously-registered names. It MUST NOT expose mutation/replay tools, MCP resources/templates, remote transport, or mobile-protocol replacement.
(Previously: the sidecar registered `resolve_mobile_request_context`, `search_mobile_requests`, `get_mobile_request_context`, and `summary_mobile_requests`. The capture pipeline records all bridge request traffic, not only mobile traffic, so the `mobile` qualifier misdescribed the tools.)

#### Scenario: Sidecar exposes the bounded, transport-neutral tool surface

- GIVEN the bridge SQLite database and a supported capture schema are available
- WHEN a local MCP client initializes the sidecar
- THEN the sidecar exposes exactly the 4 tools `search_requests`, `get_request_context`, `resolve_request_context`, `summary_requests`
- AND no other tool can mutate bridge state

#### Scenario: Previously-registered tool names are rejected

- GIVEN a client invokes a tool named `search_mobile_requests`, `get_mobile_request_context`, `resolve_mobile_request_context`, or `summary_mobile_requests`
- WHEN the sidecar validates the tool name
- THEN it MUST reject the call as unsupported
- AND it MUST NOT silently alias the name to a current tool

#### Scenario: Missing capture schema fails closed

- GIVEN the bridge database file is missing, or neither capture table generation is present
- WHEN the sidecar starts or a tool is invoked
- THEN the system MUST fail closed with an unavailable/schema-mismatch error
- AND it MUST NOT fabricate empty success results

### Requirement: Query-Only SQLite Reader

The system MUST open bridge SQLite in read-only, query-only mode for this sidecar. Tool execution MUST NOT mutate `anime_snapshots`, device/auth tables, capture tables, or any other bridge-owned state.

#### Scenario: Read-only inspection succeeds
- GIVEN captured mobile requests exist in bridge SQLite
- WHEN a client calls any of the 3 tools
- THEN the sidecar returns only read results
- AND bridge-owned row counts remain unchanged

#### Scenario: Mutation intent is rejected
- GIVEN a client attempts replay, delete, update, or any write-like action
- WHEN the action is routed to the sidecar
- THEN the system rejects it as unsupported
- AND no write-capable MCP surface is available

### Requirement: Search Pagination and Result Shape

`search_requests` MUST search only sanctioned sanitized capture fields and MUST return newest-first summaries. Each summary MUST expose the request kind and the authenticated device identity, when one is present, for the captured request. The tool MUST apply a safe default limit, MUST clamp oversized limits to an implementation-defined safe maximum, and MUST return the applied limit plus continuation metadata.
(Previously named `search_mobile_requests`; the pagination, filtering, and result shape are unchanged.)

#### Scenario: Search uses safe defaults

- GIVEN matching captured requests exist
- WHEN the client omits pagination inputs
- THEN the tool returns the first page in newest-first order
- AND the response includes the applied limit and next-page metadata

#### Scenario: Oversized page request is bounded

- GIVEN the client requests a page larger than the safe maximum
- WHEN `search_requests` executes
- THEN the tool clamps the page to the safe maximum
- AND the response reports the bounded limit actually used

### Requirement: Context Resolution and Retrieval

`resolve_request_context` MUST accept an imprecise reference and return zero or more candidate request identifiers with disambiguating metadata. `get_request_context` MUST return one full sanitized captured request — including its request kind, authenticated device identity, outcome, and any available effect correlations — for an exact identifier.
(Previously named `resolve_mobile_request_context` and `get_mobile_request_context`; ranking, sanitization, and result shapes are unchanged.)

#### Scenario: Ambiguous reference resolves to candidates

- GIVEN multiple captured requests match one natural-language reference
- WHEN the client calls `resolve_request_context`
- THEN the tool returns candidate request identifiers
- AND each candidate includes enough metadata to choose the intended record

#### Scenario: Exact context retrieval handles misses

- GIVEN no captured request exists for the requested identifier
- WHEN the client calls `get_request_context`
- THEN the tool returns a not-found result
- AND it MUST NOT return data from a different request

### Requirement: Malformed Historical Rows Degrade Safely

The tools MUST skip malformed historical capture rows and continue serving well-formed rows. The response MUST surface that malformed rows were skipped through warning or count metadata.

#### Scenario: One malformed row does not poison the page
- GIVEN one malformed captured-request row and later well-formed rows exist
- WHEN a client searches or retrieves surrounding context
- THEN the well-formed rows are still returned
- AND the response indicates malformed rows were skipped

### Requirement: Aggregated Request Health Summary

`summary_requests` MUST aggregate captured requests into per-route, per-status, and per-outcome counts with bounded recent-error samples, scoped by the same optional filters `search_requests` accepts, and MUST never mutate bridge state.
(Previously named `summary_mobile_requests`; the aggregation, filter set, and sample bounds are unchanged.)

#### Scenario: Summary aggregates without mutation

- GIVEN captured requests exist
- WHEN the client calls `summary_requests`
- THEN the tool returns grouped counts and bounded error samples
- AND bridge-owned row counts remain unchanged

### Requirement: Correlation Lookup by Changelog and Anime Identifier

The system MUST allow locating all captured mobile requests correlated to a given `changelog_id` or `anime_id` through `search_mobile_requests` filters, without requiring the caller to already know a request identifier.

#### Scenario: Changelog correlation surfaces all related requests
- GIVEN a changelog entry is linked to one or more captured mobile requests
- WHEN the client searches using that `changelog_id` as a correlation filter
- THEN all captured requests correlated to that changelog entry are returned

#### Scenario: Anime correlation surfaces all related requests
- GIVEN multiple captured requests are correlated to the same anime ID
- WHEN the client calls `search_mobile_requests` with that `anime_id`
- THEN all correlated requests are returned regardless of route or kind

### Requirement: Bounded Tool Surface Grows To Seven Tools

The system MUST expose exactly seven read-only tools after this change: the four existing tools `resolve_request_context`, `search_requests`, `get_request_context`, `summary_requests`, plus three new tools `search_events`, `summary_events`, and `get_correlation_timeline`. It MUST NOT expose mutation/replay tools, MCP resources/templates, remote transport, log-level reconfiguration, or a mobile-protocol replacement. No alias name is introduced for any tool, existing or new — each capability is exposed under exactly one name.

#### Scenario: Sidecar exposes the bounded seven-tool surface

- GIVEN the bridge SQLite database and required capture/event schema are available
- WHEN a local MCP client initializes the sidecar
- THEN the sidecar exposes exactly the 7 named tools
- AND no other tool can mutate bridge state

#### Scenario: New tools introduce no aliases

- GIVEN the three new event tools are registered
- WHEN the sidecar's tool list is inspected
- THEN `search_events`, `summary_events`, and `get_correlation_timeline` each appear exactly once
- AND none of the four pre-existing tool names is duplicated, renamed, or aliased

#### Scenario: Existing four tools are unaffected

- GIVEN the tool surface now includes the three new event tools
- WHEN `resolve_request_context`, `search_requests`, `get_request_context`, or `summary_requests` is called
- THEN its behavior, inputs, and outputs are unchanged from before this change

### Requirement: Sidecar Reads Both Capture Table Generations

The sidecar MUST open and serve a bridge database whose capture tables carry either the transport-neutral names or the previously-used names, and MUST accept capture schema versions `1`, `2`, and `3`. A recognizable older database MUST NOT be rejected merely because it has not been migrated yet.

#### Scenario: Sidecar serves an un-migrated database

- GIVEN a bridge database whose capture tables still use the previous names at schema version `2`
- WHEN the sidecar starts and a client calls any of the four tools
- THEN the sidecar MUST open the database successfully
- AND the tool MUST return the same results those rows produce on a migrated database

#### Scenario: Sidecar serves a migrated database

- GIVEN a bridge database whose capture tables use the transport-neutral names at schema version `3`
- WHEN the sidecar starts and a client calls any of the four tools
- THEN the sidecar MUST open the database successfully and query the transport-neutral tables

### Requirement: Tool Rename Is Announced As Breaking

Renaming the tool surface is a breaking change to the MCP client contract. The change MUST update the repository's MCP client registration to the renamed sidecar binary in the same change, and MUST announce the removed tool names and the renamed capture tables in the project's consumer-facing documentation.

#### Scenario: Breaking rename is announced

- GIVEN the tool names and sidecar binary are renamed
- WHEN the change is delivered
- THEN the repository MCP client registration MUST reference the renamed binary
- AND the consumer-facing API/observability documentation MUST record the removed tool names, the new tool names, the capture table rename, and the capture schema version bump

### Requirement: Runtime-Event Filter Type Is Distinct From Request Filters

The system MUST expose a runtime-event filter type separate from the captured-request filter type, supporting `domain`, `level`, `event_type`, `correlation_id`, `entity_id`, free text over message/domain/event type, and `start_ms`/`end_ms`. Every populated filter field MUST compose with the others as a conjunction (AND), matching the existing request-filter composition semantics.

#### Scenario: Populated filters compose as a conjunction

- GIVEN persisted runtime events exist across multiple domains, levels, and event types
- WHEN a client supplies `domain`, `level`, and a time window together
- THEN only events matching all three conditions are returned

#### Scenario: Free text matches message, domain, or event type

- GIVEN persisted runtime events contain a distinctive substring in their message, domain, or event type
- WHEN a client supplies that substring as free text
- THEN only events where the substring appears in message, domain, or event type are returned

#### Scenario: Unsupported filter combination returns an empty page, not an error

- GIVEN no persisted runtime event matches the combined filters
- WHEN an event tool executes with those filters
- THEN the tool returns an empty result with valid pagination/aggregation metadata
- AND it MUST NOT fail or fabricate matching rows

### Requirement: Event Search Tool

The system MUST expose `search_events`, a read-only tool that searches persisted runtime events using the runtime-event filter type and returns newest-first paginated results using the same cursor-based `applied_limit`/`next_cursor` contract as `search_requests`.

#### Scenario: Search uses safe defaults

- GIVEN matching persisted runtime events exist
- WHEN the client omits pagination inputs
- THEN `search_events` returns the first page in newest-first order
- AND the response includes the applied limit and next-page cursor metadata

#### Scenario: Oversized page request is bounded

- GIVEN the client requests a page larger than the safe maximum
- WHEN `search_events` executes
- THEN the tool clamps the page to the safe maximum
- AND the response reports the bounded limit actually used

#### Scenario: Time window filter bounds results to a range

- GIVEN persisted runtime events span a wide time range
- WHEN the client supplies `start_ms` and/or `end_ms`
- THEN only events within the inclusive window are returned

### Requirement: Event Summary Tool

The system MUST expose `summary_events`, a read-only tool that aggregates persisted runtime events matching the runtime-event filter into counts grouped by domain, level, and event type, plus a bounded number of newest matching samples. An empty match MUST return a zeroed aggregation, never an error.

#### Scenario: Summary reports counts per domain/level/event type

- GIVEN persisted runtime events exist across multiple domains, levels, and event types
- WHEN the client calls `summary_events` with no filters
- THEN the response includes counts grouped by domain, level, and event type
- AND the grouping reflects all matching events

#### Scenario: Summary includes bounded newest samples

- GIVEN a domain/level/event-type group has multiple matching events
- WHEN `summary_events` executes
- THEN the response includes a bounded number of the most recent samples for that group

#### Scenario: Empty result set returns zeroed aggregation, not an error

- GIVEN no persisted runtime event matches the supplied filters
- WHEN `summary_events` executes
- THEN the tool returns a zeroed/empty aggregation result
- AND it MUST NOT fail or fabricate groups

### Requirement: Correlation Timeline Tool

The system MUST expose `get_correlation_timeline`, a read-only tool that, given one `correlation_id`, resolves and returns both the captured requests and the persisted runtime events sharing that correlation id, so the two logs can be read as one timeline. An unmatched `correlation_id` MUST return a valid empty result, never an error. Runtime events without a correlation id remain independently searchable through `search_events` by domain, level, or time.

#### Scenario: One correlation id resolves both captured requests and runtime events

- GIVEN a captured request and one or more runtime events share the same `correlation_id`
- WHEN the client calls `get_correlation_timeline` with that `correlation_id`
- THEN the response includes the matching captured request(s) and the matching runtime events

#### Scenario: Unknown correlation id returns an empty result, not an error

- GIVEN no captured request or runtime event carries the supplied `correlation_id`
- WHEN the client calls `get_correlation_timeline`
- THEN the tool returns a valid empty result
- AND it MUST NOT fail or fabricate matching rows

#### Scenario: Events without a correlation id remain searchable independently

- GIVEN a runtime event was persisted without a `correlation_id`
- WHEN the client searches for it through `search_events` using domain, level, or a time window
- THEN the event is returned
- AND its absence from any `get_correlation_timeline` result is expected, not an error condition

### Requirement: Sidecar Tolerates a Bridge Database Without the Events Table

The read-only event reader MUST probe for the persisted-event table's presence and MUST tolerate its absence: a sidecar pointed at a bridge database created before this change MUST return an empty or unavailable result from the event tools and MUST NOT exit or crash. Every read added by this change MUST preserve the existing read-only invariants: `mode=ro`, `PRAGMA query_only=ON`, and `VerifyQueryOnly`.

#### Scenario: Missing events table degrades safely

- GIVEN a bridge SQLite database that has no persisted-event table
- WHEN the sidecar starts and a client calls `search_events`, `summary_events`, or `get_correlation_timeline`
- THEN the tool returns an empty or unavailable result with a clear reason
- AND the sidecar process does not exit or crash

#### Scenario: Existing tools are unaffected by the missing events table

- GIVEN a bridge SQLite database that has no persisted-event table
- WHEN the client calls `search_requests`, `get_request_context`, `resolve_request_context`, or `summary_requests`
- THEN those tools behave exactly as before, independent of the missing events table

#### Scenario: New reads preserve read-only invariants

- GIVEN the sidecar opens the bridge SQLite database for the new event tools
- WHEN `search_events`, `summary_events`, or `get_correlation_timeline` executes
- THEN the underlying connection is opened `mode=ro` with `PRAGMA query_only=ON`
- AND `VerifyQueryOnly` MUST hold for that connection

### Requirement: No Mutation, Replay, or Log-Level Reconfiguration Through MCP

None of the new event tools MUST provide a way to mutate bridge state, replay or re-inject log entries, or reconfigure logger levels or sinks. Every new tool is read-only over already-persisted data.

#### Scenario: Event tools cannot mutate bridge state

- GIVEN the three new event tools are registered
- WHEN any of them is invoked with any input
- THEN no row in the persisted event log, `request_captures`, or any other bridge table is created, modified, or deleted as a result

#### Scenario: No tool exposes replay or level reconfiguration

- GIVEN the sidecar's tool surface after this change
- WHEN the tool list is inspected
- THEN no tool accepts a log entry to inject or replay
- AND no tool accepts a logger level or sink configuration to change

