# Delta for observability

> **`Requirement: Wails Exposes Recent Logs` is RETAINED, not modified and not removed.**
> `GetRecentLogs()` keeps its contract and its existing tests; it simply stops being the
> Activity read path. No delta is authored for it, deliberately.
>
> **SDD-65 adds no schema requirement here.** The `correlation_id` column and the merged
> request/event timeline were cut on measured evidence (proposal §6.3, §14/H3), so this change
> contains no migration and no capture-write-path edit.

## MODIFIED Requirements

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
