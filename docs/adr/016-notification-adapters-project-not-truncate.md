# ADR-016: Notification presentation adapters project, they do not truncate

- **Status**: Accepted, not yet implemented
- **Date**: 2026-08-25
- **Supersedes**: nothing
- **Related**: `docs/adr/013-notification-center-boundaries.md` (what earns a
  notification), `docs/notification-cta-policy.md` (what button it offers)

## Context

Bridge delivers one notification to three surfaces. ADR-013 decided what earns a
durable record; the CTA policy decided what a user can do from one. Both were
written against the Notification Center, and the Center is the only surface that
honours them.

### The architecture already in place

The composition is a **Port** with three layers behind it, and each layer is a
named pattern:

| Layer | Pattern | Where |
|---|---|---|
| `notification.Notifier` | **Port** — the single interface every producer depends on | `internal/notification/notifier.go:93` |
| `center.Service` | **Decorator** — same interface in and out; persists, then always delegates to `inner` | `internal/notification/center/service.go:33` |
| `Dispatcher` | **Fan-out** over adapters, failure-isolated via `errors.Join` | `internal/notification/dispatcher.go:34` |
| `UIToastAdapter`, `DesktopToastAdapter`, `logForwardAdapter` | **Adapter** — one per presentation medium | `ui_toast.go`, `desktop_windows.go`, `log_forward.go` |

`defaultNotifier` (`app_defaults.go:38`) assembles them. Nothing about that
structure is wrong, and this ADR does not change it.

### What the adapters actually do with a Notification

`Notification` carries `Rows []DetailItem` and `Actions []ActionSpec`
(`notifier.go:67`). What each surface does with them:

| Surface | Receives | Renders | Drops |
|---|---|---|---|
| Center | rows + actions | rows, per-row verbs, footer verbs | nothing |
| HeroUI toast | rows + actions | title, body | **rows and actions** |
| Windows toast | rows + actions | title, body | **rows and actions** |
| Log forward | rows + actions | one log line | rows and actions (correctly — a log line has no affordances) |

The HeroUI toast loses them twice over. The Go side emits the full value
(`ui_toast.go:39`), and `use-backend-event-resolver.ts` then maps seven fields
and drops both collections. The frontend `ActionSpec` mirror
(`shared/contracts/notification.types.ts`) also omits `RowRef`, so the toast
could not distinguish the two CTA levels even if it received them.

The result on screen: every toast except `missed_schedule` carries no
affordance at all. `missed_schedule` has buttons only because
`use-missed-schedule-resolver.ts` builds them client-side, bypassing the
generic path entirely.

### It was never a limitation of the media

The approved `Toast.dc.html` artboard (lines 243–280) draws a toast with cover
art, a per-row detail line, and `Open Downloads` / `Dismiss`. None of it exists.

For Windows, the library already vendored — `git.sr.ht/~jackmordaunt/go-toast/v2`
— exposes `Icon`, `HeroIcon`, `Actions []Action`, `Inputs []Input`,
`ActivationType` and `ActivationArguments`. `DesktopToastAdapter.Deliver`
(`desktop_windows.go:54`) sets `AppID`, `Title`, `Body`, `Audio`, `Duration` and
nothing else.

So the shortfall is not "the two-level policy does not transfer to these
surfaces". It is that two adapters keep the fields that map trivially and
discard the rest in silence.

### The blocker underneath

Even a complete adapter cannot mint an actionable button today, because the
identity it would have to address never reaches it.

`center.Service.Notify` persists the record and its actions — `toActions` mints
each action's id, and `InsertRecord` returns the record id
(`sqlite_store.go:71`). Then:

```go
_, persistErr := s.store.InsertRecord(ctx, Record{...})
...
dispatchErr := s.inner.Notify(ctx, n)
```

The record id is discarded into `_`, and the value handed to the Dispatcher is
`n` — the producer's pre-persistence value, whose `ActionSpec`s carry a label,
an intent and frozen args, but no id. Every adapter downstream is therefore
structurally incapable of addressing a persisted token.

This is one defect with two visible symptoms: the Windows toast has no button to
give, and the HeroUI toast's "View details" affordance
(`app-notification.helpers.tsx:99`) never renders because `RecordID` does not
exist on the Go struct at all.

## Decision

### 1. An adapter projects the whole notification into its medium's affordances

There is one CTA policy (`docs/notification-cta-policy.md`) and three
translations of it, not three policies. An adapter that drops content its medium
can express is a defect, not a design choice.

- **Center** — rows, per-row verbs, footer verbs. Unchanged.
- **HeroUI toast** — rows and footer verbs, as `Toast.dc.html` draws them.
  Per-row verbs are out of scope for a surface measured in seconds; the row is
  identity there, and the record is one press away.
- **Windows** — footer verbs become `Actions` (Windows caps them at five), the
  subject's cover becomes `Icon`/`HeroIcon`, and rows collapse into the body.
  That collapse is the honest translation of a medium with no arbitrary rows,
  and it is a projection decision, not a licence to drop them.
- **Log forward** — unchanged. A forensic log line has no affordances, so
  ignoring both collections is already a correct projection.

The per-element mapping lives as Table C in `docs/notification-cta-policy.md`,
beside the tables that say what a notification offers in the first place. This
ADR decides that adapters must project; that document records what each
projection is.

Two of its cells are decisions rather than mechanics, and belong here:

- **The toast drops L2 verbs.** A surface measured in seconds should not ask the
  user to choose between per-row verbs. The row is identity there, and the
  record is one press away.
- **`Kind` and `Correlation ID` leave the Center UI.** They were labelled,
  monospaced values in the detail pane's footer. `Kind` restates the title in
  wire vocabulary and keys no filter. `Correlation ID` is the only field tying a
  record back to its run, which argues for a link rather than an opaque token —
  so it becomes the `See this run` verb. Both stay on the record and in the
  forensic log. The design canvas draws that footer; it was the starting point,
  not the ceiling.

### 2. The persisted identity travels to the delivery boundary

The producer-facing port keeps taking a producer-owned value: a producer never
knows an id and must never be asked for one. Identity belongs at the **delivery**
boundary, which is exactly the seam the Decorator already sits on.

Concretely, `Adapter.Deliver` stops taking a bare `Notification` and starts
taking a delivery envelope: the notification, the record id `InsertRecord`
returned, and the ids `toActions` minted, paired to the specs they were minted
from. `Notifier.Notify` is unchanged — the two interfaces are deliberately no
longer the same shape, because they answer different questions. A producer says
what happened; a delivery says which persisted thing it became.

The envelope is what `Dispatcher` fans out, so the Dispatcher stops satisfying
`Notifier` by accident of having the same method signature and starts satisfying
it because `center.Service` hands it one. A `Dispatcher` used with no Center
wrapped — `Wrap` returns `inner` unchanged for a nil store — receives an envelope
with empty identity, and every adapter must degrade to the non-actionable
rendering rather than failing. That is the ordinary path in tests and on a
machine whose bridge database will not open.

Ordering matters and is already correct: `Notify` persists first and dispatches
second. What changes is that the id it currently discards into `_` becomes the
thing it passes on.

### 3. Windows activation re-enters the one executor

`toast.SetActivationCallback` is process-global and in-process. It is registered
**once at startup**, not per notification, and it receives the string the
notification itself froze into `Action.Arguments`.

That string carries the `(notificationID, actionID)` pair, which the callback
parses and hands to the same `center.Executor` the detail pane presses through.
The executor stays the single place where ownership (`foreign_action`),
single-fire (`already_executed`) and registration (`intent_unregistered`) are
decided. There is one gate with two doors, never two gates.

Note that `SetActivationCallback` documents itself as inert while the library's
PowerShell fallback is in effect. `Deliver` already calls `wintoast.Push`
directly to avoid that fallback, so the callback stays live — which makes that
call a load-bearing choice rather than a stylistic one.

## Consequences

- A press can now arrive from outside the frontend. Anything the executor treats
  as press-time truth must not assume a live WebView.
- Windows caps a toast at five actions and has no per-row level. A notification
  carrying more whole-notification verbs than that is truncated by the medium,
  and the adapter — not the producer — owns that bound, exactly as
  `copyHosterActionsPerRowLimit` owns its own.
- The frontend `ActionSpec` mirror gains `RowRef`, without which the toast
  cannot tell a footer verb from a row verb.
- `use-backend-event-resolver.ts` stops being a seven-field projection and
  becomes a real translation.
- Adding a fourth surface later means writing one adapter, and the policy it
  must honour is already written down.
- `Adapter` and `Notifier` diverge. Today both are `func(ctx, Notification)
  error` and the compiler cannot tell a presentation sink from a notifier; after
  this it can, and a producer accidentally wired to an adapter stops compiling.
- The `See this run` verb replacing the correlation-id row needs a destination
  that can be addressed. `RunHistoryPanel` selects a run by id, but that
  selection is component-local state: `/downloads` accepts no run parameter and
  `resolveSelectedRunId` falls back to the newest run. The route has to honour
  one before the verb points anywhere, and until it does the verb is not shipped
  — an action that lands on the wrong run is worse than the opaque token it
  replaced.

## Alternatives considered

**Let each surface define its own CTA policy.** Rejected: this is what the code
does today by accident, and it is why the same notification offers three
different answers depending on where you happen to see it. Per-surface policy
would make the divergence official instead of fixing it.

**Put the record id on `notification.Notification`.** Rejected: that value is
producer-owned, and a field no producer ever sets is a field that lies at every
call site but one. Identity belongs at the delivery boundary, which is exactly
the seam the Decorator already sits on.

**Have adapters read the store to find the ids they need.** Rejected: it couples
every presentation adapter to persistence, and inverts the dependency the
Decorator exists to keep one-directional.

**Use `Protocol` activation and let Windows relaunch the app by URI.** Rejected
while the in-process callback works: a URI round-trip through the shell would
make a button press depend on registry protocol registration and on process
launch semantics, to reach an executor already running in the same process.
