# Spec: Anime `modified_at` (OCC Version Token)

Change: `2026-06-23-sdd-30-conflict-detection`
Capability: `anime-modified-at`
Source proposal: `proposal.md` §"Conflict model", §"Detection & write seams" item 2,
§"DB schema changes" item 1
Source decision: engram #4298 (binding)

## Overview

The bridge MUST own a per-anime, bridge-private version token —
`modified_at` — that is stamped on EVERY accepted change to an anime
record, regardless of which side originated the change: a mobile write
(`PatchAnime`) AND a desktop-observed snapshot change (file watcher /
startup catch-up ingesting a delta from `animes.dat`). This token is the
base value compared by `specs/sync-conflict-detection` and MUST NOT be
conflated with any existing domain field.

`modified_at` is NOT a wall-clock timestamp used for display or sync
windows; it exists purely as an opaque, comparable, monotonically
non-decreasing version marker for optimistic concurrency control (OCC).

## Requirements

- The bridge MUST maintain a `modified_at` version token scoped to a
  single `anime_id`.
- The bridge MUST stamp (advance) `modified_at` for an anime whenever it
  accepts a change to that anime's canonical snapshot, including:
  - A mobile-originated `PatchAnime` write that is fast-forward applied
    (per `specs/sync-conflict-detection`).
  - A desktop-observed snapshot change detected by `DiffSnapshots`
    (content hash differs from the persisted baseline) during the
    runtime file watcher or the startup catch-up path.
- The bridge MUST NOT stamp `modified_at` for an anime whose snapshot
  content is unchanged (a `DiffSnapshots` no-op for that ID MUST NOT
  advance the token).
- The bridge MUST NOT advance `modified_at` for an anime when the only
  effect of a write is recording a conflict without applying the
  incoming value (see `specs/sync-conflict-detection`: divergence is
  accepted but the conflicting value MUST NOT silently become the new
  current state, so the token MUST stay at the value the conflict was
  detected against).
- Two distinct accepted changes to the SAME anime MUST NEVER produce the
  same `modified_at` value (no-collision requirement). This MUST hold
  even when both changes are stamped within the same wall-clock
  millisecond.
- `modified_at` MUST NOT regress for a given anime: a later-accepted
  change's token MUST always compare as "after" an earlier-accepted
  change's token for that same anime, even if the underlying system
  clock moves backward between the two stamps. The exact mechanism
  (monotonic counter, hybrid counter+timestamp, or equivalent) is a
  DESIGN decision; this spec only pins the no-collision / no-regression
  REQUIREMENT, not the storage representation.
- `modified_at` MUST be a token the bridge OWNS and computes itself. It
  MUST NOT be derived from or aliased to `LegacyAnimeRaw.FechaUltCapVisto`
  (the domain field stamped by `StampServerTimestamp`,
  `anime_raw.go:527-529`), which carries its own legacy meaning
  ("last episode watched" timestamp) and is set directly from mobile
  patch payloads or wall-clock `now()` in `PatchAnime`. Conflating the
  two would let a mobile-supplied `fechaUltCapVisto` value corrupt the
  OCC token.
- `modified_at` MUST be readable by the OCC base-check
  (`specs/sync-conflict-detection`) for any anime that has at least one
  accepted change recorded.
- A brand-new anime (no prior accepted change, e.g. first-ever observed
  snapshot or first-ever mobile create) MUST have a `modified_at` value
  consistent with "no token observed yet" so that the create path in
  `specs/sync-conflict-detection` (`base == null` on a record the bridge
  does not have) can recognize it as a legitimate create, not a
  divergence.

## Scenarios

### Scenario: Mobile fast-forward write stamps a new token
- **Given** an anime with current `modified_at = T1`
- **When** a mobile write arrives whose echoed base equals `T1` and is
  fast-forward applied
- **Then** the bridge stamps a new `modified_at = T2` for that anime
- **And** `T2` is distinguishable from `T1` (no collision)
- **And** `T2` does not regress relative to `T1` even if wall-clock time
  has not advanced

### Scenario: Desktop-observed snapshot change stamps a token
- **Given** an anime with current `modified_at = T1` and a persisted
  baseline snapshot hash `H1`
- **When** the file watcher or startup catch-up observes a new snapshot
  for that anime with hash `H2 != H1`
- **Then** the bridge stamps a new `modified_at = T2` for that anime
- **And** `T2` does not collide with or regress before `T1`

### Scenario: Unchanged snapshot does not advance the token
- **Given** an anime with current `modified_at = T1` and persisted
  baseline hash `H1`
- **When** the file watcher or startup catch-up observes a snapshot for
  that anime with hash `H1` (unchanged)
- **Then** `modified_at` for that anime remains `T1`

### Scenario: Conflict-recording write does not advance the token
- **Given** an anime with current `modified_at = T1`
- **When** a mobile write arrives whose echoed base does not equal `T1`
  and the bridge records a conflict per `specs/sync-conflict-detection`
  (incoming value not applied as the new current state)
- **Then** `modified_at` for that anime remains `T1`

### Scenario: New anime has no prior token
- **Given** an anime ID with zero accepted changes recorded by the
  bridge
- **When** the OCC base-check in `specs/sync-conflict-detection` looks up
  `modified_at` for that anime ID
- **Then** the bridge reports "no token observed" (not a stamped value),
  enabling the create path to proceed

### Scenario: Two changes in the same instant never collide
- **Given** an anime with current `modified_at = T1`
- **When** two distinct accepted changes are stamped for that anime in
  rapid succession (potentially within the same wall-clock millisecond)
- **Then** the resulting tokens `T2` and `T3` are distinct from each
  other and from `T1`
- **And** `T3` compares as "after" `T2`

### Scenario: Clock regression does not break monotonicity
- **Given** an anime with current `modified_at = T1`, stamped while the
  system clock read wall-time `W1`
- **When** the system clock is set backward to `W0 < W1` and a new
  accepted change is stamped for that anime
- **Then** the resulting token `T2` still compares as "after" `T1`
