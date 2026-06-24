# Spec: Anime Soft Delete (No Data Loss)

Change: `2026-06-23-sdd-30-conflict-detection`
Capability: `anime-soft-delete`
Source proposal: `proposal.md` §"DB schema changes" item 2
Source decision: engram #4298 item 7 (binding)

## Overview

The bridge MUST NEVER physically remove an anime record as a result of
observing a `$$deleted` tombstone in `animes.dat` or observing that a
previously-known anime ID is absent from the current snapshot set. The
domain already models logical delete (`Activo` + `FechaEliminacion` on
`LegacyAnimeRaw`); the snapshot-ingest path currently bypasses this model
by parsing `$$deleted` records to an empty value, dropping them from the
in-memory record set, and feeding the resulting `pruneIDs` to
`ReplaceBaseline`, which issues a physical `DELETE FROM anime_snapshots`.
This capability closes that gap: deletion becomes logical only.

## Requirements

- When the parser encounters a `$$deleted` tombstone line for an anime
  ID, the bridge MUST NOT drop that anime from the set of records it
  ingests as a hard removal. The anime MUST be carried forward as a
  logically-deleted record (`Activo = 0`, `FechaEliminacion` set) rather
  than disappearing from `anime_snapshots`.
- When a previously-known anime ID is absent from a newly observed
  snapshot set (the legacy "prune" signal), the bridge MUST treat this
  the same way as an explicit `$$deleted` tombstone: convert it to a
  logical delete (`Activo = 0` + `FechaEliminacion` stamped), not a
  physical row removal.
- `ReplaceBaseline` (or its replacement seam) MUST NOT issue a SQL
  `DELETE` against `anime_snapshots` for an anime ID solely because that
  ID is missing from the current snapshot set or tombstoned. The row
  for that `anime_id` MUST remain present in `anime_snapshots`, with its
  `snapshot_json` updated to reflect `Activo = 0` and a stamped
  `FechaEliminacion`.
- A logical delete MUST still produce a `modified_at` advance for that
  anime (`specs/anime-modified-at`) since it is an accepted change to
  the canonical snapshot, observed via the same watcher/catch-up path as
  any other desktop-observed change.
- `FechaEliminacion` MUST be set when a record transitions from
  `Activo = 1` to logically deleted, using the same legacy
  `LegacyDateField` representation already defined on `LegacyAnimeRaw`
  (`internal/anime/domain/anime_raw.go`).
- A record that is already logically deleted (`Activo = 0`) and is
  tombstoned/absent again MUST remain logically deleted; the bridge MUST
  NOT error, MUST NOT re-stamp `FechaEliminacion` if it already has a
  consistent value (idempotent re-observation), and MUST NOT physically
  remove the row.
- Downstream readers (mobile list endpoints, `ListAnimeItems`,
  `ListMobileAnimes`, sync changelog consumers) MUST continue to honor
  `Activo = 0` as the signal that a record is logically deleted; this
  spec does not change their filtering contract, only guarantees the
  underlying row they would filter on is never physically destroyed.
- This capability MUST NOT reintroduce a hard-delete path anywhere in
  the ingest pipeline (parser, `DiffSnapshots`, watcher, startup
  catch-up) for `$$deleted`/absent records.

## Scenarios

### Scenario: `$$deleted` tombstone becomes a logical delete
- **Given** `animes.dat` contains an active anime record with
  `_id = "X"`, `Activo = 1`
- **When** the file is rewritten with a `{"$$deleted":true,"_id":"X"}`
  tombstone line for that ID and the bridge ingests the new snapshot
- **Then** the `anime_snapshots` row for `X` still exists
- **And** the row's `snapshot_json` reflects `Activo = 0` and a stamped
  `FechaEliminacion`
- **And** no `DELETE FROM anime_snapshots WHERE anime_id = 'X'` occurs

### Scenario: Anime absent from the current snapshot set becomes a logical delete
- **Given** the bridge's persisted baseline includes an active anime
  record `Y`
- **When** a newly observed snapshot set (file watcher tick or startup
  catch-up) no longer contains any line for `Y` (legacy prune signal)
- **Then** the `anime_snapshots` row for `Y` still exists
- **And** the row reflects `Activo = 0` and a stamped `FechaEliminacion`
- **And** the row is NOT removed from `anime_snapshots`

### Scenario: Logical delete advances the OCC token
- **Given** an anime `Z` with current `modified_at = T1` and `Activo = 1`
- **When** the bridge converts `Z` to a logical delete via the
  `$$deleted`/absence path
- **Then** the anime's `modified_at` advances to a new token `T2`
  (per `specs/anime-modified-at`)

### Scenario: Already-deleted record observed again is idempotent
- **Given** an anime `W` already logically deleted (`Activo = 0`,
  `FechaEliminacion` set to `D1`)
- **When** the bridge observes another snapshot tick where `W` is still
  tombstoned/absent
- **Then** the `anime_snapshots` row for `W` remains present
- **And** `FechaEliminacion` is not corrupted (remains a valid stamped
  value)
- **And** no error occurs

### Scenario: Downstream mobile list still excludes logically-deleted animes
- **Given** an anime `V` logically deleted (`Activo = 0`)
- **When** mobile calls the list/sync endpoint that filters on `Activo`
- **Then** `V` does not appear as an active item in the returned list
- **And** `V`'s row still exists in `anime_snapshots` (verifiable via
  direct query, not via the filtered list contract)
