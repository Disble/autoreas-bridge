# MCP Event Visibility Report

## Summary

The Transactions UI displayed seven events for the `tracer-bullet-anime` flow.
The Bridge request MCP could retrieve only the API startup event. It could not
retrieve the remaining transaction events through either its unfiltered or
filtered event queries.

**Status: root cause identified.** The UI and the MCP read two different
stores, and the store the MCP reads is fed by a sink that is still unbound
while the tracer bullet runs. Details in "Root cause" below.

## Events displayed in the UI

| Domain | Level | Event |
| --- | --- | --- |
| `system` | `info` | `tracer bullet ready` |
| `anime` | `info` | `publishing anime.changed for tracer-bullet-anime` |
| `bus` | `debug` | `publish anime.changed` |
| `sync` | `info` | `received anime.changed for tracer-bullet-anime` |
| `bus` | `debug` | `publish sync.requested` |
| `websocket` | `info` | `forwarded anime.changed for tracer-bullet-anime` |
| `api` | `info` | `http server listening on [::]:8080` |

The UI footer reported: `7 entries · 0 errors · 7 shown`.

## MCP observations

### Unfiltered event search

`autoreas-request-mcp_search_events(limit: 20)` returned one event only:

- Domain: `api`
- Level: `info`
- Message: `http server listening on [::]:8080`
- Timestamp: `1785425778000` milliseconds since Unix epoch

### Filtered event searches

The following MCP searches failed before returning event records:

- Text: `tracer bullet`
- Domain: `bus`
- Domain: `sync`
- Domain: `websocket`

Each failed MCP response violated its declared output schema:

```text
validating /properties/items: type: <invalid reflect.Value> has type "null", want "array"
```

## Root cause

### Two stores, not one

Both readers hang off the same `sharedLogger`, which fans out to two targets:

- **UI**: `App.GetRecentLogs()` (`app_runtime.go:109`) returns
  `a.memLogger.Recent()` — an in-memory ring buffer attached at logger
  construction. It captures every entry from the first log line, debug
  included.
- **MCP**: the SQLite `runtime_events` table, written by `eventlog.Sink` →
  `eventlog.Queue` → `eventlog.SQLiteStore`, and read back through
  `eventlog.Reader.Search`.

The two are not different retention windows or different runtime instances.
They are different sinks with different lifecycles.

### The unbound window

`configureEventLogQueue` (`app_runtime_services.go:69`) is the only caller of
`Sink.Bind`. The ordering in `startup()` (`app.go:191`) is:

```text
app.go:199   tracerBulletRunner.Start()      <- all six tracer-bullet events fire here
app.go:204   initializeBridgeDatabase(ctx)
app.go:208   configureRuntimeServices(ctx)   -> configureEventLogQueue -> Sink.Bind
```

Before `Bind`, `Sink.WriteEntry` (`sink.go:53`) observes a nil queue pointer,
increments `unboundDrops`, and returns. Every tracer-bullet event lands inside
that window and is discarded.

The `api` event survives for one reason: `startHTTPServer` is the last step of
`configureRuntimeServices`, so it emits after `Bind`. The seven-versus-one
split falls exactly on that boundary.

`sink.go:24` documents the window as "the accepted early-boot gap". The gap is
intentional; the tracer bullet living entirely inside it is not.

### Debug-level filtering (secondary)

The two `bus` rows are dropped a second, independent way.
`eventlog.SinkConfig.PersistDebug` defaults to `false` (`app_defaults.go:240`
constructs the sink with a zero-value config), and the `app_settings` key
`observability.events.persist_debug` is unset. `sink.go:59` therefore refuses
debug entries permanently — those two rows would still be missing after the
ordering is corrected.

### Response-shape defect (unrelated)

`EventSearchPage.Items` is declared `[]EventRecord` (`types.go:51`), and
`scanEventSearchPage` (`reader_search.go:89`) starts from
`EventSearchPage{AppliedLimit: limit}`. On zero matches `Items` stays a nil
slice and marshals to `null`, violating the tool's declared output schema.

This is why the unfiltered search succeeded (one row, non-nil) while every
filtered search failed. `EventSummaryResult` (`types.go:73`) already documents
a non-nil-empty contract for the summary path; the search path does not honour
the same contract.

## Recommended fixes

| Defect | Fix |
| --- | --- |
| Unbound window | Bind the sink earlier, or give it a small pre-bind buffer flushed on `Bind`, so early-boot entries are not lost. |
| Debug filtering | No change. The default is deliberate and documented (`types.go:87`); debug volume would evict the info/warn/error rows that carry failure signal. |
| `null` vs `[]` | Initialize `Items` to an empty slice in `scanEventSearchPage` so an empty page serializes as `[]`. |

Surfacing `Sink.UnboundDrops()` in runtime diagnostics would make any future
occurrence of the first defect self-reporting rather than silent.

## Incidental finding: prune cadence

Unrelated to event visibility, found while tracing the write path.

`SQLiteStore.pruneOldestBeyondRetention` (`store.go:53`) prunes on
`s.successful % s.pruneEvery == 0`, and `s.successful` is an in-memory field
initialized to zero by `NewStore`. A process that persists fewer than
`pruneEvery` (200) events therefore never prunes at all. For a desktop app with
short sessions this is the common case, so `runtime_events` can exceed its
20 000-row cap and stay there until some longer session crosses the threshold.

Suggested fix: seed the counter from `COUNT(*)` at construction, or run one
unconditional prune when the store opens.

## Retention sizing (reviewed, no change)

The 20 000-row cap was reviewed during this investigation and is retained.

- The only per-operation emitter, `InstrumentedBus.Publish`, logs at `debug`
  and is filtered by default, so the persisted rate in shipped configuration is
  tens to low hundreds of rows per day.
- All three indexes (`idx_runtime_events_time`,
  `idx_runtime_events_correlation`, `idx_runtime_events_domain_level`) carry
  the trailing `occurred_at_ms DESC, id DESC` sort keys used by the prune, the
  search cursor, and the correlation lookup. The prune's
  `LIMIT -1 OFFSET 20000` is an index walk, not a table sort, amortized across
  200 writes.

No age-based retention axis was added: it would solve a problem that has not
been observed, and the row cap plus the existing indexes already bound both
storage and query cost.
