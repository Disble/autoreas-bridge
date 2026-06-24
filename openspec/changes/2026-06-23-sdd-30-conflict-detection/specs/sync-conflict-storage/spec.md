# Spec: Sync Conflict Storage (Writer + Lifecycle)

Change: `2026-06-23-sdd-30-conflict-detection`
Capability: `sync-conflict-storage`
Source proposal: `proposal.md` §"Detection & write seams" item 3,
§"DB schema changes" item 3
Source decision: engram #4298 (binding)

## Overview

`internal/sync/conflict_store.go` today exposes `ListConflicts` (read)
and `ResolveConflict` (lifecycle transition) but has NO writer — nothing
ever performs `INSERT INTO conflicts`. The `conflicts` table DDL already
declares `local_snapshot_json` and `remote_snapshot_json`
(`sqlite_bootstrap.go:37-47`), but no code populates either column, and
`ListConflicts`/`contracts.ConflictInfo` only expose
`conflict_id, anime_id, detected_at_ms, status`. This capability adds the
missing `InsertConflict` writer so `specs/sync-conflict-detection` has a
real persistence seam, and ensures the conflict lifecycle
(`pending` -> `resolved`) and listing behavior work correctly with real
data in both snapshot columns.

The conflict-resolution UX (mobile-side) and any new fields needed
purely for that UX are OUT of scope here; this spec only covers
persisting and exposing what `specs/sync-conflict-detection` produces.

## Requirements

- The bridge MUST provide an `InsertConflict` operation on
  `ConflictStore` that persists a new conflict row with:
  - a unique `conflict_id`,
  - the `anime_id` the conflict belongs to,
  - `local_snapshot_json`: the bridge's current (authoritative, at
    detection time) value/snapshot for the conflicting field(s) or
    record,
  - `remote_snapshot_json`: the incoming divergent value/snapshot from
    the write that triggered the conflict,
  - `detected_at_ms`: the time the conflict was detected,
  - `status = 'pending'`.
- `InsertConflict` MUST populate BOTH `local_snapshot_json` and
  `remote_snapshot_json` with non-empty, valid JSON representing the two
  divergent values. Neither column MUST be left empty/null for a newly
  inserted conflict.
- `InsertConflict` MUST be the only writer responsible for creating
  conflict rows; `specs/sync-conflict-detection` calls into it at the
  divergence-detection seam (it MUST NOT duplicate persistence logic
  itself).
- `InsertConflict` MUST be safe to call concurrently for different
  anime IDs without corrupting unrelated rows (standard SQLite
  transactional guarantees via the existing `*sql.DB` are sufficient;
  no new locking primitive is required by this spec).
- `ListConflicts` MUST continue to return only `status = 'pending'`
  conflicts, ordered by `detected_at_ms ASC, conflict_id ASC`
  (unchanged from current behavior) and MUST reflect rows written by
  `InsertConflict` (i.e., a freshly inserted pending conflict MUST appear
  in the next `ListConflicts` call).
- `ResolveConflict` MUST continue to transition a `pending` conflict to
  `resolved` (setting `resolved_at_ms` and `resolution`) and MUST
  continue to return `contracts.ErrAnimeNotFound` when no matching
  pending row exists, exactly as today. This spec does not change that
  behavior, only ensures rows exist for it to operate on.
- A conflict row, once inserted, MUST NOT be silently overwritten by a
  second `InsertConflict` call for the same anime while a conflict for
  that anime is still `pending` — at minimum, the bridge MUST NOT lose
  either the original or the new divergent data. (The exact dedup/merge
  policy for a second divergence on an already-pending conflict is a
  DESIGN decision; this spec only requires no silent data loss.)
- `InsertConflict` failures (e.g. DB error) MUST be returned as an error
  to the caller (the sync write path), which per
  `specs/sync-conflict-detection` MUST still not block or fail the
  mobile write merely because conflict persistence failed at the
  storage layer in a way that cannot be recovered — the non-blocking
  guarantee in `specs/sync-conflict-detection` governs the caller's
  behavior on this error; this spec only requires `InsertConflict` to
  surface the error honestly rather than swallow it.

## Scenarios

### Scenario: InsertConflict persists both divergent values
- **Given** an anime `X` with current value `NroCapVisto = 13` and an
  incoming divergent mobile value `NroCapVisto = 12`
- **When** `InsertConflict` is called for anime `X` with local value `13`
  and remote value `12`
- **Then** a new row is inserted into `conflicts` with
  `status = 'pending'`
- **And** `local_snapshot_json` decodes to a value reflecting
  `NroCapVisto = 13`
- **And** `remote_snapshot_json` decodes to a value reflecting
  `NroCapVisto = 12`
- **And** `detected_at_ms` is set to the detection time

### Scenario: Newly inserted conflict appears in ListConflicts
- **Given** no prior conflict rows exist for anime `Y`
- **When** `InsertConflict` is called for anime `Y` and then
  `ListConflicts` is called
- **Then** the returned list includes an entry for anime `Y` with
  `status = 'pending'`

### Scenario: ListConflicts excludes resolved conflicts
- **Given** a conflict row for anime `Z` inserted via `InsertConflict`
  and then resolved via `ResolveConflict`
- **When** `ListConflicts` is called
- **Then** the resolved conflict for `Z` does NOT appear in the returned
  list

### Scenario: ResolveConflict on an inserted conflict succeeds
- **Given** a pending conflict row for anime `Z` created via
  `InsertConflict`
- **When** `ResolveConflict` is called with that conflict's ID
- **Then** the row transitions to `status = 'resolved'` with
  `resolved_at_ms` set
- **And** a subsequent `ResolveConflict` call with the same ID returns
  `contracts.ErrAnimeNotFound` (no matching pending row)

### Scenario: InsertConflict never leaves a snapshot column empty
- **Given** a divergence detected by `specs/sync-conflict-detection`
  for anime `W`
- **When** `InsertConflict` is called with the bridge's current value
  and mobile's incoming value
- **Then** both `local_snapshot_json` and `remote_snapshot_json` contain
  non-empty, valid JSON
- **And** neither column is null

### Scenario: InsertConflict storage failure surfaces as an error
- **Given** the underlying SQLite connection is unavailable
- **When** `InsertConflict` is called
- **Then** the call returns a non-nil error
- **And** no partial/corrupt row is left in `conflicts`
