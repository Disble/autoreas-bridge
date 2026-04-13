# Delta for Observability

## MODIFIED Requirements

### Requirement: Shared Structured Logging

The system MUST provide a shared logging contract that produces entries with domain, message, timestamp, level, and optional structured metadata: `CorrelationID`, `EntityID`, `EventType`, `DurationMs`, and `Metadata` key-value pairs. The system MUST support `debug`, `info`, `warn`, and `error` levels.

(Previously: entries required only domain, message, and timestamp; levels were info/warn/error only.)

#### Scenario: Terminal output includes timestamp, level, and metadata
- GIVEN a bridge component records an operational event with structured metadata
- WHEN the shared logger writes to stdout
- THEN the line MUST include ISO-8601 timestamp, bracketed level, bracketed domain, and message
- AND if EntityID or DurationMs are present, they MUST appear as `key=value` suffixes

#### Scenario: Recent logs can be queried (updated capacity)
- GIVEN log entries have been recorded
- WHEN a consumer requests recent logs
- THEN the system MUST return up to the configured buffer capacity (default 500)
- AND the capacity MUST be settable at logger construction time

#### Scenario: Structured fields serialize to JSON
- GIVEN a `LogEntry` with CorrelationID, EntityID, and Metadata populated
- WHEN the entry is serialized for Wails or API consumers
- THEN all structured fields MUST be present in the JSON output
- AND omitted fields (zero values) SHOULD be excluded via `omitempty`

## ADDED Requirements

### Requirement: Domain Instrumentation With Structured Data

Every domain MUST enrich log entries with contextual structured data where applicable.

#### Scenario: Anime operations include entity and timing
- GIVEN a startup catch-up, watcher delta, or writer operation completes
- WHEN the domain logs the result
- THEN the entry MUST include `EntityID` (anime `_id` when single), `DurationMs` for timed operations, and `EventType` classifying the action

#### Scenario: Sync operations include reconcile context
- GIVEN a reconcile request is triggered or changelog is recorded
- WHEN the sync domain logs the action
- THEN the entry MUST include `EventType` and `DurationMs` for the reconcile operation

#### Scenario: Realtime operations include connection counts
- GIVEN a WebSocket client registers or unregisters
- WHEN the hub logs the lifecycle event
- THEN the entry MUST include `EntityID` (client identifier) and relevant connection count in `Metadata`

### Requirement: HTTP Request Logging Middleware

The API server MUST log every HTTP request/response pair with method, path, status code, and duration.

#### Scenario: Successful request is logged
- GIVEN a client sends `GET /api/animes`
- WHEN the response is sent with status 200
- THEN a log entry MUST be recorded with domain `api`, EventType `http.request`, DurationMs, and Metadata containing `method`, `path`, `status`

#### Scenario: Error request is logged at warn/error level
- GIVEN a client sends a request that results in 4xx or 5xx
- WHEN the response is sent
- THEN the entry MUST be logged at `warn` (4xx) or `error` (5xx) level

### Requirement: Event Bus Instrumentation

The event bus MUST log publish and delivery events with timing data.

#### Scenario: Event publish is logged
- GIVEN a domain publishes an event to the bus
- WHEN the event is dispatched
- THEN a `debug`-level entry MUST be recorded with domain `bus`, EventType `bus.publish`, and event type name in Metadata

#### Scenario: Slow handler is logged at warn level
- GIVEN a subscriber handler takes more than 500ms to execute
- WHEN the handler completes
- THEN a `warn`-level entry MUST be recorded with `DurationMs` and the handler's event type

### Requirement: Correlation ID Propagation

The system SHOULD propagate a `CorrelationID` through event-driven flows to enable end-to-end tracing.

#### Scenario: Watcher-initiated flow shares correlation ID
- GIVEN the file watcher detects a change and generates a correlation ID
- WHEN the resulting `anime.changed` event is published and processed by downstream handlers
- THEN all log entries in the chain SHOULD share the same `CorrelationID`

## REMOVED Requirements

(None)
