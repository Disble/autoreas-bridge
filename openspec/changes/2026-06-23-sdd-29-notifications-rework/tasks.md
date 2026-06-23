# Tasks: SDD-29 — Notifications Rework (2 moments + 1 adapter)

Change: `2026-06-23-sdd-29-notifications-rework`
Inputs: `proposal.md`, `design.md`, `specs/*`
Scope (design ADR-29-6): device pairing success + anime watcher terminal failure
+ one-way log-forward adapter. The 2 sync moments are DEFERRED (no runtime seam).

Strict TDD is active: every implementation task is preceded by a failing (RED)
test, then minimal (GREEN), then refactor. No call site ships without a test.
Test runner: `go test ./...`.

## Phase 1 — Log-forward adapter (`internal/notification`)

- [x] 1.1 RED: add `internal/notification/log_forward_test.go` — assert `Deliver`
  maps each `Level` (error→error, warning→warn, success→info, info→info) to the
  correct fake-logger method, carries `Source`→domain, `Title`/`Body`→message,
  and `CorrelationID`→log fields.
- [x] 1.2 RED: add nil-logger case — `Deliver` is a safe no-op (no panic, no write).
- [x] 1.3 GREEN: implement `logForwardAdapter` + `NewLogForwardAdapter(logger)` in
  `internal/notification/log_forward.go` implementing `Adapter`, using `Logf`
  (domain, level, fields incl. CorrelationID + EventType="notification").
- [x] 1.4 RED: add a no-feedback-loop test — a `Dispatcher` wired with the real
  `logForwardAdapter` over a fake logger; calling `Notify` once writes the logger
  exactly once and does NOT re-enter `Notify` (acyclicity guard).
- [x] 1.5 GREEN/REFACTOR: confirm acyclic by construction; tidy adapter + tests.

## Phase 2 — Device pairing success (`app.go` callback)

- [x] 2.1 RED: in `app_test.go`, drive `OnPairingTokenConsumed` with a fake
  `a.notifier`; assert the bare `pairing.token-consumed` event still emits AND
  exactly one `Notification{Source:"device", Level:success, CorrelationID:""}` is
  delivered.
- [x] 2.2 RED: add a fake Notifier whose `Notify` errors — assert the callback
  returns normally and the bare event is still emitted; add a nil-notifier case
  (no panic, bare event still emitted).
- [x] 2.3 GREEN: add `a.notifier.Notify(a.ctx, notification.Notification{...})`
  inside the existing `OnPairingTokenConsumed` closure (`app.go:409`), beside the
  kept `a.emitFn(a.ctx, pairingTokenConsumedEventName)`; guard nil notifier.
- [x] 2.4 REFACTOR: extract a small helper if the closure grows; keep app.go tidy.

## Phase 3 — Anime watcher terminal failure (`internal/anime/watcher.go`)

- [x] 3.1 RED: in `watcher_test.go`, construct the watcher with a fake Notifier,
  drive it to terminal failure (retries exhausted), assert exactly ONE
  `Notification{Source:"anime", Level:error, CorrelationID:""}` is delivered and
  `w.Err()` returns the terminal error.
- [x] 3.2 RED: add (a) transient/self-healing path → zero notifications,
  (b) nil Notifier → terminal error still set, no panic, zero notifications,
  (c) Notify returns error → `w.Err()` unchanged.
- [x] 3.3 GREEN: add `Notifier notification.Notifier` to `RuntimeWatcherConfig`,
  carry onto the `runtimeWatcher` struct + constructor, add a nil-guarded
  `w.notify(ctx, terminalErr)` immediately after `w.setErr(terminalErr)`
  (`watcher.go:167`) — the ONLY terminal seam.
- [x] 3.4 REFACTOR: keep `w.notify` small and the import edge clean (no cycle).

  **Apply-time clarification (not a scope expansion):** `watcher.go` actually
  has two `setErr` call sites inside `run()`: (a) after `serveLoop`'s
  returned `terminalErr` (the seam design pinned, driven here by a
  `processCurrentFile`/parser error surfacing through the `timer.C()` case),
  and (b) inside `retryOrSetErr` when `watcherFactory`/`backend.Add` keep
  failing and `waitRetry` is starved by ctx cancellation. The design's prose
  ("the unique place w.err is set-and-return") describes seam (a) literally;
  `w.notify` is wired ONLY there, per the design's explicit anchor and the
  spec's literal `watcher.go:167` citation. Seam (b) intentionally does NOT
  notify — out of the fixed scope for this change. Tests were written
  against seam (a) (forcing a parser error + firing the debounce timer)
  rather than a factory-error path, since the factory-error path resolves
  through seam (b), not the pinned seam.

## Phase 4 — Composition wiring (`app.go`)

- [x] 4.1 RED: in `app_test.go`, assert `defaultNotifier(emit, logger)` includes
  the log-forward adapter when a non-nil logger is supplied, and does NOT when the
  logger is nil.
- [x] 4.2 GREEN: update `defaultNotifier` (`app.go:99`) to append
  `notification.NewLogForwardAdapter(loggers[0])` when `len(loggers)>0 && loggers[0]!=nil`.
- [x] 4.3 RED: assert the watcher factory (`newRuntimeWatcher` build in `startup`)
  threads `a.notifier` into `RuntimeWatcherConfig.Notifier`.
- [x] 4.4 GREEN: add `Notifier: a.notifier` to the `RuntimeWatcherConfig` built in
  `startup` (around `app.go:350`).
- [x] 4.5 Verify wiring order: **DRIFT FOUND (code wins as truth).** Design assumed
  `a.notifier` (claimed at `app.go:375`) was already set BEFORE the watcher factory
  call. Reading the actual `startup()` body at apply time showed the opposite: the
  watcher build (`newRuntimeWatcher`, ~line 356) ran BEFORE `a.notifier = a.newNotifier(...)`
  (~line 382) — `a.notifier` would have been nil when captured into
  `RuntimeWatcherConfig.Notifier`. Fixed by moving `a.notifier = a.newNotifier(a.emitFn, a.sharedLogger)`
  earlier in `startup`, immediately after `catchUpContext`/`catchUpCancel` setup and
  BEFORE the watcher factory call — `a.emitFn`/`a.sharedLogger` are both already
  defaulted by that point (lines ~296-311), so the move is safe. Verified via
  `TestAppStartupThreadsNotifierIntoRuntimeWatcherConfig` (RED before the fix,
  GREEN after) and the full app test suite (no regressions).

## Phase 5 — Integration & verification

- [x] 5.1 `go build ./...` and `go vet ./...` clean; confirm no import cycle
  introduced by `internal/anime → internal/notification`.
  Confirmed via `go list -f '{{.ImportPath}} -> {{join .Imports ", "}}' ./internal/notification/...`:
  `notification` imports only `internal/logger` + the toast libs — zero `anime`
  dependency, so the new `anime → notification` edge is one-directional.
- [x] 5.2 `go test ./...` all pass; new code (`log_forward.go`, watcher notify,
  pairing notify) covered; `go test ./... -cover` recorded.
  Coverage: `internal/notification` 77.1%, `internal/anime` 82.2% (up from
  baseline), root `autoreas-bridge` (app.go) 57.7%. Full `go test ./...` green
  across every package.
- [x] 5.3 `gofmt`/`go run ./tools/checkgofmt` clean; `golangci-lint run` clean.
  One `gosimple` finding (S1021 in `log_forward_test.go`, merge var decl with
  assignment) found and fixed during apply; re-run is clean.
- [x] 5.4 Confirm the frontend is UNTOUCHED (the `notification.push` toast pipeline
  already exists from SDD-28); `bun --cwd="frontend" run test` still green.
  `git status --porcelain frontend/` empty (zero diff); `bun --cwd="frontend" run test`:
  45 test files / 330 tests passed.
- [x] 5.5 Confirm the 2 sync moments remain documented as deferred-by-missing-upstream
  (proposal scope note + design ADR-29-6) — no abandoned/orphaned scope.
  No sync code touched (`internal/sync` untouched in this apply); design.md §0/§2.3/
  ADR-29-6 already documents the deferral explicitly — nothing further needed at
  apply time.
- [x] 5.6 Write `verify-report.md` with a PASS / PASS WITH WARNINGS verdict
  (orchestrator-run final verification). Verdict: PASS WITH WARNINGS.
