# Archive Report: SDD-29 Notifications Rework

**Change**: `2026-06-23-sdd-29-notifications-rework`
**Archived on**: 2026-06-23
**Commit**: `bc2f638 feat(notification): add curated user notifications for device and anime (SDD-29)`
**Final Verdict**: PASS WITH WARNINGS

## Summary

Extended the SDD-28 shared notification hexagon (`internal/notification`) with the
first non-download consumers, surfacing a tight, curated set of user-notable
moments as toasts through the existing `Notifier` port + `notification.push`
frontend pipeline — additive work, not a migration. SDD-29 wires the two moments
that have a REAL bridge-owned runtime seam, plus a one-way observability adapter:

1. **device — pairing success** (`success`): emitted in the existing
   `OnPairingTokenConsumed` callback (`app.go`), beside the KEPT bare
   `pairing.token-consumed` event. No `device`-package injection (ADR-29-1/5).
2. **anime — watcher terminal failure** (`error`): emitted once at the unique
   terminal exit `serveLoop`→`w.setErr(terminalErr)` in `run()`, via a `Notifier`
   injected through `RuntimeWatcherConfig` (ADR-29-2/4).
3. **observability — one-way log-forward adapter** (`internal/notification/log_forward.go`):
   mirrors every Notification into the `observability.log` stream, registered in
   `defaultNotifier` when a non-nil logger is present; strictly one-directional, no
   log→notify loop (ADR-29-3).

The two **sync** moments from the original proposal (conflict-detected,
reconcile-failed) were DEFERRED, not faked: no bridge-owned runtime call site
exists today (the `conflicts` table is a read/resolve stub from SDD-16 with no
writer; `Reconcile` is a pure function; `TriggerReconcile` only publishes an
event). Ready to wire the day a real conflict-writer / terminal-reconcile path
exists. See `design.md` §0 + ADR-29-6. This is a scope reduction, consistent with
the project's "cut scope hard" norm.

## Reframing recorded (code wins as truth)

The change was originally framed (engram #4247) as "migrate sync/anime/device/
observability onto the shared Notifier." The exploration + design proved that
OUTSIDE download, no feature produced user toasts to migrate — they only emitted
to the observability LOG stream or bare events. SDD-29 is therefore mostly
ADDITIVE (new curated notifications) + a one-way log bridge, not a migration.

## Specs Synced (source of truth)

| Capability | Synced to |
|---|---|
| device-notifications | `openspec/specs/notifications/device.md` |
| anime-notifications | `openspec/specs/notifications/anime.md` |
| notification-observability-forwarding | `openspec/specs/notifications/observability-forwarding.md` |

(Alongside SDD-28's `openspec/specs/notifications/notifications.md`.)

## Archive Contents

| Artifact | Status |
|---|---|
| proposal.md | ✅ (with post-design scope-reduction note) |
| design.md | ✅ (6 ADRs + sequence diagrams) |
| specs/ | ✅ (3 delta specs, all synced) |
| tasks.md | ✅ (Phases 1–5, all `[x]`) |
| verify-report.md | ✅ PASS WITH WARNINGS |
| archive-report.md | ✅ |

## Verification & Quality

- `go build`/`go vet`/`go test ./...` clean; coverage `internal/notification` 77.1%,
  `internal/anime` 82.2%.
- `checkgofmt` pass; `golangci-lint run` exit 0.
- Frontend UNTOUCHED (the `notification.push` toast pipeline already existed from
  SDD-28); full lefthook pre-commit gate (incl. `bun` lint/typecheck/test) passed
  at commit.

## Findings fixed during apply / final verification

- **Latent ordering bug:** `a.notifier` was constructed AFTER the watcher factory
  build in `startup()`, so the watcher would have captured a nil Notifier and never
  fired. Moved notifier construction earlier (fixed + wiring test).
- **Missing `Timestamp`:** device + anime notifications sent a zero-value timestamp,
  inconsistent with the `download` producer and the frontend contract; added
  `Timestamp: time.Now()` to both (RED→GREEN).

## Known limitations / follow-ups

- **sync conflict-detected + reconcile-failed**: deferred-by-missing-upstream
  (ADR-29-6) — wire when a real conflict-writer / terminal-reconcile path lands.
- **Watcher terminal seam (b)** (`retryOrSetErr`): intentionally not wired — it
  fires only on `ctx.Done()` (shutdown), so a toast there would be a false alarm.
- **Pairing double-surface**: the bare `pairing.token-consumed` event and the new
  toast both fire; de-dup deferred (ADR-29-5).

## SDD Cycle Complete

Planned (proposal), specified (3 capabilities), designed (6 ADRs + diagrams),
tasked (5 phases), implemented (strict TDD), verified (PASS WITH WARNINGS,
orchestrator-run), and archived.
