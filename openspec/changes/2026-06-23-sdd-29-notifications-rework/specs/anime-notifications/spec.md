# Spec: Anime Notifications (Watcher Terminal Failure)

Change: `2026-06-23-sdd-29-notifications-rework`
Capability: `anime-notifications`
Source design: `design.md` §2.2, §4.2, ADR-29-2, ADR-29-4

## Overview

The anime runtime watcher (`internal/anime/watcher.go`) keeps the bridge in sync
with `animes.dat`. When the watcher exhausts its retries and reaches its single
terminal-failure exit, the bridge becomes DEAF to filesystem changes — an
otherwise invisible, high-impact condition. SDD-29 surfaces this as a user-facing
`error` notification through the shared `notification.Notifier`, injected via
`RuntimeWatcherConfig` (mirroring `download.ServiceDeps.Notifier`).

## Requirements

- `RuntimeWatcherConfig` MUST accept an optional `Notifier notification.Notifier`
  field, carried onto the watcher struct via its constructor.
- The watcher MUST emit exactly one `Notification` with `Source = "anime"` and
  `Level = error` at the single terminal-failure seam (`w.setErr(terminalErr)`,
  `watcher.go:167`), and MUST NOT emit at any retryable/transient failure path
  (e.g. the self-healing `serveLoop` warning at `watcher.go:197`).
- The notification MUST fire **at most once per watcher lifecycle** (the terminal
  seam in `run()` is reached only once, after retries are exhausted).
- A `Notifier.Notify` error MUST NOT change `w.err` or the watcher's terminal
  outcome.
- A nil Notifier MUST be a safe no-op: the watcher MUST still set its terminal
  error and exit normally without panicking.
- `CorrelationID` MUST be empty (the id minted at `watcher.go:226` is in a
  different function, unreachable at the terminal seam — ADR-29-4).
- The new `internal/anime → internal/notification` import edge MUST NOT create an
  import cycle.

## Scenarios

### Scenario: Terminal failure emits exactly one error notification
- **Given** a watcher constructed with a fake Notifier
- **And** the watcher is driven to terminal failure (retries exhausted)
- **When** the watcher reaches `w.setErr(terminalErr)` and exits `run()`
- **Then** exactly one `Notification{Source: "anime", Level: error}` is delivered
- **And** the notification body conveys that the watcher stopped and the bridge is no longer tracking changes
- **And** `w.Err()` returns the terminal error

### Scenario: Transient, self-healing failure emits no notification
- **Given** a watcher constructed with a fake Notifier
- **And** a failure that is retried and recovers (does not reach the terminal seam)
- **When** the watcher continues running after recovery
- **Then** zero notifications are delivered

### Scenario: Notifier failure does not change the terminal outcome
- **Given** a watcher with a Notifier whose `Notify` returns an error
- **When** the watcher reaches terminal failure
- **Then** `w.Err()` still returns the terminal error unchanged
- **And** no panic occurs

### Scenario: Nil notifier is a safe no-op
- **Given** a watcher constructed with a nil Notifier
- **When** the watcher reaches terminal failure
- **Then** `w.err` is set to the terminal error
- **And** the watcher exits without panicking and delivers no notification
