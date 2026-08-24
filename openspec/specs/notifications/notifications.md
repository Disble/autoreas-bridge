# Notifications Specification (Shared)

## Purpose

Defines the project's first SHARED, generic user-notification capability: the `Notifier` port, the domain-agnostic `Notification` model, the two adapters behind it (a UI-toast adapter emitting a Wails runtime event and a Windows desktop-toast adapter), their fan-out isolation semantics, the `notification.push` UI event contract the frontend depends on, and the non-Windows no-op fake behavior. This capability is NOT download-specific: `internal/download` is its FIRST consumer, and the immediate next change (SDD-29, notifications rework) migrates the other features (`sync`, `anime`, `device`, `observability`) onto it. The architecture is deliberately generic so that migration requires no redesign.

This capability is distinct from the in-process event bus (`events.Bus`). The bus is the backend↔backend domain-event mediator; the `Notifier` is the user-facing sink that turns a notable moment into something the human sees. A backend event is NOT a user notification.

## Requirements

### Requirement: Generic Notifier Port and Notification Model

The system MUST expose a generic `Notifier` port with a single method `Notify(ctx, Notification) error`, where `Notification` is a domain-agnostic value carrying `Title`, `Body`, `Level` (one of `info`, `success`, `warning`, `error`), `Source` (a free-form domain string such as `"download"`, `"sync"`, `"anime"`), `CorrelationID`, and `Timestamp`. The port and the value MUST NOT reference any specific feature (e.g. download) — any bounded context MUST be able to inject and call the same `Notifier`.

`Notification` additionally carries two OPTIONAL fields, added by `notification-center`'s producer enrichment (SDD-60): `Rows` (a list of neutral `DetailItem` values, each naming one thing the notification concerns) and `Actions` (a list of neutral `ActionSpec` values, each an action a user can take). Both are nil for every producer that has nothing to attach, and neither type may reference any specific feature — same constraint as `Notification` itself.

#### Scenario: Any feature can emit a notification
- GIVEN a bounded context that has been injected with the shared `Notifier`
- WHEN it calls `Notify(ctx, Notification{Source: "<its-domain>", Level: <level>, Title, Body})`
- THEN the system MUST accept and dispatch the notification regardless of the `Source` value
- AND the `Notifier` interface MUST NOT require any download-specific field or type

#### Scenario: Level is constrained to the defined set
- GIVEN a `Notification` value
- WHEN it is constructed
- THEN its `Level` MUST be one of `info`, `success`, `warning`, or `error`

### Requirement: Fan-Out With Adapter Failure Isolation

The system MUST dispatch each `Notification` to all registered adapters via a dispatcher, and a single adapter failing MUST NOT block the other adapter(s) or fail the calling feature. The dispatcher MUST attempt every adapter even when an earlier adapter returns an error, and MUST NOT propagate a presentation failure to the caller as a feature failure.

#### Scenario: One adapter fails, the other still runs
- GIVEN a dispatcher with a UI-toast adapter and a desktop-toast adapter
- AND the UI-toast adapter returns an error for a given notification
- WHEN the system dispatches that notification
- THEN the desktop-toast adapter MUST still be invoked
- AND the failure MUST be observable (logged) but MUST NOT abort dispatch

#### Scenario: Adapter failure does not fail the caller
- GIVEN a feature calls `Notify` and an adapter returns an error
- WHEN dispatch completes
- THEN the calling feature MUST be able to continue its work normally
- AND the notification failure MUST NOT be surfaced to the caller as a feature-level error

#### Scenario: No adapters registered
- GIVEN a dispatcher with no registered adapters
- WHEN `Notify` is called
- THEN the system MUST NOT panic
- AND MUST treat the call as a successful no-op

### Requirement: UI-Toast Adapter Emits the notification.push Event

The UI-toast adapter MUST deliver a notification to the frontend by emitting a Wails runtime event named `notification.push` carrying the `Notification` payload, mirroring the existing `observability.log` emit mechanism (a `wruntime.EventsEmit(ctx, eventName, payload)` call behind an injectable emit function). The event name and payload shape constitute the contract the frontend depends on.

#### Scenario: Notification is emitted to the UI
- GIVEN the UI-toast adapter receives a `Notification`
- WHEN it delivers the notification
- THEN it MUST emit a Wails runtime event named exactly `notification.push`
- AND the event payload MUST carry the `Notification` fields (`Title`, `Body`, `Level`, `Source`, `CorrelationID`, `Timestamp`)

#### Scenario: Emit is degraded when the runtime is absent
- GIVEN the UI-toast adapter is constructed in a context where the Wails runtime/emit function is unavailable (e.g. a unit test or non-runtime context)
- WHEN it attempts to deliver a notification
- THEN it MUST degrade gracefully (no-op or injected fake emit) without crashing

### Requirement: Frontend Renders notification.push Via a Shared Toast Surface

The frontend MUST render incoming `notification.push` events as toasts through a toast-rendering
module that is reusable by every feature and MUST NOT be specialized to any single consuming
feature's business logic. Reusability MUST be satisfied structurally, not by physical file location
under `frontend/src/app/**`: the app-shell (`frontend/src/App.tsx`, `frontend/src/app/**`) is
delivery/composition-only by project convention and MUST NOT itself contain hooks or business logic
(CLAUDE.md project note #4), so the module's actual implementation (the `use-*.ts` subscription hook
and its rendering `.tsx`) MAY live outside `frontend/src/app/**` PROVIDED it is:

1. Mounted from the app-shell through exactly one thin re-export/composition seam (the pattern
   verified live at `frontend/src/app/NotificationToasts.tsx:1`:
   `export { NotificationToasts } from '../features/notifications/ui/NotificationToasts/NotificationToasts';`),
   so the app-shell's mount point never itself grows subscription logic;
2. Domain-agnostic in its own code — it MUST branch only on generic `Notification` fields (`Level`,
   `Title`, `Body`, `Source` as an opaque string), and MUST NOT contain a conditional that special-cases
   any one feature's `Source` value or domain type; and
3. Reachable by any feature without that feature importing another feature directly — no
   feature-to-feature import is introduced by this module's existence.

The subscription/effect logic MUST live in a `use-*.ts` hook following the strict hook anatomy; the
`.tsx` surface MUST render only.

(Previously: required the implementation itself to physically reside inside `frontend/src/app/**`,
"NOT inside any single feature folder." Shipped reality — verified live during this change's
exploration phase — is that the implementation lives at
`frontend/src/features/notifications/ui/NotificationToasts/` and
`frontend/src/app/NotificationToasts.tsx` is a one-line re-export, not the implementation. Per project
note #2 in `CLAUDE.md`, "if docs, specs, or archived changes disagree with the codebase, the code wins
as the runtime truth." The original file-path rule is additionally in tension with project note #4,
which forbids business logic inside `frontend/src/app/**` altogether — so the original wording could
never have been satisfied literally by any hook-bearing implementation. This MODIFIED block replaces
the file-path rule with the structural invariants the original rule was actually protecting: shared
reusability, no single-feature ownership, and no feature-to-feature coupling. This drift was logged to
`docs/learning-log.md` on 2026-08-23 ahead of this spec phase.)

#### Scenario: An incoming notification renders a toast

- GIVEN the shared toast surface is mounted (through the app-shell's re-export seam) and subscribed to
  `notification.push`
- WHEN a `notification.push` event arrives with a given `Level`, `Title`, and `Body`
- THEN the frontend MUST render a toast reflecting that level and content (e.g. mapping
  `success`/`warning`/`error`/`info` to the corresponding toast style)
- AND the subscription logic MUST reside in a `use-*.ts` hook, not in a `.tsx` file

#### Scenario: Shared surface is domain-agnostic and reusable, wherever its files live

- GIVEN the toast-rendering module's implementation files
- WHEN they are reviewed for feature-scoping
- THEN they MUST contain no conditional branching on a specific consuming feature's identity or
  domain type
- AND the app-shell MUST mount the module through exactly one re-export/composition seam that itself
  contains no subscription or business logic
- AND any other feature MUST be able to trigger a toast (by causing a `notification.push` event)
  without importing the toast module's feature folder directly as a dependency of ITS OWN feature code

### Requirement: Proper Windows Desktop-Toast Adapter Behind a Build-Tag Seam

The Windows desktop-toast adapter MUST deliver a proper native/OS desktop notification using a vetted library or native syscall, and MUST NOT shell out to PowerShell or any other ad-hoc mechanism. The adapter MUST be a build-tag/interface seam: a real implementation on Windows builds and a clearly-labeled no-op fake on non-Windows builds so non-Windows builds compile and non-desktop tests run.

#### Scenario: Desktop notification on Windows
- GIVEN the Windows build of the desktop-toast adapter
- WHEN it receives a `Notification`
- THEN it MUST deliver a native Windows desktop notification (via a vetted library or native syscall)
- AND it MUST NOT invoke PowerShell or any external shell process

#### Scenario: Desktop adapter is a no-op on non-Windows builds
- GIVEN the non-Windows build of the desktop-toast adapter (the build-tag fake)
- WHEN it receives a `Notification`
- THEN it MUST behave as a no-op without error
- AND the system MUST NOT treat the no-op fake as having delivered a desktop notification (it MUST NOT satisfy any "desktop notification delivered" assertion)

#### Scenario: Desktop adapter failure is isolated
- GIVEN the desktop-toast adapter fails to deliver a notification on a Windows build
- WHEN it is invoked as part of dispatch
- THEN the failure MUST NOT block the UI-toast adapter or fail the calling feature (see "Fan-Out With Adapter Failure Isolation")

### Requirement: Persist-Then-ALWAYS-Project Is A Port-Level Invariant For Any Notifier Decorator

Any component that decorates the `Notifier` port to add a side effect before delegating (such as a
persisting decorator) MUST perform its own side effect first and THEN unconditionally delegate to the
wrapped `Notifier` — even when its own side effect failed. A decorator MUST NOT allow its own failure
to suppress the wrapped `Notifier`'s delivery. This generalizes, at the port level, the concrete
decorator behavior specified in `notification-center`'s "Every Notification Is Persisted Then ALWAYS
Projected" requirement, so that this invariant is discoverable from the shared port contract and not
only from the one capability that currently implements it.

#### Scenario: A decorator's own side-effect failure never suppresses delegation

- GIVEN a `Notifier` decorator whose own side effect (e.g. a persistence write) fails
- WHEN the decorator's `Notify` is called
- THEN it MUST still call the wrapped `Notifier`'s `Notify` with the same `Notification` value
- AND the wrapped `Notifier`'s adapters MUST still run

### Requirement: The Toast Carrier Renders Every Notification's Primary Action, And MUST NOT Silently Drop Non-Primary Actions

Verified live at `app-notification.helpers.tsx:17-22`:

```tsx
if (actions?.length) {
  options.actionProps = { children: actions[0].label, onPress: actions[0].onPress };
}
```

`AppNotification.actions` is an ordered list; `actions[0]` is the primary action and MUST render via
`actionProps`. Actions at index 1 and beyond MUST NOT be silently discarded — this is a real,
pre-existing production bug: `use-missed-schedule-resolver.ts` already pushes two actions in both of
its effects today, so a second action is dropped in production right now, independent of the
Notification Center. The Center makes ignoring this worse, because its per-row action tokens are the
same tokens a toast may also carry, so a carrier that silently drops half of them is not acceptable.
The rendering MECHANISM (a HeroUI custom-content toast carrying two buttons, vs. a deterministic
"+N more" affordance opening the matching Center row) is a design-phase decision; the CONTRACT fixed
here is behavioral: no action beyond the primary MUST vanish without a trace.

#### Scenario: A single-action notification renders its one action normally

- GIVEN an `AppNotification` with exactly one action
- WHEN its toast renders
- THEN that action MUST render as the toast's primary action (`actionProps`)

#### Scenario: A second action is never silently dropped

- GIVEN an `AppNotification` with two or more actions (e.g. as pushed today by
  `use-missed-schedule-resolver.ts`)
- WHEN its toast renders
- THEN `actions[0]` MUST render as the primary action
- AND every action from `actions[1]` onward MUST be reachable through the toast (either rendered
  directly or through a deterministic affordance that leads to them) — none MUST simply disappear
- AND a test asserting this MUST fail if a second action's `label`/`onPress` becomes unreachable from
  the rendered toast

### Requirement: The Frontend Resolver Preserves Full Notification Fields And A Correlation Identifier

Verified live at `use-backend-event-resolver.ts:18-27`:

```ts
useEffect(() => {
  return source.subscribe((notification) => {
    pushRef.current({
      severity: LEVEL_TO_SEVERITY[notification.Level] ?? 'info',
      title: notification.Title,
      description: notification.Body || undefined,
      persistent: false,
    });
  });
}, [source]);
```

Today, `Source`, `CorrelationID`, and `Timestamp` are dropped, and no `persistedId` is ever set — every
backend event becomes a fresh, uncorrelatable toast. The resolver MUST carry `Source`, `CorrelationID`,
`Timestamp`, and a `persistedId` from the incoming `notification.push` event through to the pushed
toast/notification value, so that a toast can be correlated to its persisted Notification Center
record (enabling "View details" on a toast to open the matching Center row, and enabling deduplication
between a toast and its record).

#### Scenario: A backend event's identifying fields reach the pushed notification

- GIVEN a `notification.push` event carrying `Source`, `CorrelationID`, `Timestamp`, and a persisted
  record identifier
- WHEN the frontend resolver processes it
- THEN the value it pushes MUST include that `Source`, `CorrelationID`, `Timestamp`, and a
  `persistedId` intact
- AND none of these four fields MUST be silently dropped

#### Scenario: The persistedId enables opening the matching Center record

- GIVEN a toast rendered from a `notification.push` event carrying a `persistedId`
- WHEN the user activates a "view details" affordance on that toast
- THEN the system MUST be able to navigate to the Center record identified by that `persistedId`
