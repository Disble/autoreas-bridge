# Spec: Notification → Observability Log Forwarding

Change: `2026-06-23-sdd-29-notifications-rework`
Capability: `notification-observability-forwarding`
Source design: `design.md` §2.4, §3, ADR-29-3

## Overview

Every user notification SHOULD also be recorded in the observability log stream so
the in-app log panel has a forensic trail of what the user was shown. SDD-29 adds
a one-way `logForwardAdapter` (implementing `notification.Adapter`) on the
consuming side of the `Dispatcher` fan-out, beside `UIToastAdapter` and
`DesktopToastAdapter`. The flow is strictly one-directional: notifications are
forwarded INTO the log, and a log write NEVER triggers a notification.

## Requirements

- A new `logForwardAdapter` MUST live in `internal/notification` and implement the
  existing `Adapter` interface (`Deliver(ctx, Notification) error`).
- It MUST be assembled into the `Dispatcher` inside `defaultNotifier`
  (`app.go:99`), using the shared logger already passed via the `loggers`
  variadic. It MUST be registered only when a non-nil logger is supplied.
- `Deliver` MUST map a `Notification` onto a single shared-logger write:
  - `Level` → logger level: `error` → error, `warning` → warn,
    `success`/`info` → info (the logger has no `success` level; it collapses to
    info — accepted, the log is forensic).
  - `Source` → logger `domain`.
  - `Title`/`Body` → the formatted message.
  - `CorrelationID` → carried through to the log entry's fields.
- A nil logger MUST make `Deliver` a safe no-op (and the adapter MUST NOT be
  registered in `defaultNotifier` when the logger is nil).
- The forwarding MUST be acyclic by construction: a log write MUST NOT re-enter
  `Notify`. The only triggers of `Notify` are the curated producer seams; the
  logger only emits the `observability.log` Wails event and never calls the
  Notifier.
- A `Deliver` failure in the log-forward adapter MUST be isolated by the
  `Dispatcher` (it MUST NOT block the UI-toast or desktop adapters, nor fail the
  producing feature).

## Scenarios

### Scenario: Each level maps to the correct logger method
- **Given** a `logForwardAdapter` over a fake logger that records writes
- **When** `Deliver` is called with `Level = error` / `warning` / `success` / `info`
- **Then** the logger receives one write at level error / warn / info / info respectively
- **And** the write carries `domain = Notification.Source` and the message from `Title`/`Body`
- **And** the write carries the `CorrelationID` in its fields

### Scenario: Nil logger is a safe no-op
- **Given** a `logForwardAdapter` constructed with a nil logger
- **When** `Deliver` is called with any notification
- **Then** no panic occurs and no write is attempted

### Scenario: defaultNotifier registers the adapter only with a non-nil logger
- **Given** `defaultNotifier` is called with a non-nil shared logger
- **Then** the resulting Dispatcher includes the log-forward adapter
- **And given** `defaultNotifier` is called with no/nil logger
- **Then** the resulting Dispatcher does NOT include the log-forward adapter

### Scenario: No log → notify → log feedback loop
- **Given** a Dispatcher wired with the real `logForwardAdapter` over a fake logger
  whose write callback would be detectable if it re-entered `Notify`
- **When** `Notify` is called exactly once
- **Then** the logger is written exactly once
- **And** `Notify` is not re-entered (the data flow is acyclic)

### Scenario: Log-forward failure is isolated from other adapters
- **Given** a Dispatcher with a log-forward adapter that returns an error and a
  UI-toast adapter that succeeds
- **When** `Notify` is called
- **Then** the UI-toast adapter still delivers
- **And** the aggregate error is returned for observability only (the producer is not failed)
