# Spec: Device Notifications (Pairing Success)

Change: `2026-06-23-sdd-29-notifications-rework`
Capability: `device-notifications`
Source design: `design.md` §2.1, §4.1, ADR-29-1, ADR-29-5

## Overview

When a mobile device consumes a pairing token (successful QR pairing), the
bridge MUST surface a user-facing `success` notification through the shared
`notification.Notifier`, ADDED beside the existing bare `pairing.token-consumed`
Wails event. This is additive: the existing event and its frontend subscriber
(`bridge-runtime-source.ts`) are unchanged.

## Requirements

- The bridge MUST emit exactly one `notification.Notification` when a pairing
  token is consumed, with `Source = "device"` and `Level = success`.
- The notification MUST be emitted from the existing `OnPairingTokenConsumed`
  composition-root callback (`app.go:409`), where the shared `Notifier`
  (`a.notifier`, set at `app.go:375`) is already in scope. The `device` package
  MUST NOT gain a `Notifier` dependency for this moment.
- The existing bare `pairing.token-consumed` event emit MUST be preserved
  unchanged (both surfaces fire).
- A `Notifier.Notify` error MUST NOT alter the callback's behavior: the callback
  MUST still return normally and the bare event MUST still be emitted.
- `CorrelationID` MUST be empty (no id is minted at this seam — ADR-29-4).
- When no Notifier is wired (nil), the callback MUST be a safe no-op for the
  notification and still emit the bare event.

## Scenarios

### Scenario: Pairing success emits a success notification AND the bare event
- **Given** the app has a wired `Notifier` and a constructed `OnPairingTokenConsumed` callback
- **When** a device consumes a pairing token and the callback runs
- **Then** the bare `pairing.token-consumed` Wails event is emitted
- **And** exactly one `Notification{Source: "device", Level: success}` is delivered to the Notifier
- **And** the notification `Title`/`Body` describe the successful pairing in user-readable terms
- **And** the notification `CorrelationID` is empty

### Scenario: Notifier failure does not break the pairing callback
- **Given** a wired `Notifier` whose `Notify` returns an error
- **When** the `OnPairingTokenConsumed` callback runs
- **Then** the callback returns normally without panicking
- **And** the bare `pairing.token-consumed` event is still emitted

### Scenario: Nil notifier is a safe no-op
- **Given** the app has no Notifier wired (nil)
- **When** the `OnPairingTokenConsumed` callback runs
- **Then** no panic occurs
- **And** the bare `pairing.token-consumed` event is still emitted
