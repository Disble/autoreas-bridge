# Delta for anime-soft-delete

Change: `2026-07-13-sdd-48-reconcile-preserve-bridge-native-animes`
Capability: `anime-soft-delete`

## MODIFIED Requirements

### Requirement: Anime absent from the current snapshot set becomes a logical delete

When a previously-known anime id is absent from a newly observed snapshot
set (the legacy "prune" signal, evaluated by `DiffSnapshots` in
`internal/anime/snapshot.go` during the startup catch-up reconcile), the
bridge MUST convert it to a logical delete (`Activo = 0`, `FechaEliminacion`
stamped) — UNLESS that id is registered in the Bridge-native ownership set,
in which case the bridge MUST NOT logically delete it and MUST leave it
unchanged. A baseline id that is NOT in the ownership set MUST still be
converted to a logical delete on absence, unchanged from prior behavior.
`DiffSnapshots` MUST remain a pure diff function: the ownership set MUST be
supplied by the caller (coordinator/store), never queried internally by the
diff.

The explicit, user-initiated SoftDelete command is a separate path and MUST
keep logically deleting its target regardless of ownership status; only the
reconcile-absence trigger is narrowed by ownership. This requirement does not
change the `$$deleted`-tombstone path, the no-hard-delete invariant, the
`modified_at` advance on logical delete, or the idempotent re-observation
guarantee, which remain as specified elsewhere in this capability.

(Previously: absence from the latest Legacy parse always triggered a
soft-delete for any previously-known id, with no ownership exemption.)

#### Scenario: Owned id survives absence from Legacy parse

- GIVEN a baseline anime `P` is registered as Bridge-native
- WHEN the startup catch-up reconcile runs and `P` is absent from the latest
  `animes.dat` parse
- THEN `P` remains active (`Activo = 1`, no `FechaEliminacion`)
- AND no logical delete is applied to `P`

#### Scenario: Unowned id still soft-deletes on absence

- GIVEN a baseline anime `Q` is NOT registered as Bridge-native
- WHEN the startup catch-up reconcile runs and `Q` is absent from the latest
  `animes.dat` parse
- THEN `Q` is converted to a logical delete (`Activo = 0`, `FechaEliminacion`
  stamped)

#### Scenario: Explicit user-initiated SoftDelete still works

- GIVEN an anime `R`, owned or not
- WHEN a user issues the explicit SoftDelete command against `R`
- THEN `R` is logically deleted regardless of its ownership status

## ADDED Requirements

### Requirement: Ownership registration at anime creation

When `WriteService.CreateAnime` creates a new anime, the bridge MUST register
the new id as Bridge-native in the ownership registry (an additive `bridge.db`
table) as part of completing the create, so subsequent reconciles never treat
the id's absence from `animes.dat` as a deletion signal.

#### Scenario: New anime is registered as owned

- GIVEN `WriteService.CreateAnime` creates a new anime id `N`
- WHEN the create completes
- THEN `N` is present in the Bridge-native ownership registry
- AND a subsequent reconcile that finds `N` absent from `animes.dat` does NOT
  soft-delete `N`

### Requirement: One-time restore of known Bridge-native records

The bridge MUST provide an idempotent, one-time repair that restores
`P7y6ZIbvbYkefA7t` and `WEh5Vro3gKMGhY6i` to active (`Activo = true`,
`FechaEliminacion` cleared) and registers both ids as Bridge-native. Running
the repair when the records are already active, already registered, or
absent MUST be a safe no-op (no error, no duplicate registration).

#### Scenario: Restore reactivates the two known records

- GIVEN `P7y6ZIbvbYkefA7t` and `WEh5Vro3gKMGhY6i` are logically deleted
- WHEN the restore repair runs
- THEN both records have `Activo = true` and `FechaEliminacion` cleared
- AND both ids are registered as Bridge-native

#### Scenario: Restore is idempotent

- GIVEN the restore repair has already run successfully
- WHEN the repair runs again
- THEN no error occurs and the records' state is unchanged

#### Scenario: Restored ids survive a subsequent reconcile

- GIVEN the restore repair has run and registered both ids as Bridge-native
- WHEN the next startup catch-up reconcile runs and finds both ids absent
  from `animes.dat`
- THEN neither record is soft-deleted
- AND both remain active in the Chapters "Sin ver" season filter
