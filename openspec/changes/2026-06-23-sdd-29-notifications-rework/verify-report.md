# Verify Report: SDD-29 Notifications Rework

- Change: `2026-06-23-sdd-29-notifications-rework`
- Verified by: orchestrating agent (final verification, not delegated — per AGENTS.md rule 3)
- Date: 2026-06-23

## Scope verified

Curated user notifications surfaced through the shared SDD-28 `notification.Notifier`,
implemented at the real runtime seams that exist in the code:

1. **device — pairing success** (`success`): emitted inside the existing
   `OnPairingTokenConsumed` callback (`app.go`), beside the KEPT bare
   `pairing.token-consumed` event. No `device`-package injection (ADR-29-1, ADR-29-5).
2. **anime — watcher terminal failure** (`error`): emitted once at the unique
   terminal exit `serveLoop`→`w.setErr(terminalErr)` in `run()`
   (`internal/anime/watcher.go:176`), via a `Notifier` injected through
   `RuntimeWatcherConfig` (ADR-29-2).
3. **observability — one-way log-forward adapter**: a new `logForwardAdapter`
   (`internal/notification/log_forward.go`) registered in `defaultNotifier`
   (`app.go`) when a non-nil shared logger is present; mirrors every Notification
   into the `observability.log` stream, strictly one-directional (ADR-29-3).

The two **sync** moments (conflict-detected, reconcile-failed) are DEFERRED, not
implemented — they have no bridge-owned runtime call site today (the `conflicts`
table is a read/resolve stub from SDD-16 with no writer; `Reconcile` is pure;
`TriggerReconcile` only publishes an event). See `design.md` §0 + ADR-29-6.

All implementation tasks (Phases 1–5, 1.1–5.5) are complete and `[x]` in
`tasks.md`; 5.6 (this report) is the orchestrator's final-verification task.

## Gate results (run by the orchestrator)

### Go
- `go build ./...` — clean
- `go vet ./...` — clean
- `go test ./...` — all packages pass
- `go test ./... -cover` — `internal/notification` 77.1%, `internal/anime` 82.2%
- `go run ./tools/checkgofmt` — passed
- `golangci-lint run` — clean, exit 0

### Frontend
- UNTOUCHED — the `notification.push` toast pipeline (`infrastructure/notification-source.ts`,
  `hooks/use-notification-toasts.ts`, `app/NotificationToasts.tsx`) already exists from
  SDD-28 and required no change. `git status` shows zero `frontend/` diff. The full
  pre-commit lefthook gate re-runs `bun` lint/typecheck/test at commit time.

## Requirement coverage (by capability)

- **device-notifications** — pairing-success notification + kept bare event; nil
  notifier no-op; Notify error does not break the callback. Verified by `app_test.go`.
- **anime-notifications** — exactly-one error notification at the terminal seam;
  transient/self-healing path emits zero; nil notifier no-op; Notify error does not
  change `w.Err()`; no import cycle (`anime → notification` is one-directional).
  Verified by `watcher_test.go`.
- **notification-observability-forwarding** — level mapping (error/warn/info,
  success→info), Source→domain, CorrelationID carried via `Logf`; nil logger no-op;
  registered only with a non-nil logger; acyclic (no log→notify loop). Verified by
  `log_forward_test.go` + `app_test.go` wiring tests; observed live in test output
  (`[device] Device paired: … eventType=notification`).

## Verification findings (fixed during final verification)

- **Latent ordering bug (fixed in apply):** `a.notifier` was constructed AFTER the
  watcher factory build in `startup()`, so the watcher would have captured a `nil`
  Notifier and NEVER fired. Moved the notifier construction earlier (before the
  watcher build); confirmed by a wiring test (RED→GREEN).
- **Missing `Timestamp` (fixed in final verification):** the device + anime
  notifications did not set `Notification.Timestamp`, sending a zero-value
  (`0001-01-01`) over the wire — inconsistent with the `download` producer (which
  sets `Timestamp: Clock()`) and the frontend `notification.types.ts` contract.
  Added `Timestamp: time.Now()` to both producers with non-zero assertions
  (RED→GREEN). Not user-visible today (the toast does not render the timestamp),
  but corrects the contract data.

## Warnings (PASS WITH WARNINGS rationale)

- **2 sync moments deferred-by-missing-upstream** (ADR-29-6): documented, ready to
  wire when a real conflict-writer / terminal-reconcile path exists. Not abandoned
  scope — explicitly recorded in proposal scope note + design §0.
- **Watcher terminal seam (b) intentionally not wired:** `run()` has a second
  `setErr` site inside `retryOrSetErr`, but it fires ONLY when `waitRetry` returns
  false, which happens ONLY on `ctx.Done()` (shutdown) — NOT a genuine failure.
  Wiring a notification there would raise a FALSE "watcher stopped" error on normal
  shutdown. Correctly left unwired (confirmed by reading `retryOrSetErr`/`waitRetry`).
- **IDE `interface{}`→`any` modernize hints** in `app.go`/`app_test.go`: NOT
  golangci-lint findings (the project linter exits 0); they match the pre-existing
  codebase style. Non-blocking, not introduced as new debt by this change.

## Notes

- Strictly additive: nothing existing is replaced. Per-context rollback is trivial
  (delete the single Notify call / the `Notifier` field / the adapter-append line).
  The SDD-28 download path and the frontend are untouched — zero regression surface.

### Verdict

PASS WITH WARNINGS
