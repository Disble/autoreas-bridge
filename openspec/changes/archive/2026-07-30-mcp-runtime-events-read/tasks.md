# Tasks: MCP Runtime-Event Read Surface

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1400-1650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | W1 obserr + schema + fanout seam -> W2 eventlog write path (sink/metadata/queue/store) -> W3 eventlog read path (reader/search/correlation, summary last) -> W4 MCP tool surface + app wiring + docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Rollback boundary | Lines |
|---|---|---|---|---|---|
| 1 | shared error envelope + schema + fanout seam | PR 1 | `go test ./internal/observability/obserr ./internal/observability/requestcapture ./internal/sync ./internal/logger -run "Test(Unavailable|SchemaMismatch|InvalidParams|Unsupported|Bootstrap|NewFanoutLogger)"` | `internal/observability/obserr/errors.go`, `internal/observability/requestcapture/types.go`, `internal/observability/eventlog/schema.go`, `internal/sync/sqlite_bootstrap.go`, `internal/logger/fanout.go` | 220-260 |
| 2 | write path: sink, metadata, queue, store | PR 2 | `go test ./internal/observability/eventlog -run "Test(Sink|Metadata|InsertEvent|Prune|RowCap)"` | `internal/observability/eventlog/{types.go,filters.go,sink.go,metadata.go,queue.go,store.go}` | 500-570 |
| 3 | read path: reader, search, correlation (summary last, tail-removable) | PR 3 | `go test ./internal/observability/eventlog -run "Test(NewReader|Search|EventsByCorrelation|Summary)"` | `internal/observability/eventlog/{reader.go,reader_search.go,reader_correlation.go,reader_summary.go}` | 425-500 |
| 4 | MCP tool surface + app wiring + docs | PR 4 | `go test ./internal/mcp/requestcapture ./internal/observability/requestcapture -run "Test(ValidateToolName|SidecarExposes|SearchEvents|SummaryEvents|CorrelationTimeline|EventReader|VerifyQueryOnly|ExistingFourTools)" && go test . -run "Test(LoggedEventSurvivesBridgeRestart|GetRecentLogsUnchanged|ActivityLogUntouched)"` | `internal/mcp/requestcapture/{event_types.go,event_tools.go,reader.go,server.go}`, `app.go`, `app_defaults.go`, `app_runtime_services.go`, `docs/` | 255-320 |

## Phase 1: Shared error envelope (`obserr` extraction)

- [x] 1.1 RED `internal/observability/obserr/errors_test.go`: `TestUnavailableConstructorShape`, `TestSchemaMismatchConstructorShape`, `TestInvalidParamsConstructorShape`, `TestUnsupportedConstructorShape` — assert the exported `Error` struct fields and each constructor's populated code/message match the current unexported constructors in `requestcapture/types.go` byte-for-byte. Command: `go test ./internal/observability/obserr`.
- [x] 1.2 GREEN create `internal/observability/obserr/errors.go`: `type Error struct{...}` + `Unavailable`/`SchemaMismatch`/`InvalidParams`/`Unsupported` constructors, ported unchanged from `requestcapture/types.go`.
- [x] 1.3 GREEN update `internal/observability/requestcapture/types.go`: replace the local `Error` type with `type Error = obserr.Error`, delegate the four constructors to `obserr`, drop the now-duplicate definitions.
- [x] 1.4 REFACTOR rerun `go test ./internal/observability/requestcapture` and confirm every existing `obs.Error{...}` literal and `errors.As` call site compiles unchanged (zero call-site churn per design decision 3b); rerun `go test ./internal/observability/obserr`.

## Phase 2: Schema (`runtime_events` table)

- [x] 2.1 RED `internal/sync/sqlite_bootstrap_tables_test.go`: `TestBootstrapCreatesRuntimeEventsTable`, `TestBootstrapCreatesRuntimeEventIndexes`, `TestBootstrapRuntimeEventsIdempotentAcrossTwoOpens`. Command: `go test ./internal/sync -run "TestBootstrapCreatesRuntimeEvent|TestBootstrapRuntimeEventsIdempotentAcrossTwoOpens"`.
- [x] 2.2 GREEN create `internal/observability/eventlog/schema.go`: `runtime_events` table DDL (`id INTEGER PRIMARY KEY AUTOINCREMENT`, `occurred_at_ms`, `domain`, `level`, `message`, `correlation_id`, `entity_id`, `event_type`, `duration_ms`, `metadata_json`), the three index DDL consts (`idx_runtime_events_time`, `idx_runtime_events_correlation`, `idx_runtime_events_domain_level`), and `SchemaTables() []persistence.TableSchema` (create-only, no `Migrate`, no version stamp — per design decision 4/schema section).
- [x] 2.3 GREEN append `eventlog.SchemaTables()` to the `tables` slice assembled in `internal/sync/sqlite_bootstrap.go`'s `initializeBridgeDB` composition (new DDL does **not** go into `internal/sync/schema.go`, per `tools/checkarchitecture`).
- [x] 2.4 REFACTOR rerun `go test ./internal/sync`; confirm `eventlog/schema.go` stays well under the 400-line warn budget.

## Phase 3: Fanout seam

- [x] 3.1 RED `internal/logger/fanout_test.go`: `TestNewFanoutLoggerWithSinksFansOutToSinkOnlyTarget`, `TestNewFanoutLoggerSignatureUnchangedForLoggerTargets`. Command: `go test ./internal/logger -run "TestNewFanoutLogger"`.
- [x] 3.2 GREEN export `logger.EntrySink` (the existing unexported `entrySink` interface); add `logger.NewFanoutLoggerWithSinks(loggers []Logger, sinks ...EntrySink) *FanoutLogger`; `NewFanoutLogger(loggers ...Logger)` keeps its signature and delegates to the new constructor with zero sinks.
- [x] 3.3 REFACTOR confirm `fanout.go`'s `write` method is byte-identical (no lock added — hot-path constraint from design decision 1); rerun `go test ./internal/logger`; confirm `fanout.go` stays under the 400-line warn budget (~62 lines projected).

## Phase 4: Event record types and filters

- [x] 4.1 GREEN create `internal/observability/eventlog/types.go`: `EventRecord`, `EventSearchParams`, `EventSearchPage`, `EventSummaryResult`, `EventCountGroup`, `EventSample`, `CorrelationTimelineResult` (used by MCP layer), `SinkConfig`, `EventStoreConfig` (row cap 20000, prune-every 200, `maxTimelineItems = 200`, sample cap 5 — package constants per design decisions 5, 7, 8).
- [x] 4.2 RED `internal/observability/eventlog/filters_test.go`: `TestEventFiltersWhereClauseComposesConjunction`, `TestEventFiltersZeroValueReturnsEmptyClause`, `TestEventFiltersTextExpandsToMessageDomainEventType`. Command: `go test ./internal/observability/eventlog -run "TestEventFilters"`.
- [x] 4.3 GREEN create `internal/observability/eventlog/filters.go`: `EventFilters{Domain, Level, EventType, CorrelationID, EntityID, Text, StartMS, EndMS}` + `whereClause()` — `Text` expands to `(message LIKE ? OR domain LIKE ? OR event_type LIKE ?)` with three `%value%` binds; zero-value filter returns `("", nil)`.
- [x] 4.4 REFACTOR rerun `go test ./internal/observability/eventlog`; confirm `types.go` (~115) and `filters.go` (~90) stay under the 400-line warn budget.

## Phase 5: Sink (non-blocking write entry point)

- [x] 5.1 RED `internal/observability/eventlog/sink_test.go`:
  `TestSinkDropsWhenQueueUnbound` (asserts `UnboundDrops()` increments),
  `TestSinkDropsDebugByDefault`,
  `TestSinkPersistsDebugWhenEnabled`,
  `TestSinkPersistsInfoWarnErrorAlways`,
  `TestSinkConvertsRFC3339TimestampToEpochMillis`,
  `TestSinkFallsBackToInjectedNowOnUnparsableTimestamp`,
  `TestSinkBindsNullDurationForZero`,
  `TestSinkWriteEntryDoesNotBlockOnDeliberatelySlowStore` — bind a queue over a store that blocks on an unbuffered channel, saturate queue capacity, assert every `WriteEntry` returns inside a hard deadline and `DroppedTotal() > 0` (mirrors `blockingQueueStore` in `requestcapture/queue_test.go`; this is the spec's `A slow store never delays the caller` and `Overflow drops instead of stalling` scenarios in one seam),
  `TestSinkUnbindStopsEnqueueBeforeQueueStop`.
  Command: `go test ./internal/observability/eventlog -run "TestSink"`.
- [x] 5.2 GREEN create `internal/observability/eventlog/sink.go`: `Sink` implementing `logger.EntrySink` via `WriteEntry`, `atomic.Pointer[Queue]` binding, `Bind(queue *Queue, persistDebug bool)` / `Unbind()`, level-filter-before-enqueue policy (Decision 2b), RFC3339-to-epoch-millis timestamp conversion with injectable `now()` fallback (Decision 4b), `UnboundDrops()` / `FilteredDrops()` / `DroppedTotal()` counters.
- [x] 5.3 REFACTOR confirm `Sink.WriteEntry` allocates only the `EventRecord` value on the caller's goroutine and never touches SQLite; rerun `go test ./internal/observability/eventlog -run "TestSink"`; confirm `sink.go` stays under the 400-line warn budget (~115 projected).

## Phase 6: Metadata bound and redaction

- [x] 6.1 RED `internal/observability/eventlog/metadata_test.go`:
  `TestMetadataNilMapBindsNull`,
  `TestMetadataRedactsSensitiveKeys` (authorization, token, cookie, password, secret, api_key, bearer — case-insensitive),
  `TestMetadataOverBudgetStoresMarkerNotTruncatedJSON`,
  `TestMetadataMarshalFailureBindsNullNotError`,
  `TestMetadataNeverStoresRawHeaders`.
  Command: `go test ./internal/observability/eventlog -run "TestMetadata"`.
- [x] 6.2 GREEN create `internal/observability/eventlog/metadata.go`: default-deny sensitive-key list, redaction pass, 4KB bound with a marker object on overflow (never truncated JSON), nil-safe marshal.
- [x] 6.3 REFACTOR rerun `go test ./internal/observability/eventlog -run "TestMetadata"`; confirm `metadata.go` stays under the 400-line warn budget (~80 projected).

## Phase 7: Queue and store (insert + retention)

- [x] 7.1 RED `internal/observability/eventlog/store_test.go`:
  `TestInsertEventWritesEveryColumn`,
  `TestInsertEventNullableFieldsBindNull`,
  `TestPruneRunsOnlyEveryNthWrite`,
  `TestPruneRemovesOldestBeyondRowCap`,
  `TestRowCapHoldsUnderSustainedWrites`.
  Command: `go test ./internal/observability/eventlog -run "Test(InsertEvent|Prune|RowCap)"`.
- [x] 7.2 GREEN create `internal/observability/eventlog/queue.go`: `Store` interface, `Queue`, `TryEnqueue`/`run`/`persist`/`Stop`, mirroring `requestcapture/queue.go`'s zero-wait enqueue and single serialized drain goroutine.
- [x] 7.3 GREEN create `internal/observability/eventlog/store.go`: `SQLiteStore`, `InsertEvent` (marshal + redact + bound metadata via `metadata.go` before bind, `BEGIN`/`INSERT`/prune-every-200/`COMMIT`), `pruneOldestBeyondRetention` (row cap 20,000, mirrors `requestcapture/store.go`'s `pruneOldestBeyondRetention`).
- [x] 7.4 REFACTOR rerun `go test ./internal/observability/eventlog -run "Test(InsertEvent|Prune|RowCap)"`; confirm `queue.go` (~125) and `store.go` (~130) stay under the 400-line warn budget.
- [x] 7.5 REFACTOR (apply-phase measurement, not a hand-wave) run a representative bridge session with the sink bound and record the observed events-per-session count against the `EventStoreConfig{RowCap: 20000, PruneEvery: 200}` constants; if the measured rate contradicts the design's estimate, retune the constants in this same task and note the recorded number in the PR description (design risk row: "Event volume dwarfs the estimate, retention constants wrong").

## Phase 8: Reader — presence probe, search, correlation (summary last, tail-removable)

- [x] 8.1 RED `internal/observability/eventlog/reader_test.go`: `TestNewReaderAvailableFalseWhenTableMissing`. Command: `go test ./internal/observability/eventlog -run "TestNewReaderAvailableFalseWhenTableMissing"`.
- [x] 8.2 GREEN create `internal/observability/eventlog/reader.go`: `NewReader(db *sql.DB) *Reader` — probes once for `runtime_events` presence over an already-open handle (never inside `requestcapture.OpenReadOnlyDB`), `Available() bool`, row scan helpers, cursor encode/decode (base64 RawURL JSON, keyed `(occurred_at_ms, id)`, mirrors `SearchPage`'s cursor).
- [x] 8.3 RED `internal/observability/eventlog/reader_search_test.go`:
  `TestSearchReturnsUnavailableEnvelopeWhenTableMissing`,
  `TestSearchNewestFirstDefaultLimit`,
  `TestSearchClampsOversizedLimit`,
  `TestSearchCursorPaginatesWithoutGapOrDuplicate`,
  `TestSearchInvalidCursorReturnsInvalidParams`,
  `TestSearchDomainLevelTimeWindowConjunction`,
  `TestSearchFreeTextMatchesMessageDomainEventType`,
  `TestSearchFreeTextDoesNotMatchMetadata`,
  `TestSearchUnmatchedFiltersReturnEmptyPageWithValidPagination`,
  `TestSearchTolerateMalformedRowCountsWarning`.
  Command: `go test ./internal/observability/eventlog -run "TestSearch"`.
- [x] 8.4 GREEN create `internal/observability/eventlog/reader_search.go`: `Search` — SQL `LIMIT ?` (limit+1) applied in the query itself (Decision 6b, deliberately unlike `requestcapture.Reader.Search`), default limit 25 / max 100 clamped in the reader.
- [x] 8.5 RED `internal/observability/eventlog/reader_correlation_test.go`: `TestEventsByCorrelationReturnsMatchesNewestFirst`, `TestEventsByCorrelationUnknownIDReturnsEmpty`, `TestEventsWithoutCorrelationIDStillSearchableByDomain`. Command: `go test ./internal/observability/eventlog -run "TestEventsByCorrelation|TestEventsWithoutCorrelationIDStillSearchableByDomain"`.
- [x] 8.6 GREEN create `internal/observability/eventlog/reader_correlation.go`: `EventsByCorrelation(ctx, correlationID string, cap int)` — indexed `correlation_id =` equality, bounded by `maxTimelineItems`, newest-first.
- [x] 8.7 REFACTOR rerun `go test ./internal/observability/eventlog -run "Test(NewReader|Search|EventsByCorrelation)"`; confirm `reader.go` (~150), `reader_search.go` (~95), `reader_correlation.go` (~55) stay under the 400-line warn budget.
- [x] 8.8 **[tail-removable]** RED `internal/observability/eventlog/reader_summary_test.go`: `TestSummaryCountsByDomainLevelEventType`, `TestSummarySamplesBounded`, `TestSummaryScopedByFilters`, `TestSummaryEmptyMatchReturnsZeroedAggregation`. Command: `go test ./internal/observability/eventlog -run "TestSummary"`.
- [x] 8.9 **[tail-removable]** GREEN create `internal/observability/eventlog/reader_summary.go`: three separate `GROUP BY` queries (by domain, by level, by event type) over the shared `whereClause`, plus bounded newest samples (default cap 5); empty match returns all three slices non-nil-empty and `Samples: []`, never an error. If this file overruns 400 lines, split the grouping queries into `reader_summary_groups.go` (pre-decided split per design's File/Test Map).
- [x] 8.10 **[tail-removable]** REFACTOR rerun `go test ./internal/observability/eventlog -run "TestSummary"`; confirm `reader_summary.go` stays under the 400-line warn budget.

## Phase 9: Tool-surface validation (4 -> 7 names)

- [x] 9.1 RED `internal/observability/requestcapture/types_test.go`: replace `TestValidateToolNameAcceptsExactlyFourBareNames` with `TestValidateToolNameAcceptsExactlySevenBareNames` (asserting the full seven-name set: `resolve_request_context`, `search_requests`, `get_request_context`, `summary_requests`, `search_events`, `get_correlation_timeline`, `summary_events`), plus `TestValidateToolNameRejectsAliasVariants`. Command: `go test ./internal/observability/requestcapture -run "TestValidateToolName"`.
- [x] 9.2 GREEN grow `ValidateToolName` in `internal/observability/requestcapture/types.go` from four to the seven names, no aliases.
- [x] 9.3 RED `internal/mcp/requestcapture/server_test.go`: `TestSidecarExposesExactlySevenTools`, `TestEachToolNameAppearsExactlyOnce`. Command: `go test ./internal/mcp/requestcapture -run "TestSidecarExposesExactlySevenTools|TestEachToolNameAppearsExactlyOnce"`.
- [x] 9.4 GREEN grow the `tools` slice in `internal/mcp/requestcapture/server.go` to seven names (registrations land with the handlers in Phase 10) and fix the stale doc comment at `server.go:16` from "three read-only capture tools" to reflect all seven tools registered by this change.
- [x] 9.5 REFACTOR rerun `go test ./internal/observability/requestcapture ./internal/mcp/requestcapture -run "TestValidateToolName|TestSidecarExposes|TestEachToolName"`.

## Phase 10: MCP event tools (search_events, get_correlation_timeline first; summary_events last, tail-removable)

- [x] 10.1 GREEN create `internal/mcp/requestcapture/event_types.go`: `SearchEventsInput`, `SummaryEventsInput`, `GetCorrelationTimelineInput`, `toEventFilters()` converter, result type aliases (`= eventlog.EventSearchPage` / `= eventlog.EventSummaryResult`), `CorrelationTimelineResult{Requests, Events, EventsAvailable}`, and the `EventReader` interface the handlers depend on (for test doubles).
- [x] 10.2 RED `internal/mcp/requestcapture/event_tools_test.go`: `TestSearchEventsAppliesDefaultAndMaxLimit`, `TestSearchEventsPassesEveryFilterThrough`. Command: `go test ./internal/mcp/requestcapture -run "TestSearchEvents"`.
- [x] 10.3 GREEN create `internal/mcp/requestcapture/event_tools.go` with the `search_events` handler (double clamping 25/100 per Decision 6, delegating to `eventlog.Reader.Search`); register `search_events` in `server.go`.
- [x] 10.4 RED `internal/mcp/requestcapture/event_tools_test.go` (append): `TestCorrelationTimelineMergesRequestsAndEvents`, `TestCorrelationTimelineUnknownIDReturnsEmptyResult`, `TestCorrelationTimelineDegradesWhenEventsTableMissing`. Command: `go test ./internal/mcp/requestcapture -run "TestCorrelationTimeline"`.
- [x] 10.5 GREEN add the `get_correlation_timeline` handler to `event_tools.go`: trim/validate `correlation_id` (empty -> `invalid_params`), query `requestcapture.Reader.Search` scoped by correlation, query `eventlog.Reader.Available()`/`EventsByCorrelation` (unavailable -> `events_available=false, events=[]`), merge into `CorrelationTimelineResult`; register `get_correlation_timeline` in `server.go`.
- [x] 10.6 **[tail-removable]** RED `internal/mcp/requestcapture/event_tools_test.go` (append): `TestSummaryEventsEmptyZeroed`. Command: `go test ./internal/mcp/requestcapture -run "TestSummaryEventsEmptyZeroed"`.
- [x] 10.7 **[tail-removable]** GREEN add the `summary_events` handler to `event_tools.go`, delegating to `eventlog.Reader.Summary`; register `summary_events` in `server.go`.
- [x] 10.8 RED `internal/mcp/requestcapture/event_tools_test.go` (append): `TestEventToolsAreReadOnly` — assert row counts across `runtime_events`, `request_captures`, and `activity_log` are unchanged after every event-tool invocation with every input shape. Command: `go test ./internal/mcp/requestcapture -run "TestEventToolsAreReadOnly"`.
- [x] 10.9 GREEN confirm no event-tool handler issues any `INSERT`/`UPDATE`/`DELETE` (read-only by construction — this task should be a no-op verification, not new code).
- [x] 10.10 REFACTOR rerun `go test ./internal/mcp/requestcapture -run "TestSearchEvents|TestCorrelationTimeline|TestSummaryEvents|TestEventToolsAreReadOnly"`; confirm `event_types.go` (~110) and `event_tools.go` (~95, or split per design's pre-decided `event_tools_timeline.go` if it overruns) stay under the 400-line warn budget.

## Phase 11: Reader wiring and existing-tool isolation

- [x] 11.1 RED `internal/mcp/requestcapture/reader_test.go` (append): `TestEventReaderSharesTheQueryOnlyHandle`, `TestVerifyQueryOnlyHoldsForEventReads`, `TestExistingFourToolsUnaffectedByMissingEventsTable`. Command: `go test ./internal/mcp/requestcapture -run "TestEventReaderSharesTheQueryOnlyHandle|TestVerifyQueryOnlyHoldsForEventReads|TestExistingFourToolsUnaffectedByMissingEventsTable"`.
- [x] 11.2 GREEN extend `sqliteReader` in `internal/mcp/requestcapture/reader.go`: build `events *eventlog.Reader` via `eventlog.NewReader(ro.DB())` **after** `OpenReadOnlyDB` succeeds (never inside it — the hard constraint from design), add the three delegate methods the event handlers call.
- [x] 11.3 REFACTOR rerun `go test ./internal/mcp/requestcapture`; explicitly confirm a bridge DB with **no** `runtime_events` table still serves `resolve_request_context`, `search_requests`, `get_request_context`, `summary_requests` unchanged, and the three event tools return an empty/unavailable result without the sidecar exiting; confirm `reader.go` stays under the 400-line warn budget (~265 projected).

## Phase 12: App wiring — sink lifecycle and restart persistence

- [x] 12.1 GREEN wire `app.go`: `eventSink`, `eventQueue` fields + interface, `newEventQueue` construction seam, shutdown sequence `sink.Unbind()` then `eventQueue.Stop(ctx)` (unbind first so the logging goroutine takes the nil branch and never contends the queue mutex during shutdown).
- [x] 12.2 GREEN wire `app_defaults.go`: construct `eventlog.NewSink(SinkConfig{})` in `ensureRuntimeObservability` (renamed/extended as needed), register it via `logger.NewFanoutLoggerWithSinks` (the one call site that changes — `app_defaults.go:239`; the other five `NewFanoutLogger` callers stay untouched), default `newEventQueue`. Add a code comment documenting the accepted early-boot gap: events logged between logger construction and queue wiring are dropped and counted via `Sink.UnboundDrops()` (design's "Accepted gap, stated explicitly").
- [x] 12.3 GREEN wire `app_runtime_services.go`: new `configureEventLogQueue()` called from `configureRuntimeServices` — read `observability.events.persist_debug` from `app_settings`, build the store + queue, call `sink.Bind(queue, persistDebug)`.
- [x] 12.4 RED `app_startup_test.go` / `app_runtime_test.go`: `TestLoggedEventSurvivesBridgeRestart`, `TestGetRecentLogsUnchangedWithEventPersistenceActive`, `TestActivityLogUntouchedByEventPersistence`. Command: `go test . -run "TestLoggedEventSurvivesBridgeRestart|TestGetRecentLogsUnchangedWithEventPersistenceActive|TestActivityLogUntouchedByEventPersistence"`.
- [x] 12.5 GREEN make the above pass against the wiring from 12.1-12.3; if not already covered, add a test/assertion that `Sink.UnboundDrops()` is non-zero-safe (counts correctly) when a log call happens before `configureEventLogQueue()` runs.
- [x] 12.6 REFACTOR rerun `go test .`; confirm the `observability.events.persist_debug` setting round-trips through `app_settings` and defaults to OFF when absent.

## Phase 13: Docs and final gates

- [x] 13.1 Update MCP tool documentation (wherever the four existing tools are documented, e.g. `design.md`'s "MCP contract" convention or the sidecar's own doc surface if one exists) with `search_events`, `summary_events`, `get_correlation_timeline`, and the `EventFilters` shape.
- [x] 13.2 Confirm `docs/openapi.yaml` needs no change (this slice adds no REST/WS wire fields — the sidecar's MCP tool schema is a separate, non-HTTP contract); state this explicitly in the PR description rather than silently skipping it.
- [x] 13.3 Append one line to `docs/learning-log.md` documenting the deferred-bind `atomic.Pointer[Queue]` sink seam and the early-boot drop window as the non-obvious decision from this change.
- [x] 13.4 Run `gofmt -w .`, `go vet ./...`, `go test ./...`, `golangci-lint run`, `go run ./tools/checkgofilesize`; confirm `tools/checkgofilesize/baseline.yaml` stays `files: []` and every new/modified Go file is at or under 500 effective lines (warn at 400).
