# Design: MCP Runtime-Event Read Surface

## Technical Approach

Two halves, sequenced: a **persisted runtime-event log** written from the shared logger, then a
**read-only event surface** the sidecar exposes as three tools. The read half is mechanical once rows
exist; all the design risk is in the write half, and it concentrates in one place — **the sink is
constructed before the database it writes to exists**.

`app.go:183` calls `ensureRuntimeDependencies()`, which builds `memLogger` and the `FanoutLogger`
(`app_defaults.go:227-240`). `app.go:191` opens `bridgeDB`. `FanoutLogger` freezes its
`targets []entrySink` slice at construction (`fanout.go:9-17`) and `write` fans out with **no lock**
(`fanout.go:45-49`). So the persisting target must be registered at logger-construction time as a
stable indirection whose backing queue is bound later, after bootstrap. That single constraint drives
Decision 1 and the whole write-path shape.

The read half must not repeat the capture reader's fail-closed posture. `OpenReadOnlyDB`
(`reader.go:194-229`) resolves capture tables and **errors out** on a capture-schema mismatch before
any query runs. If the events table were probed there, a bridge database predating this change would
kill the entire sidecar — breaking both `Missing events table degrades safely` **and** `Existing
tools are unaffected by the missing events table`. The event probe therefore lives in a separate
`eventlog.Reader` constructor over the **same already-verified handle** (`ro.DB()`), returning an
`unavailable` result rather than a startup error.

## Architecture Decisions

| # | Area | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| 1 | Sink attach point | `FanoutLogger` target — a deferred-bind `eventlog.Sink` registered at fanout construction, its `*eventlog.Queue` bound after bootstrap via `atomic.Pointer` | (a) `MemLoggerConfig.OnWriteFn`; (b) mutable `FanoutLogger.AddTarget`; (c) sink lazily opens its own store from a `*sql.DB` getter | (a) **`OnWriteFn` is already occupied** by the Wails event emitter (`app_defaults.go:230`); taking it means multiplexing two unrelated concerns in one hook and couples persistence to the lifetime of a 500-entry UI ring buffer. (b) A mutable target slice needs an `RWMutex` in `FanoutLogger.write`, which fires on **every log line in every domain** — a lock on the exact hot path this change must not touch. (c) Hides the lifecycle; `Stop` becomes untestable. The `atomic.Pointer` swap keeps `fanout.go`'s `write` byte-identical and makes the bind explicit and reversible (rollback = `Unbind`). |
| 1b | Passing the sink to the fanout | Export `logger.EntrySink`; add `logger.NewFanoutLoggerWithSinks(loggers []Logger, sinks ...EntrySink)`; `NewFanoutLogger` keeps its signature and delegates | Implement all five `Logger` methods on `Sink` | `NewFanoutLogger(loggers ...Logger)` type-asserts to `entrySink`, so a `WriteEntry`-only type cannot be passed today. Faking `Debugf/Infof/Warnf/Errorf/Logf` on the sink is impossible without duplicating `logger.newEntry` (unexported) in another package. The new constructor is 8 lines, changes exactly one call site (`app_defaults.go:239`), and leaves the other five `NewFanoutLogger` callers untouched. |
| 2 | Debug-level persistence | **Default OFF** — `info`/`warn`/`error` persisted, `debug` dropped. Configurable via `app_settings` key `observability.events.persist_debug` (`"true"`/`"false"`), read once when the queue is wired | (a) persist all levels with a tighter cap; (b) per-domain level map; (c) hardcode | Debug is the dominant volume driver: a debug `bus.publish` fires per bus event (3 per reconcile cycle in the reported screenshot, for **one** user action). (a) inverts the log's value: with debug on, the retention window must be sized for debug volume, so pruning evicts the `warn`/`error` lines that explain a failure behind `bus.publish` noise — bigger **and** blunter. Default OFF keeps the persisted window days long for the levels that carry failure; debug is opt-in for a live hunt (flip, restart, reproduce). Nothing is lost from the UI: the in-memory ring and Runtime Events tab still show every debug line live, unchanged. (b) is more config surface than the evidence supports. (c) the spec forbids it. |
| 2b | Where the level filter runs | In `Sink.WriteEntry`, **before** `TryEnqueue` | In the store, on the drain goroutine | A dropped debug line costs one string comparison on the logging goroutine and never consumes queue capacity — otherwise debug traffic would evict `error` events from a full queue. |
| 3 | Package layout | New sibling `internal/observability/eventlog`, owning its own `persistence.TableSchema` via `SchemaTables()` | Extend `internal/observability/requestcapture` | `tools/checkarchitecture` requires the owning domain to declare its DDL (`internal/activity/schema.go` precedent); **new DDL does not go in `internal/sync/schema.go`**. Cohesion: the two domains share no logic — disjoint record shape, disjoint columns, disjoint filter fields (proposal §4). Folding in would push `requestcapture`'s `types.go` (205), `filters.go`, `store.go`, and `reader*.go` toward the 400-line warn line for zero reuse. |
| 3b | Shared error envelope | Extract `Error` + its four constructors into a leaf `internal/observability/obserr`; `requestcapture` keeps `type Error = obserr.Error` (alias, zero call-site churn) and delegates; `eventlog` imports `obserr` | (a) `eventlog` imports `requestcapture` for `obs.Error`; (b) `eventlog` duplicates the envelope | All seven tools must emit **one** error schema — a client cannot get two shapes. (a) makes two "siblings that share nothing" depend on each other, and the four constructors are unexported so `eventlog` would hand-build code literals anyway. (b) duplicates the codes, so they drift. The alias keeps every existing `obs.Error{...}` literal and `errors.As` site compiling unchanged, and drops ~25 lines from `requestcapture/types.go`. Cheap veto: duplicate the envelope in `eventlog` and lose nothing but honesty. |
| 3c | Tool-name validation | `ValidateToolName` stays in `internal/observability/requestcapture`, grown 4 → 7 names, no aliases | Add a second `eventlog.ValidateToolName`; move it to `internal/mcp/requestcapture` | It gates the **sidecar's** tool surface, not a capture-domain rule. One function, one place, one test asserting the exact set of seven. Two per-package validators would let the surface reach 4+3 with no single place asserting "exactly seven" — the bound the spec makes normative. Its home is arguably the `mcp` package; that is a cross-package move of an exported symbol with its own test contract, recorded as a follow-up rather than smuggled in. Stated explicitly so a reviewer does not read the placement as an oversight. |
| 4 | Table shape | `runtime_events` with surrogate `id INTEGER PRIMARY KEY AUTOINCREMENT` + `occurred_at_ms INTEGER NOT NULL` | Composite PK on `(occurred_at_ms, domain, message)`; bare rowid | `LogEntry` has no natural id, and `Timestamp` is **RFC3339 second resolution** — multiple events per second are the norm, so a monotonic id is the only stable pagination tiebreaker. `AUTOINCREMENT` (not bare rowid) so a prune can never let a later insert reuse a deleted id and sort *before* a live cursor. |
| 4b | Timestamp conversion + owner | The **sink** owns it: parse `entry.Timestamp` as RFC3339 → `UnixMilli()`; on parse failure fall back to an injectable `now()`. Only `occurred_at_ms` is stored | (a) store the RFC3339 string as-is; (b) always re-stamp from the clock at enqueue | Bridge convention is epoch millis, and every filter/sort/index predicate is numeric — a string column would make the time window a lexical comparison. (a) also breaks the `start_ms`/`end_ms` contract the spec requires. (b) is cheaper but re-stamps rather than preserves, and the spec requires the original timestamp intact. `time.Parse` of RFC3339 is negligible next to the `fmt.Sprintf` `logger.newEntry` already performs on the same goroutine for every entry. |
| 5 | Retention | Row cap **20,000**, prune every **200** successful writes, both `EventStoreConfig` fields defaulting from package constants | Match capture's 5000/100; time-based prune | Events fire one to two orders of magnitude more often than captured requests (several domain lines per request, plus bus/sync/download lines with no request at all). 20k ≈ 4× the capture cap, but each row is ~200–500 bytes (message + small metadata JSON) against capture rows carrying up to 64KB bodies — ceiling ≈ 10MB, so the events table never becomes the database's dominant cost. `pruneEvery=200` holds each prune to the same absolute work as capture's while amortizing it over a proportionally larger write count (~0.5% of writes vs. 2%). A timer-based prune would burn work on an idle app and lag a burst. **Apply phase MUST measure and record the real per-session event count** (proposal risk row) and retune the constants if reality disagrees. |
| 6 | Cursor / pagination | Mirror `SearchPage` field-for-field; cursor keyed on `(occurred_at_ms, id)`, base64 RawURL JSON, same `invalid_params` on malformed input, default limit 25 / max 100 clamped in **both** tool and reader | New cursor shape; offset pagination | Byte-identical response contract to `search_requests` (`applied_limit`, `next_cursor`, `malformed_rows_skipped`, `warning_count`) is what the spec requires, and it means an agent already fluent in one tool is fluent in the other. Double clamping mirrors today's `searchRequests` + `Reader.Search`. |
| 6b | Deliberate divergence | The event query adds `LIMIT ?` (limit+1) in SQL | Copy `reader_search.go`'s pattern | `Reader.Search` (`reader_search.go:38-61`) has **no SQL `LIMIT`** — it scans the whole table and truncates in Go. On the higher-volume events table that is precisely the regression the retention risk row warns about. Output contract is identical; the SQL is strictly better. Flagged so the asymmetry reads as intentional. |
| 7 | Metadata storage | `metadata_json TEXT` NULL when empty; bounded at **4KB**; default-deny key redaction applied on the drain goroutine; free text does **not** cover metadata | 64KB bound (matching `MaxCapturedBodyBytes`); truncate on overflow; include metadata in free text | Metadata is structured fields, not payload bodies — anything past 4KB is a caller bug and should be visible as one. Truncated JSON is unparseable and would surface as a malformed row on **every** read, so overflow stores a marker object instead. Redaction runs in the store, not the reader, per the proposal's explicit instruction; and off the logging goroutine because it is per-key work. Free text stays on `message`/`domain`/`event_type` exactly as the spec enumerates: `LIKE` over a JSON blob is unindexable and would match redaction markers and key names, producing results a user cannot explain. `metadata_json` is returned on every row, so client-side filtering remains available. |
| 8 | Slice boundary | `get_correlation_timeline` is **IN** this slice. The contingency tail is `summary_events`, not the timeline | Defer the timeline as the proposal suggested | The timeline is the smallest of the three tools *and* the only one that delivers the headline outcome ("everything that happened for this request" in one call): one indexed `correlation_id =` event query plus one existing-`SearchFilters` capture query, merged into a two-field envelope — no new WHERE builder, no new cursor, no aggregation (~60 production lines, 3 spec scenarios). Deferring it leaves the join key unconsumed, which is the change's stated reason to exist, and saves under 5% of the diff. `summary_events` is the genuinely separable one: three `GROUP BY`s plus bounded per-group samples, an independent SQL surface, and nothing else depends on it. Invoking the contingency costs a spec re-amendment (7 → 6 tools), so the slice is **planned** at seven and the tail is a fallback, not a schedule. |

## Write Path

### Sequence

```mermaid
sequenceDiagram
  participant D as Any bridge domain
  participant F as FanoutLogger
  participant M as MemLogger (ring + Wails emit)
  participant S as eventlog.Sink
  participant Q as eventlog.Queue
  participant St as eventlog.SQLiteStore
  participant DB as bridge SQLite

  D->>F: Infof("sync", "...") / Logf(domain, level, Fields{...})
  F->>F: newEntry(...) -> LogEntry (RFC3339, sprintf)
  F->>M: WriteEntry(entry)  [unchanged: ring push + OnWriteFn Wails emit]
  F->>S: WriteEntry(entry)  [new target]
  S->>S: queue := ptr.Load(); nil -> unboundDrops++, return
  S->>S: level policy: debug && !persistDebug -> filteredDrops++, return
  S->>S: occurredAtMS = parse(entry.Timestamp) or now()
  S-->>Q: TryEnqueue(EventRecord)  [zero-wait; full -> dropped++, return]
  Note over F,S: WriteEntry returns here. Nothing below runs on the caller's goroutine.
  Q->>Q: single drain goroutine, serialized
  Q->>St: InsertEvent(ctx 5s, record)
  St->>St: marshal + redact + bound metadata (nil/oversize -> NULL / marker)
  St->>DB: BEGIN; INSERT INTO runtime_events (...)
  St->>DB: every 200th write: DELETE oldest beyond 20000; COMMIT
```

### Lifecycle and the early-boot window

| Phase | Site | Action |
|---|---|---|
| Logger construction | `app_defaults.go` `ensureRuntimeObservability` | build `eventlog.NewSink(SinkConfig{})`, register it as a fanout sink. Queue is **nil** |
| DB open | `app.go:191` `initializeBridgeDatabase` | `runtime_events` ensured by the `EnsureTableSchema` loop |
| Queue wiring | `app_runtime_services.go` `configureEventLogQueue` (new, called from `configureRuntimeServices`) | read `observability.events.persist_debug` from `app_settings`; build store + queue; `sink.Bind(queue, persistDebug)` |
| Shutdown | `app.go` `shutdown` | `sink.Unbind()` then `eventQueue.Stop(ctx)` — unbind first so no entry is enqueued into a closing channel |

**Accepted gap, stated explicitly:** events logged between logger construction and queue wiring — tray
setup and DB bootstrap — are dropped, counted in `Sink.UnboundDrops()`. This includes
`initializeBridgeDatabase` failures, which is unavoidable: with no database there is nowhere to
persist. Those entries remain visible in the in-memory ring and the Runtime Events tab, which is the
only surface that ever showed them before this change.

`Unbind` before `Stop` is not cosmetic: `Queue.TryEnqueue` already guards a closing channel with
`stopping` under a mutex (`queue.go:86-99`), but unbinding first means the logging goroutine takes the
`atomic.Pointer` nil branch and never contends that mutex during shutdown.

## Schema

Owned by `internal/observability/eventlog/schema.go`, assembled in `initializeBridgeDB`
(`tables = append(tables, eventlog.SchemaTables()...)`). Create-only, no `Migrate`, no `ColumnAdds`,
no version stamp of its own — the table is born at its current shape and the sidecar's tolerance is a
**presence** probe, not a version comparison.

```sql
CREATE TABLE IF NOT EXISTS runtime_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at_ms INTEGER NOT NULL,
    domain         TEXT NOT NULL,
    level          TEXT NOT NULL,
    message        TEXT NOT NULL,
    correlation_id TEXT,
    entity_id      TEXT,
    event_type     TEXT,
    duration_ms    INTEGER,
    metadata_json  TEXT
)
```

Nullable columns are exactly the `omitempty` fields of `logger.LogEntry`. `duration_ms` is
`int64` in Go with `0` meaning "unset" (`logger.go:37`), so the sink binds `NULL` for zero rather
than storing a misleading `0`.

### Indexes — three, matched to the filter predicates

```sql
CREATE INDEX IF NOT EXISTS idx_runtime_events_time
    ON runtime_events(occurred_at_ms DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_correlation
    ON runtime_events(correlation_id, occurred_at_ms DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_domain_level
    ON runtime_events(domain, level, occurred_at_ms DESC, id DESC);
```

| Index | Serves |
|---|---|
| `_time` | the default unfiltered newest-first page, the `start_ms`/`end_ms` window, the cursor predicate, and the prune's `OFFSET` scan |
| `_correlation` | `get_correlation_timeline` — the only single high-selectivity equality in the whole filter set, and this tool's entire reason to exist |
| `_domain_level` | `domain = ?`, `domain = ? AND level = ?`, each newest-first via the trailing sort columns |

Deliberately **not** indexed, with reasons, so the omissions read as decisions:

- `level` alone — 4 distinct values; an index buys nothing a retention-bounded scan does not.
- `event_type` — mostly NULL, low cardinality when set, and in practice always AND-ed with domain or a
  time window.
- `entity_id` — sparse; anime-scoped questions are answered by `activity_log` and the capture log.
- `message` free text — `LIKE` scan bounded by retention, the same call the capture reader already
  makes on its text paths.

Four write-side index updates per inserted row is the write-amplification ceiling worth paying on a
table that takes a write per log line.

## Read Path

### Presence tolerance

```go
// internal/observability/eventlog/reader.go
// NewReader builds a query helper over an already-open handle and probes once
// for runtime_events. A missing table is NOT an error: Available() reports
// false and every query returns an unavailable envelope, so a sidecar pointed
// at a bridge database predating this change still serves the capture tools.
func NewReader(db *sql.DB) *Reader
func (r *Reader) Available() bool
```

Hard constraint: `runtime_events` **MUST NOT** be probed inside
`requestcapture.OpenReadOnlyDB`. That function fails closed on schema mismatch
(`reader.go:211-227`); adding the events table there would make a pre-change database kill the whole
sidecar, contradicting both `Missing events table degrades safely` and `Existing tools are unaffected
by the missing events table`. The event reader is constructed **after** `OpenReadOnlyDB` succeeds,
over `ro.DB()` — the same handle, already `mode=ro` with `PRAGMA query_only=ON` verified, so no second
connection is opened and `VerifyQueryOnly` continues to hold for every new read by construction.

### Correlation timeline read

```mermaid
sequenceDiagram
  participant C as MCP client
  participant T as get_correlation_timeline
  participant CR as requestcapture.Reader
  participant ER as eventlog.Reader
  participant DB as bridge SQLite (mode=ro, query_only)

  C->>T: {correlation_id: "abc-123"}
  T->>T: trim/validate; empty -> invalid_params
  T->>CR: Search(SearchFilters{ChangelogID:nil, ...}) scoped by correlation
  CR->>DB: SELECT ... FROM request_captures WHERE json_each(correlation_json ...)
  DB-->>CR: matching capture rows (may be zero)
  T->>ER: Available()?
  alt runtime_events absent
    ER-->>T: events_available=false, events=[]
  else present
    T->>ER: EventsByCorrelation(ctx, "abc-123", cap)
    ER->>DB: SELECT ... FROM runtime_events WHERE correlation_id = ? ORDER BY occurred_at_ms DESC, id DESC LIMIT ?
    DB-->>ER: matching event rows (may be zero)
  end
  T-->>C: {requests: [...], events: [...], events_available: bool}
  Note over T,C: Zero matches on either side is a valid empty result, never an error.
```

Both sides are read with the existing capture correlation predicate and the new indexed
`correlation_id =` equality. The result is a two-field envelope plus an availability flag; it is
**not** paginated — it is bounded by a per-side cap (`maxTimelineItems = 200`) because a single
correlation id names one request's worth of work, and an unbounded timeline would be a scan disguised
as a lookup.

### Filter type

```go
// internal/observability/eventlog/filters.go
// EventFilters is the runtime-event filter set. It shares only correlation id,
// entity id, and the time window with requestcapture.SearchFilters -- events
// have no route, status, outcome, kind, or device, and requests have no domain
// or level. Every populated field composes as a conjunction (AND).
type EventFilters struct {
    Domain        string
    Level         string
    EventType     string
    CorrelationID string
    EntityID      string
    Text          string   // free text over message, domain, event_type
    StartMS       *int64
    EndMS         *int64
}

func (f EventFilters) whereClause() (string, []any)
```

`Text` expands to `(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)` with a `%value%` bind on
each — three binds, one parenthesized clause, so it composes safely with the other conjuncts and with
the cursor predicate. Exactly the three columns the spec's `Free text matches message, domain, or
event type` scenario names; `metadata_json` is out of scope by Decision 7.

`whereClause` returns `("", nil)` for a zero-value filter, matching `SearchFilters.whereClause`
(`filters.go:76-79`) so the empty-filter path stays a plain newest-first query.

### MCP surface

| Tool | Input | Result |
|---|---|---|
| `search_events` | `SearchEventsInput{limit, cursor, domain, level, event_type, correlation_id, entity_id, text, start_ms, end_ms}` | `= eventlog.EventSearchPage` |
| `summary_events` | `SummaryEventsInput{...same filters, no pagination}` | `= eventlog.EventSummaryResult` |
| `get_correlation_timeline` | `GetCorrelationTimelineInput{correlation_id}` | `CorrelationTimelineResult{requests, events, events_available}` |

`summary_events` returns three grouping dimensions plus bounded samples:

```go
type EventSummaryResult struct {
    ByDomain    []EventCountGroup `json:"by_domain"`
    ByLevel     []EventCountGroup `json:"by_level"`
    ByEventType []EventCountGroup `json:"by_event_type"`
    Samples     []EventSample     `json:"samples"`      // newest matching, bounded
    Available   bool              `json:"available"`
}
```

Three separate `GROUP BY` queries over the same `whereClause` rather than one composite
`(domain, level, event_type)` grouping: the spec asks for counts **by** each dimension, and a
composite grouping would force the client to re-aggregate to answer "how many errors in total".
Empty match returns all three slices non-nil and empty with `Samples: []` — a zeroed aggregation,
never an error, mirroring `summary_requests`. Sample cap defaults to 5 per the existing summary
precedent, configurable via a package constant.

Tool-surface change: `server.go`'s `tools` slice grows to the seven names, three `mcp.AddTool`
registrations are added, and `obs.ValidateToolName` accepts exactly the seven. No aliases.

## File / Test Map

Go policy: warn at 400, hard fail above 500 effective lines. `tools/checkgofilesize/baseline.yaml`
stays `files: []`. Projections are deliberately conservative and split up front, as
`requestcapture` already does.

| File | Action | Projection | Content |
|---|---|---|---|
| `internal/observability/obserr/errors.go` | **Create** | ~55 | `Error` + `Unavailable`/`SchemaMismatch`/`InvalidParams`/`Unsupported` constructors |
| `internal/observability/requestcapture/types.go` | Modify | 205 → ~185 | `type Error = obserr.Error`, delegate 4 constructors, `ValidateToolName` → 7 names |
| `internal/observability/eventlog/schema.go` | **Create** | ~60 | table + 3 index DDL consts, `SchemaTables()` |
| `internal/observability/eventlog/types.go` | **Create** | ~115 | `EventRecord`, `EventSearchParams`, `EventSearchPage`, summary types, config structs, consts |
| `internal/observability/eventlog/filters.go` | **Create** | ~90 | `EventFilters` + `whereClause` |
| `internal/observability/eventlog/sink.go` | **Create** | ~115 | `Sink`, `Bind`/`Unbind`, level policy, timestamp resolution, drop counters |
| `internal/observability/eventlog/queue.go` | **Create** | ~125 | `Store` iface, `Queue`, `TryEnqueue`/`run`/`persist`/`Stop` (mirrors `requestcapture/queue.go`) |
| `internal/observability/eventlog/store.go` | **Create** | ~130 | `SQLiteStore`, `InsertEvent`, `pruneOldestBeyondRetention` |
| `internal/observability/eventlog/metadata.go` | **Create** | ~80 | sensitive-key deny list, redaction, 4KB bound, marker object |
| `internal/observability/eventlog/reader.go` | **Create** | ~150 | `Reader`, presence probe, `Available`, row scan, cursor encode/decode |
| `internal/observability/eventlog/reader_search.go` | **Create** | ~95 | `Search` + cursor + `LIMIT` |
| `internal/observability/eventlog/reader_summary.go` | **Create** | ~125 | 3 grouping queries + bounded samples |
| `internal/observability/eventlog/reader_correlation.go` | **Create** | ~55 | `EventsByCorrelation` |
| `internal/logger/fanout.go` | Modify | 49 → ~62 | export `EntrySink`, add `NewFanoutLoggerWithSinks`; `write` untouched |
| `internal/sync/sqlite_bootstrap.go` | Modify | +2 | append `eventlog.SchemaTables()` |
| `internal/mcp/requestcapture/event_types.go` | **Create** | ~110 | 3 input types, `toEventFilters()`, result aliases, `EventReader` iface |
| `internal/mcp/requestcapture/event_tools.go` | **Create** | ~95 | 3 handlers incl. clamping and the timeline merge |
| `internal/mcp/requestcapture/reader.go` | Modify | 239 → ~265 | `sqliteReader` gains `events *eventlog.Reader` built from `ro.DB()`, + 3 delegates |
| `internal/mcp/requestcapture/server.go` | Modify | 48 → ~75 | 3 registrations, `tools` → 7, fix the stale "three read-only capture tools" doc comment |
| `app.go` | Modify | +12 | `eventSink`, `eventQueue` field + iface, `newEventQueue` seam, shutdown unbind+stop |
| `app_defaults.go` | Modify | +10 | construct sink in `ensureRuntimeObservability`, pass via `NewFanoutLoggerWithSinks`, default `newEventQueue` |
| `app_runtime_services.go` | Modify | +20 | `configureEventLogQueue()` — read setting, build store+queue, bind sink |
| `docs/openapi.yaml`, MCP tool docs, `docs/learning-log.md` | Modify | — | new tools + event filter documented; one learning-log line at the end |

If `reader_summary.go` or `event_tools.go` overruns during apply, the split is pre-decided: summary
grouping queries move to `reader_summary_groups.go`; the timeline handler moves to
`event_tools_timeline.go`.

## TDD Ordering (strict TDD — RED before every unit)

`openspec/config.yaml` sets `strict_tdd: true`. Named REDs, in dependency order:

1. **Schema** — `internal/sync/sqlite_bootstrap_tables_test.go`:
   `TestBootstrapCreatesRuntimeEventsTable`, `TestBootstrapCreatesRuntimeEventIndexes`,
   `TestBootstrapRuntimeEventsIdempotentAcrossTwoOpens`.
2. **Fanout seam** — `internal/logger/fanout_test.go`:
   `TestNewFanoutLoggerWithSinksFansOutToSinkOnlyTarget`,
   `TestNewFanoutLoggerSignatureUnchangedForLoggerTargets`.
3. **Sink** — `eventlog/sink_test.go`:
   `TestSinkDropsWhenQueueUnbound` (+ `UnboundDrops` counted),
   `TestSinkDropsDebugByDefault`, `TestSinkPersistsDebugWhenEnabled`,
   `TestSinkPersistsInfoWarnErrorAlways`,
   `TestSinkConvertsRFC3339TimestampToEpochMillis`,
   `TestSinkFallsBackToInjectedNowOnUnparsableTimestamp`,
   `TestSinkBindsNullDurationForZero`,
   **`TestSinkWriteEntryDoesNotBlockOnDeliberatelySlowStore`** — bind a queue over a store that
   blocks on an unbuffered channel, saturate queue capacity, assert every `WriteEntry` returns inside
   a hard deadline and `DroppedTotal() > 0`. This is the spec's `A slow store never delays the caller`
   and `Overflow drops instead of stalling` in one seam, mirroring `blockingQueueStore` in
   `requestcapture/queue_test.go`.
   `TestSinkUnbindStopsEnqueueBeforeQueueStop`.
4. **Metadata** — `eventlog/metadata_test.go`:
   `TestMetadataNilMapBindsNull`, `TestMetadataRedactsSensitiveKeys` (authorization, token, cookie,
   password, secret, api_key, bearer — case-insensitive),
   `TestMetadataOverBudgetStoresMarkerNotTruncatedJSON`,
   `TestMetadataMarshalFailureBindsNullNotError`,
   `TestMetadataNeverStoresRawHeaders`.
5. **Store** — `eventlog/store_test.go`:
   `TestInsertEventWritesEveryColumn`, `TestInsertEventNullableFieldsBindNull`,
   `TestPruneRunsOnlyEveryNthWrite`, `TestPruneRemovesOldestBeyondRowCap`,
   `TestRowCapHoldsUnderSustainedWrites`.
6. **Reader** — `eventlog/reader_test.go`, `reader_search_test.go`, `reader_summary_test.go`,
   `reader_correlation_test.go`:
   `TestNewReaderAvailableFalseWhenTableMissing`,
   `TestSearchReturnsUnavailableEnvelopeWhenTableMissing`,
   `TestSearchNewestFirstDefaultLimit`, `TestSearchClampsOversizedLimit`,
   `TestSearchCursorPaginatesWithoutGapOrDuplicate`,
   `TestSearchInvalidCursorReturnsInvalidParams`,
   `TestSearchDomainLevelTimeWindowConjunction`,
   `TestSearchFreeTextMatchesMessageDomainEventType`,
   `TestSearchFreeTextDoesNotMatchMetadata`,
   `TestSearchUnmatchedFiltersReturnEmptyPageWithValidPagination`,
   `TestSearchTolerateMalformedRowCountsWarning`,
   `TestSummaryCountsByDomainLevelEventType`, `TestSummarySamplesBounded`,
   `TestSummaryScopedByFilters`, `TestSummaryEmptyMatchReturnsZeroedAggregation`,
   `TestEventsByCorrelationReturnsMatchesNewestFirst`,
   `TestEventsByCorrelationUnknownIDReturnsEmpty`,
   `TestEventsWithoutCorrelationIDStillSearchableByDomain`.
7. **Tool surface** — `requestcapture/types_test.go`:
   replace `TestValidateToolNameAcceptsExactlyFourBareNames` with
   `TestValidateToolNameAcceptsExactlySevenBareNames`, plus
   `TestValidateToolNameRejectsAliasVariants`.
   `internal/mcp/requestcapture/server_test.go`: `TestSidecarExposesExactlySevenTools`,
   `TestEachToolNameAppearsExactlyOnce`.
8. **MCP tools** — `internal/mcp/requestcapture/event_tools_test.go`:
   `TestSearchEventsAppliesDefaultAndMaxLimit`,
   `TestSearchEventsPassesEveryFilterThrough`,
   `TestSummaryEventsEmptyZeroed`,
   `TestCorrelationTimelineMergesRequestsAndEvents`,
   `TestCorrelationTimelineUnknownIDReturnsEmptyResult`,
   `TestCorrelationTimelineDegradesWhenEventsTableMissing`,
   `TestEventToolsAreReadOnly` (assert row counts across `runtime_events`, `request_captures`, and
   `activity_log` unchanged after every tool invocation with every input shape).
9. **Read-only invariants + existing-tool isolation** — `internal/mcp/requestcapture/reader_test.go`:
   `TestEventReaderSharesTheQueryOnlyHandle`,
   `TestVerifyQueryOnlyHoldsForEventReads`,
   `TestExistingFourToolsUnaffectedByMissingEventsTable`.
10. **Persistence across restart + UI isolation** — `app_startup_test.go` / `app_runtime_test.go`:
    `TestLoggedEventSurvivesBridgeRestart`,
    `TestGetRecentLogsUnchangedWithEventPersistenceActive`,
    `TestActivityLogUntouchedByEventPersistence`.

## Drift Found (CLAUDE.md rule 2 — runtime code wins)

- **`internal/mcp/requestcapture/server.go:16`** documents "the **three** read-only capture tools"
  while **four** are registered. Already stale by one; this change makes it seven. Corrected here.
- **`ensureRequestCaptureMetadata` seeds `request_capture_schema_version = '5'`**
  (`sqlite_bootstrap.go:182`) and `isSupportedCaptureSchemaVersion` accepts `{1,2,3,4,5}`
  (`reader.go:238-245`), while `capture-nomenclature-rename/design.md` specifies `'3'` and `{1,2,3}`.
  Two later slices bumped it. Code wins. Recorded because a reader coming from the sibling design
  will expect `3`; this change **does not touch that version** — `runtime_events` is a separate table
  whose tolerance is a presence probe, not a version stamp.
- **The "exactly N tools" requirement lives only in unarchived `mobile-request-mcp` deltas**, not in
  `openspec/specs/observability/spec.md`. Verified. The 4 → 7 amendment therefore lands in the
  `mobile-request-mcp` delta only; the `observability` delta carries the persistence requirements.
  Promotion of the capability spec happens at archive time, as `capture-nomenclature-rename` already
  noted.
- **`requestcapture.Reader.Search` issues no SQL `LIMIT`** (`reader_search.go:38-61`) — it selects
  every row and truncates in Go. Not a regression this change introduces and not fixed here (out of
  scope), but the event reader deliberately does **not** copy it (Decision 6b). Worth a follow-up on
  the capture side.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Logger hot-path regression | Med | Level filter + nil-queue check are string compare and atomic load; the only allocation on the caller's goroutine is the `EventRecord` value; `TryEnqueue` is zero-wait; `fanout.go`'s `write` gains no lock. Proven by `TestSinkWriteEntryDoesNotBlockOnDeliberatelySlowStore`. |
| Event volume dwarfs the estimate, retention constants wrong | Med | Constants are `EventStoreConfig` fields, retunable without a design change. Apply phase MUST measure and record real per-session counts. Debug default OFF removes the dominant driver. |
| Early-boot events never persisted | High (certain) | Accepted and documented; counted via `UnboundDrops()`. Nothing regresses — those entries were never persisted before, and the ring buffer still shows them. |
| Events table probe breaks the sidecar for old databases | Med | Probe is strictly outside `OpenReadOnlyDB`; `Available()` false yields an `unavailable` envelope. Two dedicated tests assert the four existing tools are unaffected. |
| Secrets reach `metadata_json` | Med | `Fields.Metadata` is default-allow today, so the store applies a default-**deny** key filter plus a 4KB bound. Explicitly: no auth tokens, no raw headers, asserted by test. The `message` string itself carries only what the Runtime Events tab already displays — no new capture surface. |
| `obserr` extraction reads as unrelated refactor | Low | Justified by the one-error-schema-for-seven-tools requirement; cheap veto path stated in Decision 3b (duplicate the envelope in `eventlog`). |
| Review-size creep | High | Persistence and reader are genuinely coupled (tools are unimplementable without rows). Slice stays read-only: no UI change, no logger redesign, no export. Contingency tail is `summary_events` (Decision 8), not the timeline. |
| `ValidateToolName` living in the capture package looks misplaced | Low | Stated as a deliberate single-gate choice in Decision 3c with the move recorded as a follow-up, so it is not read as an oversight. |

## Rollback

Additive and observability-only at every step; canonical anime state is never touched.

1. **Read side** — unregister the three tools, revert `ValidateToolName` to four names. The sidecar
   returns to today's behavior; the table simply goes unread.
2. **Write side** — drop the sink from `NewFanoutLoggerWithSinks` (or call `Unbind()`). The logger is
   in-memory-only again; the table stops growing.
3. **Config** — deleting the `app_settings` row restores the default (debug not persisted).
4. **Schema** — leave `runtime_events` in place. `CREATE TABLE IF NOT EXISTS`, no canonical state, no
   other reader. Dropping it is optional cleanup, not a rollback step.
5. **Frontend** — nothing to revert. `GetRecentLogs()` and the Runtime Events tab are untouched at
   every step.

Partial rollback is safe in either order: sink without tools is a silent recorder; tools without a
sink return valid empty pages.
