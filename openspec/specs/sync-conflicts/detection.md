# Spec: Sync Conflict Detection (Non-Blocking OCC)

Change: `2026-06-23-sdd-30-conflict-detection`
Capability: `sync-conflict-detection`
Source proposal: `proposal.md` §"Conflict model", §"Detection & write seams"
item 1, §"Mobile contract change + backward compatibility"
Source decision: engram #4298 (binding)
Depends on: `specs/anime-modified-at`, `specs/sync-conflict-storage`

## Overview

The mobile write path (`applyPendingOperations` -> `PatchAnime`) MUST
perform an optimistic-concurrency (OCC) base-check before applying a
mobile patch, using the bridge-owned `modified_at` version token
(`specs/anime-modified-at`) as the comparison value. Mobile echoes the
`modified_at` it last observed as the `base` of each write. The check
MUST distinguish a legitimate correction (editor saw the latest state)
from a stale overwrite (editor edited from a divergent base) using the
token, NOT the absolute value or timestamp alone — value+timestamp alone
cannot disambiguate the two (the lost-update paradox).

This capability is **non-blocking** (Syncthing model, not
reject-and-resync): on divergence, the bridge ALWAYS ACCEPTS the mobile
write, NEVER clobbers the current value, NEVER blocks or rejects mobile,
preserves BOTH the bridge's current value and mobile's divergent value,
records a conflict row (`specs/sync-conflict-storage`), and fires a
`Notify(Source: "sync", Level: warning)`.

There is NO idempotency key, NO device-ownership rule, and NO MAX/CRDT
reconciliation in this model (rejected per #4298; see proposal "Out of
scope").

## Requirements

- The bridge MUST compare an incoming mobile write's echoed `base`
  (a `modified_at` value) against the anime's current `modified_at`
  (`specs/anime-modified-at`) before applying the write's absolute
  values to the canonical snapshot.
- **Fast-forward rule.** When `base == current modified_at`, the bridge
  MUST apply the incoming absolute value(s) unconditionally, including
  when the incoming value is a decrease relative to the current value
  (e.g. `NroCapVisto` going from 13 to 12 is a legitimate correction,
  not a conflict).
- **No-op guard (trivial idempotency).** When the incoming desired
  value(s) already equal the anime's current value(s), the bridge MUST
  treat the write as a successful no-op and MUST NOT record a conflict,
  REGARDLESS of whether `base` matches `current modified_at`. This
  handles a blind mobile retry sent with a stale base.
- **Divergence rule (non-blocking).** When `base != current modified_at`
  AND the incoming value differs from the current value, the bridge
  MUST:
  - ACCEPT the mobile write (never reject, never return an error to
    mobile for this reason alone).
  - NOT overwrite the current canonical value with the incoming value.
  - Preserve BOTH the bridge's current value and mobile's incoming
    (divergent) value.
  - Insert a conflict row via `specs/sync-conflict-storage` holding both
    values.
  - Call `Notify(Source: "sync", Level: warning)` on the wired Notifier.
- **New-record create.** When `base == null` (or the field is absent)
  and the bridge has no existing record/`modified_at` for that anime ID,
  the bridge MUST treat the write as a legitimate create — apply it, NOT
  a conflict.
- **Backward-compat safe path (unverifiable base on an existing
  record).** When `base == null` or the field is absent on a write for
  an anime the bridge ALREADY has a record/`modified_at` for (an old
  client that does not send `base`), the bridge MUST treat the base as
  unverifiable and take the safe path: it MUST NOT silently fast-forward
  apply over a value it cannot prove the client observed. It MUST record
  a conflict per the divergence rule above (preserving both values) and
  notify, UNLESS the no-op guard already applies (incoming value already
  equals current value).
- **Non-blocking guarantee across all outcomes.** None of the above
  paths (fast-forward, no-op, divergence, create, backward-compat safe
  path) MUST return an HTTP error or otherwise block/reject the mobile
  write to the caller because of conflict detection. Conflict detection
  MUST be invisible to mobile's write success/failure status, except in
  the conventional sense that the request itself succeeded.
- **Notifier failure isolation.** A `Notifier.Notify` error or a nil
  Notifier MUST NOT fail the write, MUST NOT prevent the conflict row
  from being recorded, and MUST NOT alter the bridge's response to
  mobile (mirrors the SDD-29 / download-orchestration non-blocking
  notify pattern).
- The bridge echoes its authoritative `modified_at` back to mobile (the
  exact response field is a DESIGN decision, e.g. via `MobileAnime` or
  `ReconcileResponse`) so mobile can advance its local `base` for the
  next write to that anime.
- There MUST be no idempotency-key mechanism, no device-ownership
  field-routing rule, and no MAX/CRDT reconciliation gating the outcomes
  above.

## Scenarios

### Scenario: Fast-forward apply on matching base
- **Given** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **When** mobile sends a patch with `base = T1` and `NroCapVisto = 13`
- **Then** the bridge applies `NroCapVisto = 13`
- **And** the anime's `modified_at` advances to a new token `T2`
- **And** no conflict row is recorded
- **And** no notification is sent

### Scenario: Fast-forward apply allows a legitimate decrease (correction)
- **Given** an anime with current `modified_at = T1` and `NroCapVisto = 13`
- **When** mobile sends a patch with `base = T1` and `NroCapVisto = 12`
  (the user corrects a double-tap)
- **Then** the bridge applies `NroCapVisto = 12`
- **And** no conflict row is recorded

### Scenario: Stale write diverges and is non-blocking accepted
- **Given** an anime with current `modified_at = T2` and `NroCapVisto = 13`
  (advanced since mobile last synced)
- **When** mobile sends a patch with stale `base = T1` and
  `NroCapVisto = 12`
- **Then** the bridge does NOT overwrite the current `NroCapVisto`
  (it remains `13`)
- **And** the bridge returns success to mobile (the write is accepted,
  not rejected)
- **And** a conflict row is inserted holding both `NroCapVisto = 13`
  (current/local) and `NroCapVisto = 12` (mobile/remote)
- **And** `Notify(Source: "sync", Level: warning)` is called

### Scenario: Blind retry with stale base but identical value is a no-op
- **Given** an anime with current `modified_at = T2` and `NroCapVisto = 12`
- **When** mobile retries a patch with stale `base = T1` and
  `NroCapVisto = 12` (the same value already current)
- **Then** the bridge treats the write as a successful no-op
- **And** no conflict row is recorded
- **And** no notification is sent

### Scenario: New record create with null base
- **Given** the bridge has no existing record for anime ID `X`
- **When** mobile sends a create-style patch for `X` with `base = null`
- **Then** the bridge applies the write as a legitimate create
- **And** no conflict row is recorded

### Scenario: Old client without base on an existing record takes the safe path
- **Given** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **When** an old-client mobile patch arrives with `base` absent and
  `NroCapVisto = 13` (a value different from current)
- **Then** the bridge does NOT silently apply `NroCapVisto = 13` over the
  current value
- **And** the bridge accepts the write without error to mobile
- **And** a conflict row is inserted holding both values
- **And** `Notify(Source: "sync", Level: warning)` is called

### Scenario: Old client without base sending an already-current value is a no-op
- **Given** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **When** an old-client mobile patch arrives with `base` absent and
  `NroCapVisto = 12` (same as current)
- **Then** the bridge treats the write as a successful no-op
- **And** no conflict row is recorded

### Scenario: Notifier failure does not block or fail the divergent write
- **Given** a divergence per the "stale write diverges" scenario above,
  and a wired Notifier whose `Notify` call returns an error
- **When** the bridge processes the divergent mobile write
- **Then** the conflict row is still inserted
- **And** the bridge still returns success to mobile
- **And** no error propagates from the notify failure

### Scenario: Nil notifier is a safe no-op for the divergent write
- **Given** a divergence per the "stale write diverges" scenario above,
  and no Notifier wired (nil)
- **When** the bridge processes the divergent mobile write
- **Then** the conflict row is still inserted
- **And** the bridge still returns success to mobile
- **And** no panic occurs

### Scenario: Concurrent divergence from desktop and mobile
- **Given** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **When** the desktop app edits `animes.dat` and the bridge's
  file-watcher observes the change, stamping `modified_at = T2` and
  setting `NroCapVisto = 13`, BEFORE a mobile patch with stale `base = T1`
  and `NroCapVisto = 14` arrives
- **Then** the mobile write is accepted, current `NroCapVisto` stays `13`
- **And** a conflict row is recorded holding `NroCapVisto = 13`
  (local/current) and `NroCapVisto = 14` (remote/mobile)
- **And** `Notify(Source: "sync", Level: warning)` is called
