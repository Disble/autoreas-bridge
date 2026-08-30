# Delta for observability

## ADDED Requirements

### Requirement: Persisted Runtime-Event Log

The system MUST persist runtime log entries (the `logger.LogEntry` shape: timestamp, domain, level, message, correlation id, entity id, event type, duration, metadata) to a table owned by the observability domain in bridge SQLite. Persisted events MUST survive an application restart and remain queryable within a bounded retention window. This persisted log is additive: the existing in-memory `MemLogger` ring buffer, `GetRecentLogs()`, and the Runtime Events tab MUST continue to operate exactly as before, unaware of and unaffected by persistence.

#### Scenario: A logged event is queryable after an app restart

- GIVEN a runtime event was logged and persisted before the bridge process stopped
- WHEN the bridge restarts and the persisted event log is queried
- THEN the event is returned with its original domain, level, message, timestamp, and correlation/entity/event-type/duration/metadata fields intact

#### Scenario: In-memory feed is unaffected by persistence

- GIVEN the persisted event log is active
- WHEN the frontend calls `GetRecentLogs()` or the Runtime Events tab receives a live event
- THEN the returned/displayed entries and their filters behave exactly as they did before this change
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
