# Tasks: Observability Dashboard and Shared Logging

## Phase 1: Foundation

- [x] 1.1 RED — add `internal/logger/mem_test.go` for ring retention/order and `internal/logger/stdout_test.go` for `domain: message` formatting.
- [x] 1.2 GREEN — create `internal/logger/logger.go`, `internal/logger/mem.go`, and `internal/logger/stdout.go` with `LogEntry`, shared logger contract, ring buffer, and stdout formatter.
- [x] 1.3 REFACTOR — add a fanout/composite helper in `internal/logger/` so stdout + memory stay wired through one backend dependency.

## Phase 2: Backend domain instrumentation

- [x] 2.1 RED — extend `internal/anime/startup_catchup_test.go`, `internal/anime/writer_test.go`, and `internal/anime/watcher_test.go` with recording logger expectations for startup, warnings, and publish paths.
- [x] 2.2 GREEN — modify `internal/anime/logger.go`, `internal/anime/startup_catchup.go`, `internal/anime/writer.go`, and `internal/anime/watcher.go` to use the shared logger.
- [x] 2.3 REFACTOR — keep anime-specific adapters thin so existing config structs and test fakes stay stable.
- [x] 2.4 RED — add logging assertions in `internal/sync/service_test.go`, `internal/sync/changelog_recorder_test.go`, `internal/realtime/hub_test.go`, and API/websocket tests for reconcile, changelog, register, and forward events.
- [x] 2.5 GREEN — instrument `internal/sync/service.go`, `internal/sync/changelog_recorder.go`, `internal/realtime/hub.go`, `internal/api/server.go`, and `internal/api/handlers/websocket_handler.go` with domain-prefixed logs.
- [x] 2.6 REFACTOR — adapt `internal/tracerbullet/runner.go` to the shared logger without changing its visible trace semantics.

## Phase 3: Wails observability bridge

- [x] 3.1 RED — extend `app_test.go` with failing tests for shared logger wiring, `GetRecentLogs()`, and Wails event emission on new entries.
- [x] 3.2 GREEN — update `app.go` to build stdout + mem loggers, expose `GetRecentLogs() []logger.LogEntry`, and emit `observability.log` events via injected `wruntime.EventsEmit` wrapper.
- [x] 3.3 REFACTOR — centralize event-name constants and startup-safe nil/context guards for observability bindings.

## Phase 4: Frontend dashboard

- [x] 4.1 RED — add frontend tests for log panel bootstrap from `GetRecentLogs` and live append via `frontend/wailsjs/runtime.EventsOn`.
- [x] 4.2 GREEN — create `frontend/src/components/ObservabilityPanel.tsx` using **HeroUI v3** (`Card`, `CardBody`, `CardHeader`, `ScrollShadow`, `Chip`, `Divider` from `@heroui/react`) and update `frontend/src/App.tsx` to render recent entries with timestamps/domain/message.
- [x] 4.3 REFACTOR — trim duplicate UI formatting logic and cap rendered entries to match backend retention expectations.

## Phase 5: Verification

- [x] 5.1 Verify Go tests cover spec scenarios for ring retention, domain logging, Wails binding bootstrap, and live event push.
- [x] 5.2 Verify frontend tests cover initial history render and in-session log updates without manual refresh.
- [x] 5.3 Update `openspec/changes/sdd-17-observability/verify-report.md` during apply/verify, not in planning, after RED→GREEN→REFACTOR tasks pass.
