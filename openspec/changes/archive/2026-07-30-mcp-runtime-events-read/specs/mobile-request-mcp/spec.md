# Delta for mobile-request-mcp

## MODIFIED Requirements

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

## ADDED Requirements

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
