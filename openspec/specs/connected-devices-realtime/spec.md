# Connected Devices Realtime Specification

## Purpose

Device sync-state changes MUST reach the Connected Devices panel without a route remount.
Today, `ChangelogStore.AcknowledgeDevice` silently upserts `last_seen_at_ms`/`sync_status` and
the panel refreshes once on mount only; this capability publishes an internal bus event on
acknowledgment and re-emits it at the desktop edge so the panel refreshes itself in place.

**Out of scope**: `connection_status` (the Status chip) is a separate, code-proven defect
(`device/service.go:238-248` inverts `sync_status` instead of consulting
`realtime.MemoryHub` liveness) and is deliberately NOT fixed by this capability — see the
dedicated requirement below.

## Requirements

### Requirement: Device acknowledgment publishes a realtime signal

Every `ChangelogStore.AcknowledgeDevice` write that updates a device's `last_seen_at_ms` /
`sync_status` MUST publish an internal bus event carrying the acknowledging device's id. The
desktop edge MUST subscribe to that event and re-emit it as a Wails runtime event, following
the same guard pattern as the existing anime/download runtime bridges (early-return when the
event bus or emit function is nil; the emit context is re-checked inside the callback).

#### Scenario: Acknowledgment publishes and re-emits

- GIVEN a device acknowledges changelog rows through the sync API
- WHEN `AcknowledgeDevice` persists the new `last_seen_at_ms`
- THEN a device-acknowledged event is published on the internal bus
- AND the desktop edge re-emits it as a Wails runtime event carrying that device's id

#### Scenario: A nil bus or emit function degrades without crashing

- GIVEN the desktop edge's event bus or emit function is nil (headless/test runtime)
- WHEN `AcknowledgeDevice` publishes the event
- THEN the desktop bridge returns early and emits nothing
- AND no panic or error propagates from the publish path

### Requirement: The panel reflects sync-state changes without a remount

The Connected Devices panel MUST subscribe to the device-acknowledged runtime event on mount
and refresh its rows — including `last_seen_at_ms` — in place when the event fires, without
remounting the route. The subscription MUST be torn down on unmount. On a runtime that exposes
no device-acknowledged event source, the panel MUST degrade to its current mount-only refresh
rather than crash or hang.

#### Scenario: An acknowledgment refreshes the panel's rows in place

- GIVEN the Connected Devices panel is mounted and showing a device's prior `last_seen_at_ms`
- WHEN that device is acknowledged and the runtime event fires
- THEN the panel's rows refresh with the advanced `last_seen_at_ms`
- AND the route is not remounted

#### Scenario: The subscription is torn down on unmount

- GIVEN the Connected Devices panel is mounted and subscribed
- WHEN the panel unmounts
- THEN its device-acknowledged subscription is unsubscribed
- AND no further refresh occurs from events published after unmount

#### Scenario: A runtime without the event source keeps mount-only refresh

- GIVEN the runtime exposes no device-acknowledged event source
- WHEN the panel mounts
- THEN it refreshes once on mount, as it does today
- AND it does not throw or hang waiting for a subscription

### Requirement: `connection_status` remains untouched by this capability

This capability MUST NOT change how `connection_status` is computed or displayed. The Status
chip's value remains governed exclusively by the existing (separately defective) derivation in
`device/service.go`.

#### Scenario: The Status chip is unaffected by a realtime refresh

- GIVEN a device's `sync_status` changes and the panel refreshes via this capability
- WHEN the panel re-renders with the fresh `last_seen_at_ms`
- THEN the Status chip continues to read exactly what `device/service.go`'s existing
  `connection_status` derivation produces
- AND this capability introduces no change to that derivation
