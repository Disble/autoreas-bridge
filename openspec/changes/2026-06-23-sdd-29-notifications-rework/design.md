# SDD-29 — Design: Notifications Rework (Curated User Notifications)

Status: design
Change: `2026-06-23-sdd-29-notifications-rework`
Artifact store: hybrid (this file + engram `sdd/2026-06-23-sdd-29-notifications-rework/design`)
Inputs: proposal (engram #4288 / `proposal.md`), exploration (engram #4287)

> Design = the HOW at the architectural level. No task breakdown, no code here.

---

## 0. Runtime-truth drift discovered during design (code wins)

The proposal's §4 catalog assumed FOUR notify call sites. Reading the actual
code (the design phase's job: pin the seams) shows that **two of the four sync
moments have NO bridge-owned runtime call site today**. Recorded explicitly per
the "code wins as truth" rule:

| Proposal moment | Claimed anchor | Runtime truth |
|---|---|---|
| #1 device pairing success | `app.go:409` `OnPairingTokenConsumed` | ✅ Real seam. Callback exists, fires on pairing. |
| #2 sync conflict detected | `internal/sync/conflict_store.go` | ❌ **No write path.** `ConflictStore` only `ListConflicts` (read) + `ResolveConflict` (resolve). The `conflicts` table is schema-only (`sqlite_bootstrap.go:38`); SDD-16 created it as "an empty-but-real persistence boundary … before automatic conflict generation is implemented." `Reconcile()` (`reconcile.go:39`) is a PURE function — no I/O, no conflict insert, no error return. There is no code anywhere that INSERTs a conflict. Nothing to hook. |
| #3 sync reconcile failed | "trigger / WS reconcile error path" | ❌ **No bridge-owned terminal reconcile.** `TriggerReconcile()` (`service.go:37`) only logs + `bus.Publish(SyncRequestedEvent)` and returns nil. The actual reconcile is driven mobile-side via the REST/WS contract; the bridge serves changelog data. The only "error" is the request-scoped HTTP 500 in `sync_handler.go:54-57` (a per-request response, not a background bridge failure a user must be toasted about). |
| #4 anime watcher terminal failure | `watcher.go:167` `w.setErr(terminalErr)` | ✅ Real seam. Single terminal exit inside `run()`. |

**Design decision (ADR-29-6):** the two phantom sync seams are **deferred, not
faked**. We do NOT invent a conflict-detection writer or a synthetic reconcile
"failure" just to have somewhere to call `Notify`. That would be building the
feature the toast is supposed to observe — out of scope and dishonest. The
in-scope catalog therefore lands at **2 real moments across 2 contexts +
1 adapter**, with the 2 sync moments documented as ready-to-wire the day a real
sync conflict-writer / terminal-reconcile path exists.

This is a SCOPE REDUCTION, not an expansion — fully consistent with the
project's "cut scope hard" norm. The orchestrator/verify should treat the sync
toasts as **blocked-by-missing-upstream**, not skipped work.

### Revised in-scope catalog

| # | Context | Moment (pinned seam) | Source | Level | CorrelationID |
|---|---------|----------------------|--------|-------|---------------|
| 1 | device | Pairing token consumed (`app.go:409` `OnPairingTokenConsumed`) | `device` | `success` | empty |
| 2 | anime | Watcher terminal failure (`watcher.go:167` `w.setErr(terminalErr)`) | `anime` | `error` | empty (see ADR-29-4) |
| — | (adapter) | One-way `Notifier → shared logger` forwarding adapter | n/a | n/a | passthrough |

Deferred (no runtime seam): sync conflict-detected, sync reconcile-failed.

---

## 1. Architecture overview

We extend the SDD-28 notification hexagon. The port (`notification.Notifier`)
and the `Dispatcher` fan-out already exist and are unchanged. SDD-29 adds:

- **New producers** of `Notification`s at two domain seams (device, anime).
- **One new adapter** (`logForwardAdapter`) on the consuming side of the
  Dispatcher fan-out, sitting beside `UIToastAdapter` and `DesktopToastAdapter`.

```
                         (producers — SDD-29 new)
   app.go pairing cb ──┐
   anime watcher ──────┤
   download service ───┤ (existing)
                       ▼
              notification.Notifier  (port — unchanged)
                       │
                 Dispatcher.Notify   (fan-out, failure-isolated — unchanged)
          ┌────────────┼───────────────────────────┐
          ▼            ▼                             ▼
    UIToastAdapter  DesktopToastAdapter      logForwardAdapter  ◄── SDD-29 new
   (notification.push) (Windows OS toast)    (writes to sharedLogger
                                              → observability.log)
```

Layering / boundaries preserved:
- The `notification` package stays domain-agnostic (the port MUST NOT reference
  device/anime/sync). New adapter lives inside `internal/notification`.
- Each producing context depends on the `Notifier` **port**, never on a concrete
  Dispatcher or adapter.
- Failure isolation is structural: `Dispatcher.Notify` (`dispatcher.go:34`)
  already `errors.Join`s per-adapter failures and never propagates them as a
  feature failure. Producers ignore the returned error.

---

## 2. Per-context injection seams (the core design choices)

### 2.1 device — pairing success → emit at the existing app.go callback (NO device-package injection)

**Chosen seam:** `app.go:409-414`, the `OnPairingTokenConsumed` closure already
passed into `api.Config`. We ADD a `a.notifier.Notify(...)` call inside that
existing closure, right beside the existing `a.emitFn(a.ctx, pairingTokenConsumedEventName)`.

```
app.go:375  a.notifier = a.newNotifier(a.emitFn, a.sharedLogger)   // already set BEFORE httpServer (line 399)
app.go:409  OnPairingTokenConsumed: func() {
app.go:413      a.emitFn(a.ctx, pairingTokenConsumedEventName)     // KEEP — bare event, unchanged
                a.notifier.Notify(a.ctx, notification.Notification{...})  // ADD
            }
```

**Why this seam (ADR-29-1):** the pairing-consumed signal is ALREADY a
composition-root concern — the callback is constructed in `app.go`, not owned by
the `device` package (the device service exposes auth, not a pairing-event hook).
Injecting a `Notifier` into `device.NewService` would force the device domain to
learn about user notifications for a moment it doesn't even emit. The LEAST
invasive seam is the existing app.go closure, where `a.notifier` is already in
scope (set at line 375, before httpServer wiring at 399). Zero new constructor
surface, mirrors how `a.emitFn` is already used at the same site.

**Double-surface (ADR-29-5):** we KEEP the bare `pairing.token-consumed` emit
(line 413) untouched — `bridge-runtime-source.ts` still subscribes to it. The
toast is purely additive alongside it. No frontend change, no event contract
change. De-duping the two is explicitly deferred (proposal §6).

### 2.2 anime — watcher terminal failure → inject Notifier into RuntimeWatcherConfig

**Chosen seam:** add a `Notifier notification.Notifier` field to
`RuntimeWatcherConfig` (`watcher.go:35-48`), carry it onto the `runtimeWatcher`
struct (`watcher.go:50-71`) and constructor (`watcher.go:73-89`), and call it at
the single terminal exit:

```
watcher.go:35   type RuntimeWatcherConfig struct { ...; Notifier notification.Notifier }   // ADD field
watcher.go:73   NewRuntimeWatcher(...) { watcher := &runtimeWatcher{ ...; notifier: config.Notifier } }  // carry
watcher.go:166  if terminalErr != nil {
watcher.go:167      w.setErr(terminalErr)
                    w.notify(ctx, terminalErr)   // ADD — fire exactly here, the ONLY terminal path
                    return
                }
```

**Why this seam (ADR-29-2):** the watcher OWNS the terminal-failure moment
(`run()` is its lifecycle loop). Mirroring `download.ServiceDeps.Notifier`,
the dependency arrives via the existing config struct (the established
ports/adapters precedent for this codebase). The terminal path at line 167 is
the UNIQUE place `w.err` is set-and-return inside `run()` — every retryable
failure routes through `retryOrSetErr`/`waitRetry` and only lands at 167 once
retries are exhausted, so a notify there fires **at most once per watcher
lifecycle** (proposal row #4 guarantee). The transient warning at
`serveLoop` (`watcher.go:197`) is deliberately NOT touched — it self-heals.

Threaded through the factory at `app.go:128-130` (`newRuntimeWatcher`) which
already builds the `RuntimeWatcherConfig`; we add `Notifier: a.notifier`. Because
`a.notifier` is set at app.go:375 and the watcher config is built in `startup`
after that point, ordering holds (verify during apply).

**Failure isolation:** `w.notify` builds the `Notification` and calls
`Notify`, discarding the error (the Dispatcher already isolates). A nil Notifier
(unit tests, or watcher constructed without one) MUST be a safe no-op — guarded
inside `w.notify`. A Notify error MUST NOT change `w.err` or the watcher's
terminal outcome.

### 2.3 sync — DEFERRED (no seam exists; see §0 / ADR-29-6)

No `Notifier` is injected into `sync` in this change. `TriggerService`,
`ConflictStore`, and `Reconcile` get NO new dependency. When a real
conflict-writer or terminal-reconcile path is introduced, the same pattern
(Notifier via constructor deps, mirror download) applies — documented for the
future, not wired now.

### 2.4 observability — one-way log-forward adapter (composition-root only)

**Chosen seam:** new file `internal/notification/log_forward.go` defining a
`logForwardAdapter` implementing `Adapter`. Registered into the Dispatcher inside
`defaultNotifier` (`app.go:99-104`), which already receives the shared logger via
its `loggers ...sharedlogger.Logger` variadic (currently accepted "for parity …
and future observability hooks" — this IS that hook).

```
app.go:99  func defaultNotifier(emit ..., loggers ...sharedlogger.Logger) notification.Notifier {
app.go:100     adapters := []notification.Adapter{
                   notification.NewUIToastAdapter(emit),
                   notification.NewDesktopToastAdapter(),
               }
               if len(loggers) > 0 && loggers[0] != nil {
                   adapters = append(adapters, notification.NewLogForwardAdapter(loggers[0]))  // ADD
               }
               return notification.NewDispatcher(adapters...)
           }
```

**Why this seam (ADR-29-3):** the forwarding adapter belongs on the CONSUMING
side of the fan-out, not at any producer call site — that is the whole point of
"zero call-site wiring." It joins the existing Dispatcher composition in
`defaultNotifier`, the one place adapters are assembled. The `Logger` is already
threaded there. No producer learns about logging.

---

## 3. The log-forward adapter (no-feedback-loop design)

`logForwardAdapter.Deliver(ctx, n)` maps a `Notification` onto a single
shared-logger write:

- `n.Level` → logger level: `error→Errorf`, `warning→Warnf`,
  `success/info→Infof` (the logger has Debug/Info/Warn/Error; success collapses
  to Info). Or `Logf(domain, level, Fields{CorrelationID, EventType:"notification"}, …)`
  to carry the correlation id. (Pick `Logf` so `CorrelationID` survives.)
- `n.Source` → logger `domain` (e.g. `"device"`, `"anime"`).
- `n.Title`/`n.Body` → the formatted message.
- `n.CorrelationID` → `Fields.CorrelationID`.

**No log→notify→log loop (ADR guard, proposal §5):** the data flow is strictly
one-directional and asymmetric.

```
 Producer ──Notify──► Dispatcher ──► logForwardAdapter ──► sharedLogger ──► observability.log (terminal)
                                                                                  │
                                                                                  ✗ (NO path back to Notify)
```

The ONLY thing that triggers `Notify` is one of the curated producer seams
(§2.1/§2.2). The logger NEVER calls `Notify`. `observability.log` is emitted by
`memLogger.OnWriteFn` (`app.go:296-301`) which only EMITS a Wails event — it does
not feed the Notifier. Therefore a log write cannot re-enter the Notifier; the
graph is acyclic by construction. (Asserted in tests — §5.)

Nil-safety: a nil logger → adapter is not registered (guarded in
`defaultNotifier`); even if constructed with nil, `Deliver` MUST no-op.

---

## 4. Sequence diagrams

### 4.1 device pairing success (happy path + failure isolation)

```
Device         api.Server        app.go closure        notifier(Dispatcher)        UIToast   Desktop   LogForward
  │ consume token  │                     │                          │                 │         │          │
  │───────────────►│  OnPairingTokenConsumed()                      │                 │         │          │
  │                │────────────────────►│                          │                 │         │          │
  │                │                     │ emitFn(pairing.token-consumed)  [KEEP]      │         │          │
  │                │                     │─────► Wails event (bare, unchanged)         │         │          │
  │                │                     │ notifier.Notify(success,"device")  [ADD]    │         │          │
  │                │                     │─────────────────────────►│ Deliver ────────►│ push    │          │
  │                │                     │                          │ Deliver ──────────────────►│ (OS)     │
  │                │                     │                          │ Deliver ─────────────────────────────►│ log
  │                │                     │   (one Deliver errors → errors.Join; others still ran; caller ignores)
  │                │   ◄── callback returns normally regardless ───  │                 │         │          │
```

### 4.2 anime watcher terminal failure (at-most-once)

```
watcher.run() loop          retryOrSetErr / waitRetry        setErr        notifier        adapters
   │ factory/Add/serveLoop fail                                  │            │              │
   │──────────► (retryable) ──► waitRetry ──► retry (loop again, NO notify)   │              │
   │                                                             │            │              │
   │ retries exhausted  ──────► waitRetry returns false ─────────│            │              │
   │ serveLoop returns terminalErr (line 163)                    │            │              │
   │ w.setErr(terminalErr)  (line 167) ─────────────────────────►│            │              │
   │ w.notify(ctx, terminalErr)  [ADD, line after 167] ──────────────────────►│ Notify(error,"anime")
   │                                                             │            │──► Deliver×N (isolated)
   │ return  ── run() exits; watcher lifecycle over ── notify fires exactly once
```

---

## 5. Testing strategy (strict TDD, fake Notifier per context)

Every producer is unit-testable against a fake `Notifier`; failure isolation is
mandatory.

- **Fake Notifier** (test double implementing `Notify`): records calls
  `[]Notification`; a variant returns an error to prove failure isolation. Reused
  across packages (each package may define its own small fake to avoid coupling).

- **device (app_test.go):** invoke the `OnPairingTokenConsumed` closure with a
  fake notifier on `a.notifier`; assert exactly one `Notification{Source:"device",
  Level:success}` recorded AND the bare `pairing.token-consumed` emit still fires
  (assert both surfaces). Add a case where the fake Notifier returns an error →
  assert the closure still returns normally (no panic, bare event still emitted).

- **anime (watcher_test.go):** drive the watcher to terminal failure (factory/Add
  always fail, retry exhausted via cancellable ctx / forced `waitRetry` false);
  assert the fake Notifier got exactly **one** `Notification{Source:"anime",
  Level:error}` — the **at-most-once** assertion. Separate case: transient error
  that recovers (`serveLoop` line 197 path) → assert **zero** notifications.
  Case: nil Notifier → terminal failure still sets `w.err`, no panic. Case:
  Notify returns error → `w.Err()` is still the terminal error, unchanged.

- **notification (log_forward_test.go):** with a fake `logger.Logger` recording
  writes, assert `Deliver` of each Level maps to the right logger method/level,
  carries `Source→domain` and `CorrelationID`. Nil logger → no-op, no panic.

- **no-feedback-loop assertion (notification/dispatcher or app_test):** wire a
  Dispatcher with the real `logForwardAdapter` over a fake logger whose write
  callback, if it ever re-entered `Notify`, would be detected; call `Notify`
  ONCE and assert the logger is written exactly once and `Notify` is NOT
  re-entered (a counter/guard proves acyclicity). This is the explicit guard
  against log→notify→log recursion (proposal §5).

- **wiring (app_test.go):** assert `defaultNotifier(emit, logger)` registers the
  log-forward adapter when a non-nil logger is supplied, and does NOT when logger
  is nil; assert the watcher factory threads `a.notifier` into
  `RuntimeWatcherConfig.Notifier`.

- **real-boundary preference:** where cheap, exercise the real `Dispatcher`
  (not a mock) so failure-isolation behavior is the production one.

Strict TDD: RED test first for each seam (failing assertion on the missing
Notify), then minimal GREEN, then refactor. No call site ships without a test.

---

## 6. ADRs

### ADR-29-1 — Device pairing toast emitted at the app.go callback, NOT via device-package injection
**Decision:** Add the `Notify` call inside the existing `OnPairingTokenConsumed`
closure in `app.go` (line 409), where `a.notifier` is already in scope.
**Rationale:** The pairing-consumed signal is already a composition-root concern
(the callback is built in app.go, not owned by the device domain). The device
service exposes auth, not a pairing-event hook.
**Rejected:** Injecting `Notifier` into `device.NewService` — would make the
device domain depend on user-notification concepts for a moment it does not even
own/emit, and add constructor surface for zero benefit. More invasive, worse
boundary.

### ADR-29-2 — Anime Notifier via RuntimeWatcherConfig, fired only at watcher.go:167
**Decision:** Add `Notifier` to `RuntimeWatcherConfig`; call it once at the single
terminal exit (`w.setErr(terminalErr)`, line 167).
**Rationale:** The watcher owns its lifecycle; the config struct is the
established injection precedent (mirrors `download.ServiceDeps`). Line 167 is the
unique terminal seam, guaranteeing at-most-once.
**Rejected:** Notifying inside `serveLoop`/`retryOrSetErr` — would fire on
transient, self-healing blips (noise). Rejected per proposal row #4.

### ADR-29-3 — Log-forward as a Dispatcher adapter assembled in defaultNotifier
**Decision:** Implement `logForwardAdapter` in `internal/notification`; register
it in `defaultNotifier` (app.go:99) using the logger already passed there.
**Rationale:** Keeps "zero call-site wiring" — the adapter is on the consuming
side of the fan-out, beside UIToast/Desktop, in the one place adapters are
composed. The `loggers` variadic was added for exactly this future hook.
**Rejected:** A separate observability-specific Notifier wrapper, or logging at
each producer — both spread the concern and break the single-composition-point
design.

### ADR-29-4 — CorrelationID reuse-where-present, empty otherwise (no invented scheme)
**Decision:** device pairing → empty (no id minted at that seam). anime terminal
failure → empty: the `uuid.NewString()` at `watcher.go:226` lives inside
`processCurrentFile`, a DIFFERENT function from the terminal seam in `run()`
(line 167); it is not in scope there and threading it out would be an invented
scheme. The log-forward adapter passes through whatever id the Notification
carries.
**Rationale:** Honor the proposal's "reuse where present, empty otherwise" rule
literally. Pinning the code shows line 226's id is unreachable at line 167.
**Rejected:** Minting a new id at the terminal seam, or plumbing line 226's id up
to `run()` — invented correlation, out of scope.

### ADR-29-5 — Keep the bare pairing.token-consumed event; toast is additive
**Decision:** The toast is ADDED beside the existing bare event; the event is
unchanged and not removed.
**Rationale:** `bridge-runtime-source.ts` still subscribes to it; removing/
changing it is an out-of-scope frontend contract change. Double-surface is
accepted; de-dup deferred (proposal §6).
**Rejected:** Replacing the bare event with the toast — breaks the frontend
contract.

### ADR-29-6 — Defer the two sync moments (no runtime seam) instead of faking them
**Decision:** Ship device + anime + log-forward now. Document sync conflict-
detected and reconcile-failed as ready-to-wire but NOT implemented, because no
conflict-writer and no bridge-owned terminal-reconcile path exist in the code.
**Rationale:** "Code wins as truth." The `conflicts` table is a read/resolve stub
(SDD-16 deferred generation); `Reconcile` is a pure function; `TriggerReconcile`
only publishes an event. Building a conflict detector or a synthetic failure just
to have a Notify call site would implement the feature the toast is meant to
observe — out of scope and dishonest.
**Rejected:** (a) Faking a conflict-detected Notify in `ListConflicts` (would
toast on every READ — wrong moment, noisy). (b) Toasting the request-scoped HTTP
500 in `sync_handler.go:54` (a per-request response, not a background bridge
failure; would couple the API layer to user toasts and fire on transient client
errors). Both rejected as semantically wrong.

---

## 7. Rollback (additive / removable per context)

Fully additive; nothing existing is replaced:
- **device:** delete the single `Notify` line in the app.go closure; bare event
  keeps working.
- **anime:** remove the `Notifier` field from `RuntimeWatcherConfig` + the one
  `w.notify` call; existing terminal `w.setErr` + warning logs unchanged.
- **log-forward adapter:** drop the `append(...NewLogForwardAdapter...)` line in
  `defaultNotifier`; toasts simply stop mirroring to the log; delete
  `log_forward.go`.
- **sync:** nothing to roll back (not wired).
- **download / frontend:** untouched throughout — zero regression surface.

Reverting any single context cannot affect the others or the SDD-28 download path.

---

## 8. Risks / open items carried to tasks & verify

- **Scope-reduction must be acknowledged, not silently dropped.** Tasks/verify
  MUST reflect 2 implemented moments + 1 adapter, with the 2 sync moments marked
  deferred-by-missing-upstream (ADR-29-6), so checksdd doesn't see them as
  abandoned work.
- **Wiring order:** confirm during apply that `a.notifier` (app.go:375) is set
  before BOTH the pairing callback construction (app.go:399-415) and the watcher
  factory call in `startup`. From the read, 375 precedes 399; the watcher is
  built in `startup` after notifier init — verify no reordering regresses this.
- **success→Info mapping** in the log-forward adapter loses the "success"
  nuance in the log (logger has no success level). Acceptable: the log is
  forensic, the toast carries the real level. Documented, not a blocker.
- **import:** `internal/anime/watcher.go` will import `internal/notification`
  (new dep edge anime→notification). Mirror download's existing edge; confirm no
  import cycle (notification has no anime dep — safe).
