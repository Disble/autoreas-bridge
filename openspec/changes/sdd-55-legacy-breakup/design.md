# Design: SDD-55 Legacy Breakup (Full Cold Cut)

## Technical Approach

Sever every runtime tie to the Legacy Delphi app (`animes.dat`) and make Bridge
the sole owner of its anime state in SQLite, delivered as four auto-chained,
independently shippable slices. Each slice compiles and passes `go test ./...`,
`golangci-lint run`, and `go run ./tools/checkgofilesize` on its own.

The design is anchored on one runtime fact verified against the code, which
refines the proposal's mental model (recorded as drift below, per CLAUDE.md
rule 2):

> **SQLite is already the write-authoritative store.** The write path stages an
> operation, appends to `animes.dat`, then **finalizes by upserting
> `anime_snapshots` in SQLite** (`internal/sync/write_base_store.go`
> `finalizeWriteOperation`, lines 235-267). Reads already come only from
> `anime_snapshots` (`AnimeSnapshotStore` + `anime.QueryService`). The
> `animes.dat` append is a **writeback side-effect**, and `startup_catchup` /
> `watcher` / `snapshot` reconcile are an **inbound projection** of external
> Legacy edits into SQLite. Neither is the source of truth for reads.

Consequence for slicing: cutting the runtime channel (Slice A) is a matter of
(1) removing the inbound projection (watcher/catch-up/reconcile/ownership
arbitration) and (2) removing the outbound append step from the write
orchestration — **without touching the Stage→Finalize→Publish SQLite path**,
which is already native and crash-safe.

### Drift recorded: `internal/anime/legacy/` is not a pure deletable adapter

The proposal and exploration frame `internal/anime/legacy/` (~28 files) as a
byte-compat adapter to delete wholesale once Slice A leaves it unreferenced.
The code disagrees on a load-bearing subset:

- `anime_snapshots.snapshot_json` stores each anime as **Legacy-shaped NeDB
  canonical JSON** (Spanish keys: `nrocapvisto`, `estado`, `activo`, `dia`,
  `orden`, …). The read path (`Gateway.List`/`Get` → `decode` → `mapper.ToDomain`)
  and the write path (`updateOnce` → `mapper.Merge` → `MarshalJSON` →
  Stage/Finalize) both go through `legacy`'s `AnimeRaw` codec. That codec is the
  **active SQLite persistence engine**, not dead Legacy interop.
- The `bridge-native-persistence` spec requires *"Existing SQLite Data Survives
  the Cut Unmodified"* with **additive-only** migrations, and the
  `episode-vocabulary` spec explicitly keeps `LegacyAnimeRaw` and its `.dat`
  byte-compat fields **Spanish and unrenamed**. Deleting the codec would force a
  non-additive rewrite of every stored `snapshot_json` blob — out of scope.

**Resolution:** Slice B splits the package. Delete the genuine `animes.dat`
file-channel I/O; **retain and relocate** the canonical JSON codec + SQLite
write-operation orchestration into a native, non-"legacy"-named home. The
`AnimeRaw` storage shape and its Spanish keys survive as Bridge's own storage
format (permitted verbatim by the episode-vocabulary spec).

## Architecture Decisions

### ADR-55-1: Cold cut severs the writeback append, not the SQLite write path

**Decision.** In Slice A, remove the outbound `animes.dat` append from the write
orchestration and delete the inbound projection, keeping the existing
Stage→Finalize(SQLite)→Publish sequence intact.

The write orchestration currently is (`legacy` gateway `persist`):

1. `Operations.Stage(op)` — durable staged row in `anime_write_operations`
2. `append(ctx, filePath, desired)` — **append to `animes.dat`** ← remove
3. `Operations.Finalize(op)` — upsert `anime_snapshots` (SQLite authoritative)
4. `DrainOutbox` — publish `anime.changed`

Dropping step 2 leaves a crash-safe SQLite-only path: a staged op that never
finalizes is replayed by `RecoverWrites` at startup (Finalize is idempotent on
`operation_id`). No new persistence primitive is required.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep append, guard by flag | Leaves dead Legacy I/O + config surface, fails spec "zero file references" | Rejected |
| Replace file writer with SQLite-write "writer" | Redundant — Finalize already writes SQLite | Rejected |
| Drop the append step; rely on existing Stage→Finalize | No new code, crash-safe, satisfies spec | **Chosen** |

**Rejected alternative — rewrite the write engine natively now.** Replacing the
`AnimeRaw` merge/codec with a native domain-to-columns writer in this change
would be a large, high-risk rewrite plus a non-additive data migration. Deferred;
the codec is retained as-is (ADR-55-3).

### ADR-55-2: First boot on empty SQLite is a cold empty state (no import)

**Decision.** Startup no longer resolves or waits for `animes.dat`. Bootstrap
opens SQLite (creating the schema if absent) and serves whatever rows exist —
including zero. There is no import, seed, or catch-up.

Today `startup` calls `resolveAnimeDataPath()` and `startAnimeObservers` blocks
in `startupCoordinator.runAttempt`, polling until the file exists ("Esperando
datos"). After the cut, `resolveAnimeDataPath`, the coordinator, and the poll
loop are removed. `initializeBridgeDatabase` already creates the schema
(`anime_snapshots` DDL is `CREATE TABLE IF NOT EXISTS`), so an empty DB yields
an empty catalog, not a boot error. This is the intended, documented product
behavior (README mission rewrite, Slice D).

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One-time `animes.dat` import on first empty boot | Re-introduces a Legacy read path; violates spec "No Import Path" | Rejected |
| Ship a separate import CLI | Same violation; spec forbids any import tool | Rejected |
| Cold empty state, SQLite-only | Matches spec + product decision | **Chosen** |

### ADR-55-3: Split `internal/anime/legacy/`, retain the JSON codec natively

**Decision.** Slice B partitions the package into *removable file-channel* files
and *retained persistence-codec* files. Delete the former; relocate the latter
to a native package (proposed `internal/anime/store` — final name a task-level
choice) and drop the "legacy" naming/rationale, keeping the `AnimeRaw` Spanish
storage keys verbatim.

| `legacy/` file | Role | Slice B action |
|---|---|---|
| `wire.go`, `wire_validation.go`, `mapper.go`, `projection.go`, `create.go` | `AnimeRaw` JSON codec + domain mapping (read+write) | **Retain**, relocate/rename |
| `gateway.go`, `gateway_write_helpers.go`, `gateway_contracts.go` | Load/decode + `updateOnce`/`persist` orchestration | **Retain** the decode/merge/stage/finalize path; **delete** the `Append`/`FilePath` port and file-append branch |
| `outbox.go` | Deferred `anime.changed` publication (SQLite outbox) | **Retain** (SQLite, not file) |
| `file_mutation.go` | `WithExclusiveFileMutation` OS file lock | **Delete** (file channel) |
| `batch.go`, `batch_durability_*` | Full-file `animes.dat` replacement journal | **Delete** (file channel) |
| `append_error.go` | Definite/ambiguous **append** error taxonomy | **Delete** file-specific pieces; keep any error re-exported by the retained staging path only if still referenced |
| `recovery.go` | Staged-write + file-append recovery | **Retain** the staged-op replay; **delete** the file-append recovery branch |

The anime-package re-export shims (`write_base_store.go`, `legacy_gateway_config.go`,
`writer.go`, `snapshot.go`, `parser.go`, `mobile.go`, `service.go`,
`editor_service.go`, `schedule_service*.go`) are updated to import the relocated
package; file-channel-only shims (`writer.go` append writer, `parser.go` `.dat`
parser) are deleted.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Delete `legacy/` wholesale (proposal's literal framing) | Breaks SQLite read/write; forces non-additive blob rewrite | Rejected |
| Keep package but rename to `nedb`/`store`, prune file I/O | Honest: names the retained codec, removes only dead file paths | **Chosen** |
| Rewrite storage to native English columns | Large, risky, non-additive; out of scope | Rejected (see ADR-55-1) |

### ADR-55-4: Slice C English-ifies only the unstored boundaries; storage stays additive

**Decision.** Slice C English-ifies the two Spanish surfaces that are *not* the
stored blob: (1) the `spanishWeekdayNames` weekday-matching vocabulary in
`internal/download/config/defaults.go`, and (2) the mobile wire fields in
`docs/openapi.yaml`. Stored `snapshot_json` Spanish keys and ADR-007 runtime
data literals (`"Ver hoy"`, `"Visto"`, …) are preserved.

Because an anime's schedule days are stored inside `snapshot_json` as Spanish
literals (`"dias":["Lunes"]`), the weekday rename cannot simply swap the map
values (that would break "airing today" matching against stored data). Per the
`episode-vocabulary` spec, the migration is **additive**: introduce an
English-domain weekday representation, add it alongside the existing Spanish
values via an idempotent SQLite migration, and switch domain comparison to read
the English representation. Existing Spanish values are never dropped or renamed.

| Concern | Strategy |
|---|---|
| `spanishWeekdayNames`/`SpanishWeekdayName` identifiers | Rename to English domain terms (`Monday`…`Sunday`); no exported Spanish symbol remains in `internal/download` |
| Stored `dias` Spanish literals | Additive English-domain representation via idempotent migration; Spanish values preserved |
| openapi `nrocapvisto`/`estado`/`activo`/`dia`/`orden` | Add English aliases additively; keep Spanish fields until mobile migrates; announce in `docs/openapi.yaml` |
| `snapshot_json` internal Spanish keys | **Unchanged** — Bridge storage format; rewriting is non-additive, out of scope |

### ADR-55-5: Deletion order guarantees a green build at every slice boundary

**Decision.** Order the work A → B → C → D so no slice references a symbol a
prior slice removed.

- **A** removes inbound projection + outbound append and their tests. The
  `legacy/` codec is still imported (reads/writes), so it stays. Build green:
  writes finalize to SQLite, reads unchanged.
- **B** deletes file-channel files and relocates the codec **only after** A has
  removed every file-channel caller. The compiler + `go test ./...` prove no
  dangling reference before deletion completes.
- **C** is additive migrations + identifier/wire renames; depends on B's stable
  package layout.
- **D** removes the `legacy_boundary` linter, legacy specs, and rewrites docs —
  safe last because it deletes governance that described A–C's now-absent code.

## Component Map & Data Flow

### Before (bridge)

```
Legacy Delphi ──writes──▶ animes.dat
                             │
      ┌──────────────────────┼───────────────────────┐
      ▼                      ▼                        ▼
startup_catchup        runtime watcher          (self-echo filter)
  (poll+parse)          (fsnotify)                     │
      └───────── ReplaceBaseline / DiffSnapshots ──────┘
                             │  + bridge_native_registry (ownership arbitration)
                             ▼
                     anime_snapshots (SQLite) ◀── Finalize(write op)
                             ▲                        ▲
        reads (QueryService) │                        │ Stage→append(animes.dat)→Finalize
                             │                        │
                        REST/WS/Wails ◀── WriteService/EditorService/ScheduleService
```

### After (SQLite-only owner)

```
        REST / WS / Wails
              │
   reads ─────┤────── writes
              ▼                 ▼
     anime_snapshots ◀── Stage ─▶ Finalize(anime_snapshots) ─▶ publish anime.changed
        (SQLite)              (anime_write_operations, crash-safe replay)
              ▲
       QueryService
```

No watcher, no catch-up, no reconcile, no ownership arbitration, no file I/O.

### Startup sequence — after the cut

```
Wails runtime          App.startup             SQLite bootstrap        Runtime services
     │                     │                         │                       │
     │──startup(ctx)──────▶│                         │                       │
     │                     │──configureTray─────────▶│                       │
     │                     │──initializeBridgeDB────▶│                       │
     │                     │   (CREATE IF NOT EXISTS)│                       │
     │                     │◀──*sql.DB, schema ready─│                       │
     │                     │──ensureDownloadStore────────────────────────────│
     │                     │──configureRuntimeServices(ctx)─────────────────▶│
     │                     │     • wire QueryService (reads anime_snapshots)  │
     │                     │     • wire WriteService  (Stage→Finalize→Publish)│
     │                     │     • recoverStagedAnimeWrites (replay if any)   │
     │                     │     • startHTTPServer                            │
     │                     │──startDownloadOrchestration─────────────────────│
     │                     │──startSeasonAvailability────────────────────────│
     │◀────ready (serves empty or populated catalog)────────────────────────│
```

Removed vs today: `resolveAnimeDataPath`, `prepareAnimeRuntime`'s file writer,
`startAnimeObservers` (coordinator + legacy pull + watcher),
`restoreBridgeNativeAnimeState`, the "Esperando datos" wait loop.

### Write sequence — after the cut

```
Client        WriteService        store codec         WriteBaseStore(SQLite)      Bus
  │──patch──────▶│                     │                       │                   │
  │              │──decode/merge──────▶│ (AnimeRaw codec)      │                   │
  │              │◀──desired JSON──────│                       │                   │
  │              │──Stage(op)──────────────────────────────────▶│                  │
  │              │──Finalize(op) upsert anime_snapshots─────────▶│                  │
  │              │──DrainOutbox────────────────────────────────▶│──publish────────▶│
  │◀──Applied────│                                                                  │
```

## Slice-by-Slice File Changes

### Slice A — Cut the runtime channel

| File | Action | Note |
|---|---|---|
| `internal/anime/watcher.go`, `snapshot.go`, `startup_catchup.go`, `snapshot_pull_pipeline.go` + tests | Delete | Inbound projection |
| `internal/anime/bridge_native_registry.go`, `restore_bridge_native.go`, `manual_pull.go` + tests | Delete | Ownership arbitration + one-shot pull |
| `internal/sync/bridge_owned_store.go` (+ `bridge_owned_animes` DDL) | Delete/retire | Only fed the reconcile diff (keep table create as inert no-op if simpler; prefer remove from wiring) |
| `app_startup_runtime.go` (`prepareAnimeRuntime`, `startAnimeObservers`), `app.go` (`restoreBridgeNativeAnimeState`, factories), `app_runtime.go` (`PullAnimesFromLegacy`), `app_runtime_services.go` | Modify | Drop file-writer + observers wiring; write services use append-less orchestration |
| `app_defaults.go`, `internal/anime/paths.go` (`resolveAnimeDataPath`) | Modify/Delete | No `animes.dat` path resolution |
| `internal/anime/legacy` gateway `Append`/`FilePath` usage via `legacy_gateway_config.go` | Modify | Stop wiring the file-append port |
| Frontend `PullAnimesFromLegacy` binding usages | Modify | Remove the manual-pull affordance |

### Slice B — Delete legacy file-channel, relocate codec

| File | Action |
|---|---|
| `internal/anime/legacy/file_mutation.go`, `batch.go`, `batch_durability_*`, file-append parts of `append_error.go`, `recovery.go` + their tests | Delete |
| `internal/anime/legacy/{wire,wire_validation,mapper,projection,create,gateway,gateway_write_helpers,gateway_contracts,outbox}.go` | Relocate/rename to native package; strip `Append`/`FilePath` |
| `internal/anime/parser.go` (`.dat` parser), `writer.go` (file appender) + tests | Delete |
| `internal/anime/write_base_store.go`, `legacy_gateway_config.go`, `mobile.go`, `service.go`, `editor_service.go`, `schedule_service*.go` | Modify imports to relocated package |
| `resources/autoreas-data/animes.dat` | Delete |
| `internal/anime/legacy/*_test.go`, `parser_test.go`, `watcher_*_test.go`, `startup_catchup_*_test.go`, `writer_*_test.go`, `legacy_boundary_test_helpers_test.go` | Delete (see test strategy) |

### Slice C — English-ify unstored Spanish boundaries (additive)

| File | Action |
|---|---|
| `internal/download/config/defaults.go` | Rename `spanishWeekdayNames`/`SpanishWeekdayName` → English domain weekday terms |
| download-selection comparison logic (callers of `SpanishWeekdayName`) | Read English representation |
| new SQLite migration (in `internal/sync` schema/migration registry) | Additive English-domain schedule-day representation; idempotent |
| `docs/openapi.yaml` | Additive English wire aliases; mobile announcement block |

### Slice D — Docs & governance

| File | Action |
|---|---|
| `tools/checkarchitecture/legacy_boundary.go` + `legacy_boundary_*_test.go` | Delete; deregister from pre-commit/CI gate list |
| `openspec/specs/{anime-legacy-raw,legacy-gateway,anime-snapshot-parser,append-only-safe-writer,windows-resilient-file-watcher}/spec.md` | Retire |
| `README.md`, `AGENTS.md` | Rewrite mission → SQLite-only owner |
| `docs/adr/007-english-code-spanish-boundaries.md` | Mark superseded; note retained storage-format Spanish keys |
| `CLAUDE.md` project notes referencing `animes.dat` as source of truth | Update |

## Migration Design (Slice C)

- **Additive, idempotent.** Register the schedule-day migration in the existing
  `internal/sync` migration/schema-table registry (same mechanism as the
  `anime_snapshots.modified_at` additive column in `schema_tables.go`). Detect
  presence of the English-domain representation; skip if present (no-op re-run).
- **Never drop/rename.** Existing Spanish `dias` values inside `snapshot_json`
  and any Spanish-valued columns are preserved byte-for-byte.
- **Representation choice (task-level).** Either (a) a computed English mapping
  applied at read time in the download-selection domain (no stored change,
  purely code — simplest, still satisfies "reads English representation"), or
  (b) a stored English sidecar. Prefer (a) unless a scenario needs persistence;
  both keep Spanish data intact. The migration registry entry exists regardless
  so the idempotence scenario has a concrete target.
- **Wire compatibility.** openapi English fields are **added alongside** Spanish
  fields; mobile migrates on its own schedule. No versioned rename until mobile
  confirms. Announce in `docs/openapi.yaml` per the "API consumers need doc
  announcements" convention.

## Test Strategy (Strict TDD, `go test ./...`)

New behavior tests are written **first** (RED) before the corresponding removal
or migration.

| Slice | New tests (write first) | Tests deleted |
|---|---|---|
| A | Boot with **no** `animes.dat` present succeeds and serves catalog; boot on **empty** SQLite serves empty catalog (no panic, no wait); write patch finalizes to `anime_snapshots` with **no file I/O**; shutdown starts no watcher goroutine | `watcher_*`, `startup_catchup_*`, `snapshot_*`, `restore_bridge_native_*`, `manual_pull_*`, `app_startup_bridge_native_test.go`, writeback-append assertions |
| B | Codec round-trip (decode→merge→encode) on real stored `snapshot_json` shapes preserves unknown Spanish keys byte-for-byte, run against a **copied** real fixture shape (not `animes.dat`); package relocation keeps read/write green | `legacy/*_test.go` file-channel suites (`batch_durability_*`, `gateway_*` file-append paths), `parser_test.go`, `writer_*_test.go` |
| C | Migration idempotence (re-run is no-op) on a DB seeded with Spanish `dias`; existing rows preserved unchanged; "airing today" matches via English representation; openapi English aliases present additively | (none removed; additive) |
| D | Gate list no longer registers `legacy_boundary`; `go test ./...` + `golangci-lint run` + `checkgofilesize` green without it | `legacy_boundary_*_test.go` |

Boundary discipline (bridge-testing skill): the Slice B codec round-trip test is
the strictest credible boundary for the retained persistence engine — use real
stored-shape JSON (cloned into `t.TempDir()`, never mutate real fixtures) to
prove the additive-preservation contract, since GREEN on synthetic blobs would
lie about real Spanish-key coverage.

## Threat Matrix

Removal-only + additive SQLite migrations + internal wiring. No new shell,
subprocess, VCS/PR automation, external-network, or auth/permission surface is
introduced. The removed `animes.dat` file I/O **reduces** filesystem attack
surface. Migration is additive and idempotent (no destructive DDL). Wire changes
are additive and coordinated. Risk classification: low; no security lens
required beyond the standard reliability review of the write-path change.

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| Proposal's "delete `legacy/` wholesale" taken literally would break SQLite read/write | ADR-55-3 splits the package; codec retained. Flagged as the #1 design correction |
| Removing the append but leaving `snapshot_json` Spanish-keyed leaves "legacy" naming that misleads future readers | Slice B renames package + Slice D supersedes ADR-007 with the retained-storage-format rationale |
| Weekday English-ification breaks "airing today" if it swaps map values against stored Spanish `dias` | ADR-55-4 additive representation; comparison reads English, stored Spanish preserved |
| Deletion slices exceed the 400-line review budget | Deletion-only diffs are low review cost; request `size:exception` per slice as the proposal anticipates |
| Mobile breaks on wire change | Additive aliases only; announce in `docs/openapi.yaml`; no Spanish field removed this change |

**Open questions (task-level, no wire impact):**

- [ ] Final name/location for the relocated codec package (`internal/anime/store`
      vs keep in `internal/anime`).
- [ ] Slice C schedule-day representation: read-time mapping (preferred) vs
      stored sidecar — decide when tasks pin the download-selection call site.
- [ ] Whether `bridge_owned_animes` table create is removed from bootstrap or
      left inert (no reader after Slice A); prefer removal for cleanliness.
