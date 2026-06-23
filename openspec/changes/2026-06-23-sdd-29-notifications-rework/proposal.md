# SDD-29 — Notifications Rework (Curated User Notifications for sync / anime / device)

Status: proposal
Change: `2026-06-23-sdd-29-notifications-rework`
Artifact store: hybrid (this file + engram `sdd/2026-06-23-sdd-29-notifications-rework/proposal`)

> **Scope update (post-design — code wins as truth).** The design phase read the
> actual code and found the two **sync** moments below (catalog #2 conflict
> detected, #3 reconcile failed) have **NO bridge-owned runtime call site**: the
> `conflicts` table is a read/resolve stub from SDD-16 with no writer, `Reconcile`
> is a pure function, and `TriggerReconcile` only publishes an event. They are
> therefore **DEFERRED, not faked** (see `design.md` §0 + ADR-29-6) — ready to
> wire the day a real conflict-writer / terminal-reconcile path exists. The
> implemented scope of SDD-29 is **2 real moments (device pairing success, anime
> watcher terminal failure) + 1 log-forward adapter**. This is a scope reduction,
> consistent with the project's "cut scope hard" norm. The catalog rows below are
> kept for the record; #2 and #3 are marked deferred.

## 1. Why / Intent

SDD-28 introduced the project's first SHARED user-notification capability:
`internal/notification` (`Notifier` port, `Notification` value, `Dispatcher`,
`UIToastAdapter` emitting the `notification.push` Wails event, Windows desktop
adapter). Today it has exactly ONE consumer: `internal/download`
(`service.go:517`, injected via `download.ServiceDeps.Notifier` at `app.go:456`).

**Runtime truth (drift recorded vs. exploration memory #4247).** Outside
download, NO feature produces a user toast. The other user-notable moments
surface only as:

- entries in the `observability.log` ring-buffer stream (`app.go:83`, emitted by
  `memLogger.OnWriteFn` for EVERY shared-logger write, `app.go:296-301`) — this
  is a DEBUG/LOG PANEL, not discrete toasts; or
- a single BARE Wails event `pairing.token-consumed` (`app.go:84`, fired at
  `app.go:413` with no payload) when a device consumes a QR pairing token.

So SDD-29 is **ADDITIVE, not a migration**: we inject the existing shared
`Notifier` into `sync`, `anime`, and `device` and emit a TIGHT, curated set of
notifications at moments where a human genuinely needs a discrete signal — and we
define the relationship between the `Notifier` and the `observability` log so we
do NOT turn every log line into a toast.

**Success looks like:**
1. Device pairing success is a real toast, not just a bare event the frontend has
   to interpret.
2. The few "something a human must notice" failure/conflict moments in anime and
   sync produce a toast instead of being buried in a 500-entry log ring.
3. The `Notifier` ↔ `observability` boundary is written down and enforced: the
   log panel stays the full stream; the Notifier stays curated; notifications are
   ALSO logged (one-way), but logs are NEVER auto-promoted to toasts.
4. No regression to download notifications or to the `notification.push` /
   `observability.log` / `pairing.token-consumed` frontend contracts.

## 2. Scope

### In scope
- Inject the shared `notification.Notifier` into the `device`, `sync`, and
  `anime` wiring via constructor deps, mirroring `download.ServiceDeps.Notifier`.
- Emit the curated notification catalog in §4 (and ONLY that catalog).
- Define and implement the `Notifier` ↔ `observability` policy (§5): an optional
  one-way `Notifier → observability log` adapter so notifications are also
  recorded in the log stream. No reverse path.
- Keep the existing `notification.push` event payload and the frontend toast
  pipeline unchanged (SDD-28 already ships `notification-source.ts`,
  `use-notification-toasts.ts`, `NotificationToasts.tsx`).
- Strict-TDD, real-boundary tests for every new Notify call site and the new
  log-forwarding adapter.

### Out of scope (explicit — scope is cut hard on purpose)
- **NOT** promoting log entries to toasts. The `observability.log` stream stays a
  log panel; no rule that "every warning/error log becomes a toast."
- **NOT** notify-everything. Routine successes (every reconcile tick, every
  catch-up item, normal anime add/update) stay log-only. See §4 "Rejected".
- **NOT** any new desktop/OS toast behavior beyond what SDD-28 already wired
  (`UIToastAdapter` + `desktop_windows`/`desktop_other` are reused as-is).
- **NOT** mobile / remote / WebSocket notification delivery. `internal/events`
  Bus stays backend↔backend; `realtimeHub` mobile broadcast is untouched. A
  backend event is not a user notification (per `notifier.go` package doc).
- **NOT** changing the `notification.push`, `observability.log`, or
  `pairing.token-consumed` event names/payload shapes (frontend contracts).
- **NOT** removing the bare `pairing.token-consumed` event — the frontend
  `bridge-runtime-source.ts` still subscribes to it; we ADD a toast alongside it
  (see §6 for the deprecation question, deferred).
- **NOT** new frontend features. The toast UI already exists; this change may
  require zero frontend code.

## 3. Approach (architecture-first, incremental per context)

Follow the download precedent exactly: each bounded context receives the
`Notifier` through its own constructor deps (an explicit port dependency, not a
global). The `Dispatcher` already guarantees per-adapter failure isolation and
never blocks/propagates to the caller, so call sites stay simple: build a
`Notification`, call `Notify(ctx, n)`, ignore non-critical errors.

Order, smallest blast radius first:
1. **device** — pairing success. Cleanest seam (single callback at `app.go:409`).
2. **sync** — conflict detected / reconcile failure (the moments sync actually
   owns at a single point; see §4 rationale).
3. **anime** — watcher terminal failure (the "watcher is now deaf" moment).
4. **observability policy** — the one-way `Notifier → log` forwarding adapter,
   landed last so every prior notification is automatically also logged.

`Source` field per context: `"device"`, `"sync"`, `"anime"` (matching the
existing `download` convention). `CorrelationID`: reuse the value already minted
at the call site when one exists (e.g. the anime watcher mints
`uuid.NewString()` per processing cycle at `watcher.go:226`); otherwise leave
empty. We do NOT invent a correlation scheme where none exists.

All work lands as ONE final commit (checksdd rejects `- [ ]`); the per-context
ordering above is an implementation sequence, not separate PRs.

## 4. Notification catalog (the tight, defensible set)

Each row: moment → Source / Level / why a human needs a TOAST (not just a log).

| # | Context | Moment (code anchor) | Source | Level | Why a toast (vs. log line) |
|---|---------|----------------------|--------|-------|----------------------------|
| 1 | device | Pairing token consumed — a new device successfully paired (`app.go:409` `OnPairingTokenConsumed`) | device | success | The user is physically watching for this during pairing; today it's a bare event with no human-readable surface. Highest-value, lowest-risk candidate. |
| 2 | sync | Sync conflict detected — a change could not be auto-reconciled and is parked in `ConflictStore` (`internal/sync/conflict_store.go`) | sync | warning | A conflict means data needs human attention/resolution; silently logging it risks the user never noticing diverging state. Discrete and rare. |
| 3 | sync | Reconcile failed — the reconcile flow returns a terminal error (sync trigger / changelog reconcile error path) | sync | error | Sync being broken is invisible otherwise (the panel shows last state, not failure). Rare, actionable. |
| 4 | anime | Watcher terminal failure — `animes.dat` watcher exhausts retries and stops (`watcher.go:167` `w.setErr(terminalErr)`) | anime | error | After this the bridge is DEAF to anime changes — a silent, severe degradation. Today only a warning log buried in the ring buffer. Fires at most once per watcher lifecycle. |

That is the complete in-scope set: **4 moments across 3 contexts.**

### Rejected / deferred (kept out to avoid notify-everything)
- **Sync completed (N changes)** — REJECTED as a toast for now. Reconcile is a
  STREAMING flow (`TriggerReconcile` only publishes `SyncRequestedEvent` at
  `service.go:45`; actual reconcile runs through the WS/realtime + changelog
  path), so there is no single clean "completed with N changes" moment the
  bridge owns. Routine completion is also high-frequency → toast noise. Stays
  log-only. Can be revisited if a discrete completion point is introduced.
- **Anime catch-up / import done, normal anime add/update** — log-only. Routine,
  potentially high-volume; not a moment a human must be interrupted for.
- **Token expiry / device removed** — deferred. Lower value than pairing success;
  add later if users ask. Avoids speculative breadth.
- **Watcher transient retry (`watcher.go:197-198`)** — log-only. It self-heals;
  toasting every transient blip would be noise. Only the TERMINAL failure (row 4)
  is user-notable.

## 5. Notifier ↔ observability policy

The `notifier.go` package doc already names `observability` as an SDD-29 target
and is explicit that "a backend event is not a user notification." We codify
SEPARATION with a single one-way bridge:

- **Log panel = full stream.** `observability.log` keeps emitting for every
  shared-logger write. Unchanged. It is the debug/forensic surface.
- **Notifier = curated discrete moments.** Only the §4 catalog. Unchanged port.
- **One-way `Notifier → observability` forwarding adapter (new).** Register a
  thin `notification.Adapter` whose `Deliver` writes the notification to the
  shared logger (mapping `Level` → log level, `Source` → domain). Result: every
  toast also appears in the log stream for forensics, with ZERO new wiring at
  call sites (it joins the existing `Dispatcher` fan-out alongside
  `UIToastAdapter` + desktop adapter).
- **NO reverse path.** Logs are NEVER auto-promoted to toasts. There is no rule
  "warning/error log ⇒ notification." This is the explicit guard against the
  double-fire / noise failure mode.

This keeps the two surfaces orthogonal: logs are exhaustive and passive; toasts
are curated and interruptive; the forwarding adapter is a convenience, not a
coupling.

## 6. Affected modules / packages

| Area | File(s) | Change |
|------|---------|--------|
| device wiring | `app.go` (~`409-414` `OnPairingTokenConsumed`) | Call `a.notifier.Notify(...)` on pairing success alongside the existing bare event emit. |
| sync | `internal/sync/service.go`, `internal/sync/conflict_store.go` (and/or the reconcile error path) | Add a `Notifier` to the relevant constructor deps; Notify on conflict detected (warning) and reconcile failure (error). |
| sync wiring | `app.go` (~`396-398` conflict/trigger construction) | Pass `a.notifier` into the sync service deps. |
| anime | `internal/anime/watcher.go` (~`73` `NewRuntimeWatcher`, `RuntimeWatcherConfig`, `167` terminal-error path) | Add `Notifier` to `RuntimeWatcherConfig`; Notify(error) on terminal watcher failure. |
| anime wiring | `app.go` (~`128`/`203` `newRuntimeWatcher` factory) | Thread `a.notifier` into the runtime-watcher config. |
| observability adapter | `internal/notification/` (new file, e.g. `log_forward.go`) + `app.go` (~`99` `defaultNotifier`, `375` `newNotifier`) | New one-way `Notifier → shared logger` adapter, registered in the `Dispatcher` fan-out. |
| tests (strict TDD, real-boundary) | colocated `_test.go` in `internal/sync`, `internal/anime`, `internal/notification`, plus `app_test.go` for wiring | Assert each Notify call site fires the right `Notification{Source, Level}`; assert the log-forward adapter writes; assert no toast fires for rejected moments. |
| frontend | none expected | Toast pipeline already consumes `notification.push`; no contract change. Verify only. |

## 7. Risks

- **Over-build / scope creep** — the user historically cuts scope hard (dropped
  `download_site_config`, rejected NroCapVisto write-back). Mitigation: the
  catalog is deliberately 4 moments; everything else is explicitly rejected in
  §4. Spec/design MUST NOT silently expand it.
- **Sync completion ambiguity** — there is no single clean completion point;
  forcing a "sync done" toast would be either inaccurate or noisy. Mitigation:
  out of scope until a discrete point exists. Open question carried into design:
  confirm the exact reconcile-failure terminal path to hook (trigger vs. WS
  reconcile handler).
- **Double surface for pairing** — toast (new) + bare `pairing.token-consumed`
  event (existing, still consumed by `bridge-runtime-source.ts`). Mitigation:
  keep BOTH; the frontend may de-dupe later. Deprecating the bare event is
  explicitly out of scope here.
- **Log-forward noise / recursion** — the forwarding adapter writes to the shared
  logger, which feeds `observability.log`. Mitigation: it only fires for the 4
  curated notifications (not for log writes), so there is no log→notify→log loop;
  verify no accidental feedback in tests.
- **CorrelationID inconsistency across contexts** — only anime has a natural id.
  Mitigation: reuse where present, leave empty otherwise; do not invent schemes.

## 8. Rollback plan

Fully additive and removable per context — nothing existing is replaced:
- **device**: remove the single `Notify` call in `app.go`; the bare
  `pairing.token-consumed` event keeps working untouched.
- **sync**: drop the `Notifier` from sync deps and the two Notify calls;
  conflicts/failures revert to log-only.
- **anime**: remove `Notifier` from `RuntimeWatcherConfig` and the terminal-path
  Notify; the existing warning log at the error path is unchanged.
- **observability adapter**: unregister the forwarding adapter from the
  `Dispatcher`; toasts simply stop being mirrored to the log.
- **frontend**: nothing to roll back (no changes).
- **download**: untouched throughout — zero regression surface.

Because no existing user surface is removed or rewired, reverting any single
context cannot break the others or the SDD-28 download path.
