# Notifications Specification (Shared)

## Purpose

Defines the project's first SHARED, generic user-notification capability: the `Notifier` port, the domain-agnostic `Notification` model, the two adapters behind it (a UI-toast adapter emitting a Wails runtime event and a Windows desktop-toast adapter), their fan-out isolation semantics, the `notification.push` UI event contract the frontend depends on, and the non-Windows no-op fake behavior. This capability is NOT download-specific: `internal/download` is its FIRST consumer, and the immediate next change (SDD-29, notifications rework) migrates the other features (`sync`, `anime`, `device`, `observability`) onto it. The architecture is deliberately generic so that migration requires no redesign.

This capability is distinct from the in-process event bus (`events.Bus`). The bus is the backend↔backend domain-event mediator; the `Notifier` is the user-facing sink that turns a notable moment into something the human sees. A backend event is NOT a user notification.

## Requirements

### Requirement: Generic Notifier Port and Notification Model

The system MUST expose a generic `Notifier` port with a single method `Notify(ctx, Notification) error`, where `Notification` is a domain-agnostic value carrying `Title`, `Body`, `Level` (one of `info`, `success`, `warning`, `error`), `Source` (a free-form domain string such as `"download"`, `"sync"`, `"anime"`), `CorrelationID`, and `Timestamp`. The port and the value MUST NOT reference any specific feature (e.g. download) — any bounded context MUST be able to inject and call the same `Notifier`.

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

The frontend MUST render incoming `notification.push` events as toasts through a SHARED toast surface that lives in the app-shell (`frontend/src/app/**`), reusable by every feature, NOT inside any single feature folder. The subscription/effect logic MUST live in a `use-*.ts` hook following the strict hook anatomy; the `.tsx` surface MUST render only.

#### Scenario: An incoming notification renders a toast
- GIVEN the app-shell shared toast surface is mounted and subscribed to `notification.push`
- WHEN a `notification.push` event arrives with a given `Level`, `Title`, and `Body`
- THEN the frontend MUST render a toast reflecting that level and content (e.g. mapping `success`/`warning`/`error`/`info` to the corresponding toast style)
- AND the subscription logic MUST reside in a `use-*.ts` hook, not in a `.tsx` file

#### Scenario: Shared surface is not feature-scoped
- GIVEN the toast surface
- WHEN its location is reviewed
- THEN it MUST reside in the app-shell/infrastructure layers, NOT inside `features/download` (or any other feature), so other features can reuse it

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
