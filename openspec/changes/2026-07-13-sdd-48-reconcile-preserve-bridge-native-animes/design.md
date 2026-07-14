# Design — sdd-48-reconcile-preserve-bridge-native-animes

## Problem shape (verified against code)

The startup catch-up reconcile and the runtime watcher BOTH call the same pure
diff, `DiffSnapshots(current, baseline)` (`internal/anime/snapshot.go:76`), from
two call sites: `runSnapshotPullPipeline` (`snapshot_pull_pipeline.go:47`, used by
the `StartupCoordinator` catch-up AND the legacy pull) and the runtime watcher
(`watcher.go:262`). When a baseline id is absent from the freshly parsed Legacy
`animes.dat`, the diff force-soft-deletes it (`snapshot.go:110-142`: stamps
`Activo=false` + `FechaEliminacion`) with NO exemption. Legacy rewrites
`animes.dat` wholesale on its own saves and drops Bridge-native rows, so every
Bridge-created anime is doomed to soft-delete on the next reconcile — at startup
AND at runtime, because both paths share the diff.

Critical verified nuance the proposal under-stated: the bug is NOT startup-only.
`watcher.go:262` runs the identical soft-delete every time Legacy touches the file
during a session. The ownership exemption MUST reach both call sites, not just the
`StartupCoordinator`.

## Architecture at a glance

```
                 bridge.db (additive)
                 ┌─────────────────────────┐
                 │ bridge_owned_animes      │  <- NEW ownership registry
                 │   anime_id TEXT PK        │
                 └─────────────────────────┘
                          ▲            ▲
        RegisterOwned()   │            │  ListOwnedIDs()
                          │            │
   WriteService.CreateAnime      snapshot pull pipeline  +  runtime watcher
   (register-first)              (load ownedIDs, pass into pure diff)
                          │            │
                          ▼            ▼
                 DiffSnapshots(current, baseline, ownedIDs)  <- still a PURE diff
```

The ownership set is a small, additive `bridge.db` table. A new consumer-defined
port (`BridgeNativeRegistry`) in the `anime` package exposes read (`ListOwnedIDs`)
and write (`RegisterOwned`); the implementation lives in `internal/sync` next to
`AnimeSnapshotStore`. `DiffSnapshots` gains one parameter and stays pure: it never
touches the DB — the coordinator/watcher load the owned-id set and pass it in.

---

## ADR-48-1 — Ownership set lives in an additive `bridge.db` table, not the canonical JSON

**Decision.** Track Bridge-native anime ids in a new additive table
`bridge_owned_animes(anime_id TEXT PRIMARY KEY)` in `bridge.db`, registered through
the SDD-34 schema registry (`internal/sync/schema.go` `schemaTables()`), create-only
(no `ColumnAdds`, no `Migrate`).

**Rationale.**
- The reconcile diffs the Legacy canonical JSON, which round-trips to `animes.dat`
  via `LegacyAnimeRaw.MarshalJSON`. Adding an ownership marker to that shape would
  ship a Bridge-only field into a file Legacy rewrites wholesale — Legacy may drop
  it (so it would not survive) or choke on an unknown field. Rejected.
- A separate table is orthogonal source-of-truth-free metadata: it holds no anime
  state, only a hint the reconcile consults. Dropping it on rollback is safe (no
  destructive migration) and leaving it unread restores original behavior. This is
  exactly the SDD-34 additive-table discipline already used by
  `download_*`/`season_*`/`app_settings`.
- **Rejected: coupling to `season_animes`.** The reconcile is an `anime`-package
  concern; teaching it to query the `season` package to learn "is this row
  season-created?" would invert the dependency direction (season already depends on
  anime via `AnimeGateway`) and leak season semantics into the sync/reconcile
  layer. Ownership is a first-class anime-domain fact — a season create is one
  producer of it, but the reconcile must not know about seasons. Keeping the
  registry in `anime`/`sync` keeps the reconcile decoupled from `season`.

**Schema descriptor (mirrors the existing `schemaTables()` entries):**

```go
const bridgeOwnedAnimesDDL = `
    CREATE TABLE IF NOT EXISTS bridge_owned_animes (
        anime_id TEXT PRIMARY KEY
    )`

// appended to schemaTables() in internal/sync/schema.go
{
    Name:      "bridge_owned_animes",
    CreateDDL: bridgeOwnedAnimesDDL,
}
```

`initializeBridgeDB` already loops `persistence.EnsureTableSchema` over
`schemaTables()` (`sqlite_bootstrap.go:117-124`); no wiring change beyond one entry.

---

## ADR-48-2 — `DiffSnapshots` stays pure; the owned-id set is passed in

**Decision.** Extend the diff signature to accept the owned-id set explicitly:

```go
// snapshot.go — before:
func DiffSnapshots(current, baseline map[string]SnapshotRecord) ([]events.AnimeChangedEvent, []string)

// after:
func DiffSnapshots(current, baseline map[string]SnapshotRecord, ownedIDs map[string]struct{}) ([]events.AnimeChangedEvent, []string)
```

(Note: the proposal sketched `DiffSnapshots(baseline, current, ownedIDs)`; the real
signature is `current`-first — the design keeps the existing order and appends the
new parameter to minimize call-site churn.)

In the soft-delete loop (`snapshot.go:110-142`), the owned check slots next to the
existing already-soft-deleted retain branch — both mean "retain the baseline row
verbatim, do not force a soft-delete":

```go
persisted := baseline[id]
if _, owned := ownedIDs[id]; owned || isSoftDeletedSnapshot(persisted) {
    current[id] = persisted   // carry forward as-is: no Activo flip, no
    continue                  // FechaEliminacion stamp, no modified_at bump, no event
}
```

**Rationale.**
- The diff must not query the DB (its purity is load-bearing: it is unit-tested
  table-driven and reused by three callers). The caller owns I/O; the diff owns
  rules. Passing `ownedIDs` in preserves that contract.
- Retaining `baseline[id]` verbatim is the semantically correct exemption: it
  preserves whatever Bridge's own last state was. An owned row that Bridge itself
  explicitly soft-deleted (via the SoftDelete command) carries a soft-deleted
  baseline snapshot, so "retain verbatim" keeps that tombstone — the explicit
  user-initiated delete path is untouched. Only the *reconcile-absence*
  soft-delete is narrowed, exactly as the proposal scopes it.
- **Rollback = pass `nil`/empty.** A `nil` map makes `_, owned := ownedIDs[id]`
  false for every id, restoring the original soft-delete-on-absence behavior with
  zero code revert. `map[string]struct{}` (not `[]string`) gives O(1) membership
  and a natural nil-safe zero value.

**Seam wiring (both call sites load the set, keeping the diff pure):**

- `snapshotPullPipelineConfig` (`snapshot_pull_pipeline.go:12`) gains an
  `ownership BridgeNativeRegistry` field (nil-safe). Before `DiffSnapshots`, the
  pipeline loads `ownedIDs` (nil registry → nil map → original behavior) and passes
  it in.
- `RuntimeWatcherConfig` (`watcher.go:36`) gains the same `Ownership` field; the
  watcher loads `ownedIDs` right after `w.store.ListSnapshots` (`watcher.go:256`)
  and passes it into `DiffSnapshots` (`watcher.go:262`). This closes the
  runtime-recurrence hole.
- Composition root (`app_startup_runtime.go` `startAnimeRuntime`, lines 130-157)
  constructs one `BridgeNativeRegistry` over `a.bridgeDB` and injects it into the
  `StartupCoordinatorConfig`, `LegacyPullServiceConfig`, and `RuntimeWatcherConfig`.

**Port (consumer-defined in `anime`, implemented in `sync`):**

```go
// internal/anime — new port (mirrors SnapshotStore's location)
type BridgeNativeRegistry interface {
    ListOwnedIDs(ctx context.Context) (map[string]struct{}, error)
    RegisterOwned(ctx context.Context, animeID string) error
}
```

```go
// internal/sync — new BridgeOwnedAnimeStore over *sql.DB (mirrors AnimeSnapshotStore)
// RegisterOwned is idempotent:
//   INSERT INTO bridge_owned_animes (anime_id) VALUES (?) ON CONFLICT(anime_id) DO NOTHING
// ListOwnedIDs:
//   SELECT anime_id FROM bridge_owned_animes  -> map[string]struct{}
```

The pipeline/watcher treat a `nil` registry as "no ownership known" (empty set),
so every existing test and any rollback configuration keeps compiling and behaving
exactly as before.

---

## ADR-48-3 — `CreateAnime` registers ownership register-first, fail-closed

**Decision.** `WriteService.CreateAnime` (`service.go:330-357`) registers the new id
in the ownership registry BEFORE the durable write, via a new nil-safe optional dep
on `WriteServiceDeps` (`service.go:64-77`), and fails the create if registration
fails.

```go
// WriteServiceDeps gains (nil = skip, matching Conflicts/Notifier convention):
Ownership BridgeNativeRegistry

// CreateAnime, after building `raw` and marshaling `payload`, BEFORE applyWrite:
if s.deps.Ownership != nil {
    if err := s.deps.Ownership.RegisterOwned(ctx, id); err != nil {
        return "", fmt.Errorf("register bridge-native anime %q: %w", id, err)
    }
}
if err := s.applyWrite(ctx, id, payload); err != nil {
    return "", err
}
return id, nil
```

**Rationale — order and failure semantics.**
- The durable write (`applyWrite` → `RequestWrite` appends to `animes.dat` +
  `updateConfirmedSnapshot`) is the irreversible part (Legacy semantics: soft-delete
  only). The two possible inconsistent states are asymmetric:
  - **written-but-unregistered** → the exact bug: the next reconcile soft-deletes
    the row because it is absent from Legacy and not owned. DANGEROUS.
  - **registered-but-unwritten** → a harmless orphan id in `bridge_owned_animes`.
    The reconcile only consults `ownedIDs` for ids that ALREADY exist in the
    baseline snapshot set; an owned id with no snapshot never appears in a diff.
    Idempotent (PK) and inert.
- Therefore register FIRST: the worst-case failure leaves only the harmless orphan,
  never the doomed record. If registration fails we return the error WITHOUT
  writing — the create simply does not happen, so it "does not corrupt the create."
- **Fail-closed on registration error** (return error, skip the write). Failing
  loud is correct here: the alternative is silently manufacturing a soft-delete-
  doomed anime, reintroducing the very bug this change fixes.
- **Rejected: fail-open after the write** (log a warning, return success). That is
  the dangerous written-but-unregistered state; it would let a rare DB hiccup ship
  a record that vanishes on the next startup — the failure mode is invisible until
  the anime disappears. Rejected.
- **Rejected: register inside `updateConfirmedSnapshot`'s `ReplaceBaseline`
  transaction.** True atomicity is impossible anyway — `animes.dat` is a file
  appended asynchronously through the writer queue, not part of the SQLite tx. And
  threading ownership into `ReplaceBaseline` would couple the snapshot store to the
  ownership concern. Register-first as a distinct step gives the safe ordering
  without false-atomicity coupling.

**Composition-root wiring.** `app_startup_runtime.go:227-232` already calls
`a.animeWrite.SetDeps(...)`; add `Ownership: bridgeNativeRegistry` there so the
season create path (`CreateSeasonAnimes` → `AnimeGateway.CreateAnime` →
`WriteService.CreateAnime`) registers every new season anime going forward. No
change to the `season` package — it never learns about ownership.

---

## ADR-48-4 — One-time restore repair does BOTH activo-flip AND ownership registration, guarded one-shot

**Decision.** A dedicated, idempotent, one-shot startup repair restores the two
known casualties (`P7y6ZIbvbYkefA7t`, `WEh5Vro3gKMGhY6i`). For each id that exists
in the snapshot store and is currently soft-deleted it MUST do BOTH:

1. **(a) Reactivate** — rewrite the snapshot's canonical JSON with `Activo=true`
   and `FechaEliminacion` cleared (reuse `domain.LegacyAnimeRaw.SetActivo(true)` +
   `ClearFechaEliminacion`), bump `modified_at` (so mobile/realtime pick up the
   un-delete), and persist via `snapshotStore.ReplaceBaseline`. Chapters reads from
   the snapshot store (`ListSnapshots`), so this alone makes them reappear.
2. **(b) Register ownership** — `RegisterOwned` both ids in `bridge_owned_animes`.

**Why BOTH is non-negotiable.** If the repair only flips `activo` without
registering ownership, the very next reconcile (startup OR runtime watcher) sees the
ids absent from Legacy `animes.dat`, finds them un-owned, and re-soft-deletes them —
the fix would not stick. Registration is what makes the reactivation durable.

**Guard / "already done" detection — a persisted one-shot flag, NOT state-sniffing.**
The repair is gated by a boolean in the existing `app_settings` KV table
(`key TEXT PK, value TEXT`; missing row = false), e.g. key
`sdd48_bridge_native_restore_done`:

- On startup: if the flag is true → skip entirely.
- Else run the repair for each of the two ids (skip an id that is absent from the
  snapshot store, or already active — no-op), then set the flag true.

**Rationale for the flag over pure state-sniffing.** A naive "if inactive, flip to
active" repair is idempotent but NOT safe across time: if a user LEGITIMATELY
soft-deletes one of these two animes AFTER the repair, a state-sniffing repair would
resurrect it on the next startup, fighting the user's explicit action. The one-shot
persisted flag runs the repair exactly once ever, so it never contends with later
legitimate deletes. The repair is still internally idempotent (safe if it partially
ran and the flag was not yet set): registration is `INSERT ... ON CONFLICT DO
NOTHING`, and reactivation of an already-active row is a no-op.

**Location.** A small `restoreBridgeNativeAnimes` repair in the `anime` package
(new file, e.g. `internal/anime/restore_bridge_native.go`), taking the snapshot
store, the `BridgeNativeRegistry`, a settings reader/writer, and the hard-coded id
list. It is a bridge.db-only data repair (snapshot + ownership); it does NOT write
to `animes.dat` (Legacy would drop it anyway, and ownership now protects the row).
Keeps `season` uninvolved.

---

## ADR-48-5 — Startup ordering: restore (register) BEFORE the async reconcile

**Decision.** Run the one-time restore SYNCHRONOUSLY in the startup sequence,
AFTER `bridge.db` bootstrap + registry construction and BEFORE
`startAnimeRuntime` launches the async `StartupCoordinator` and runtime watcher.

**Verified current flow (`app_startup_runtime.go`).** `startAnimeRuntime` (line 124)
calls `animeStartupCoordinator.StartAsync(catchUpContext)` (line 138) — an async
goroutine that waits for the file, then runs the catch-up reconcile. The runtime
watcher also `StartAsync` (line 158). Both reconcile paths load `ownedIDs` fresh at
diff time.

**Sequence.**

```
initializeBridgeDB(db)                 # creates bridge_owned_animes + app_settings
        │
        ▼
construct BridgeNativeRegistry(a.bridgeDB)   # ownership store over bridge.db
construct snapshotStore(a.bridgeDB)
        │
        ▼
restoreBridgeNativeAnimes(ctx, ...)    # SYNCHRONOUS, one-shot (app_settings-guarded)
   ├─ if flag set -> no-op
   └─ else for each of the 2 ids present & soft-deleted:
        (a) ReplaceBaseline  Activo=true, FechaEliminacion cleared, modified_at bump
        (b) RegisterOwned    -> bridge_owned_animes
        then set app_settings flag = true
        │
        ▼   (registration is now durably committed)
startAnimeRuntime(ctx, animeDataPath)
   ├─ StartupCoordinator.StartAsync   # catch-up reconcile: loads ownedIDs ->
   │                                   #   the 2 restored ids are OWNED -> RETAINED
   └─ runtimeWatcher.StartAsync        # same exemption on every later Legacy rewrite
```

**Rationale.**
- Because both reconcile paths load `ownedIDs` fresh via `ListOwnedIDs` immediately
  before diffing, the ONLY correctness requirement is that the restore's
  registration is committed before that read. Running the restore synchronously
  before `StartAsync` guarantees a strict happens-before, instead of relying on the
  file-poll timing gap (fragile). The restore also flips `activo` before the diff,
  so the reconcile sees active-and-owned rows and retains them verbatim.
- Placement point: in the startup runtime right after `bridge.db` is ready and
  before line 184's `a.startAnimeRuntime(ctx, animeDataPath)`. The registry and
  snapshot store are constructed from `a.bridgeDB`, already available at that point.

---

## Data flow — durable fix at steady state

1. Season create → `CreateSeasonAnimes` → `AnimeGateway.CreateAnime` →
   `WriteService.CreateAnime`: **register id (fail-closed)** → `applyWrite` appends
   to `animes.dat` + confirmed snapshot.
2. Legacy saves and rewrites `animes.dat` wholesale, dropping the Bridge id.
3. Runtime watcher fires → parses `current` (Bridge id absent) → loads `ownedIDs`
   (Bridge id present) → `DiffSnapshots` RETAINS the id (owned) → no soft-delete →
   Chapters keeps showing it.
4. Next Bridge startup → catch-up reconcile: identical retain via `ownedIDs`. The
   record survives indefinitely.

## Affected modules (design-level)

- `internal/anime/snapshot.go` — `DiffSnapshots` gains `ownedIDs map[string]struct{}`;
  owned-id retain branch beside the existing soft-deleted branch.
- `internal/anime/snapshot_pull_pipeline.go` — config gains `ownership`; load
  `ownedIDs`, pass into diff.
- `internal/anime/watcher.go` — `RuntimeWatcherConfig` gains `Ownership`; load +
  pass `ownedIDs` (closes runtime recurrence).
- `internal/anime/service.go` — `WriteServiceDeps.Ownership`; `CreateAnime`
  register-first fail-closed.
- `internal/anime/restore_bridge_native.go` (new) — one-shot guarded restore
  (activo-flip + register).
- `internal/anime` — new `BridgeNativeRegistry` port.
- `internal/sync/schema.go` — `bridge_owned_animes` descriptor in `schemaTables()`.
- `internal/sync/bridge_owned_store.go` (new) — `BridgeOwnedAnimeStore`
  implementation over `bridge.db`.
- `app_startup_runtime.go` — construct registry; inject into coordinator/pull/
  watcher configs and `WriteService.SetDeps`; run the synchronous restore before
  `startAnimeRuntime`.

## TDD focus (tests first, per bridge-debugging skill layers)

- **Table-driven semantic diff** (`snapshot_test.go`): owned id absent from current
  survives (retained active, no event); unowned id absent still soft-deletes;
  owned id present with hash change still emits an update; owned id whose baseline
  is already soft-deleted stays a tombstone (explicit SoftDelete path intact); nil
  `ownedIDs` reproduces pre-change behavior (rollback).
- **CreateAnime** register-first ordering + fail-closed (registration error → no
  write, no id returned); nil `Ownership` dep → unchanged behavior.
- **Restore repair**: idempotent guard (second run is a no-op), does BOTH
  activo-flip AND ownership registration, no-op for absent/already-active ids, and
  the post-restore reconcile does NOT re-soft-delete.
- **Store** (`internal/sync`): `RegisterOwned` idempotency (ON CONFLICT),
  `ListOwnedIDs` round-trip, table created by `initializeBridgeDB`.
