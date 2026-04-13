# Tasks: SDD-20 Observability V2

## Phase 1: Logger foundation

- [x] 1.1 RED — extend `internal/logger/mem_test.go` and `internal/logger/stdout_test.go` for `debug`, `Logf`, JSON `omitempty`, stdout metadata suffixes, and default/configurable capacity `500`.
- [x] 1.2 GREEN — modify `internal/logger/logger.go` so `LogEntry` adds `CorrelationID`, `EntityID`, `EventType`, `DurationMs`, `Metadata`; add `Fields`, `LevelDebug`, `Debugf`, and `Logf(...)`.
- [x] 1.3 GREEN — update `internal/logger/mem.go`, `internal/logger/stdout.go`, and `internal/logger/fanout.go` so every sink routes through `Logf`, keeps zero-value fields omitted, and raises the default ring size to `500`.
- [x] 1.4 REFACTOR — centralize shared entry creation/formatting helpers in `internal/logger/` so structured output stays consistent across sinks.

## Phase 2: Bus, HTTP, and app wiring

- [x] 2.1 RED — extend `internal/events/bus_test.go`, `internal/api/server_test.go`, and `app_test.go` for instrumented publish logs, slow-handler warnings (`>500ms`), request level mapping, and richer `GetRecentLogs()` entries.
- [x] 2.2 GREEN — modify `internal/events/event.go` to add optional `CorrelationID` carriers and `internal/events/bus.go` to add an `InstrumentedBus` decorator that logs `bus.publish` and handler latency without changing `MemoryBus` semantics.
- [x] 2.3 GREEN — update `internal/api/server.go` (and `internal/api/router.go` only if needed) to wrap `NewHandler(config)` with request logging middleware that records method, path, status, duration, and correlation ID.
- [x] 2.4 REFACTOR — update `app.go` to construct the instrumented bus, use mem capacity `500`, and preserve Wails/recent-log compatibility with additive structured fields.

## Phase 3: Domain instrumentation and propagation

- [x] 3.1 RED — extend `internal/anime/startup_catchup_test.go`, `internal/anime/watcher_test.go`, and `internal/anime/writer_test.go` with expectations for `EntityID`, `EventType`, `DurationMs`, and watcher correlation reuse.
- [x] 3.2 GREEN — modify `internal/anime/startup_catchup.go`, `internal/anime/watcher.go`, `internal/anime/writer.go`, and `internal/anime/logger.go` to emit structured logs and propagate correlation IDs on watcher-driven flows.
- [x] 3.3 RED — extend `internal/sync/service_test.go`, `internal/sync/changelog_recorder_test.go`, `internal/realtime/hub_test.go`, and `internal/api/websocket_test.go` for reconcile timing, changelog metadata, client counts, and shared correlation IDs.
- [x] 3.4 GREEN — modify `internal/sync/service.go`, `internal/sync/changelog_recorder.go`, `internal/realtime/hub.go`, and `internal/api/handlers/websocket_handler.go` to log reconcile, changelog, broadcast, and connection lifecycle data with structured fields.
- [x] 3.5 REFACTOR — normalize event-type names and metadata keys across `internal/anime/`, `internal/sync/`, `internal/realtime/`, and `internal/api/` so filters remain predictable.

## Phase 4: Verification

- [x] 4.1 Verify `app_test.go` and logger serialization paths prove Wails consumers still receive additive JSON with `omitempty` behavior.
- [x] 4.2 Run focused `go test` coverage for `./internal/logger ./internal/events ./internal/api ./internal/anime ./internal/sync ./internal/realtime ./...` and map results back to every observability spec scenario.
- [x] 4.3 Record final evidence in `openspec/changes/2026-04-13-sdd-20-observability-v2/verify-report.md` during apply/verify after all RED→GREEN→REFACTOR tasks pass.
