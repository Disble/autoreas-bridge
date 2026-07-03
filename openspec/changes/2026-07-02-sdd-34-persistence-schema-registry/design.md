# Design — 2026-07-02-sdd-34-persistence-schema-registry

## Context (runtime truth)
`internal/sync/sqlite_bootstrap.go` currently:
- Declares ALL table DDL consts (sync-owned AND download-owned) as package consts.
- `initializeBridgeDB(db)` runs a hand-wired sequence: 4 raw `db.Exec(DDL)` + 6
  `ensure*Schema(db)` introspection functions + index + `seedDefaultHosterPriorityIfEmpty` +
  `ensureAppSettingsSchema`.
- The six `ensure*Schema` functions share one shape: `tableColumns` → create-if-empty → additive
  ALTER for each missing column (except `ensureChangelogSchema`, which also handles a legacy
  rename+rebuild via `migrateLegacyChangelogSchema`).
- Public entry points: `OpenBridgeDB(path)` and `BootstrapBridgeDB()`; the composition root wires
  `a.bootstrapBridgeDB = bridgeSync.BootstrapBridgeDB` (`app_defaults.go:53`).

Import direction today: `sync → download/config` exists; `download` (production) does NOT import
`sync`. So `sync` may reference `download` without a cycle.

## Decision 1 — Neutral `internal/persistence` package holds the type + driver
`TableSchema` and `EnsureTableSchema` live in a new neutral package `internal/persistence` that both
`sync` and `download` import. This is the ONLY new shared dependency and it depends on nothing in the
domain (just `database/sql`), so it cannot create a cycle.

```go
package persistence

type ColumnMigration struct {
    Column   string // column name to test for via PRAGMA table_info
    AlterDDL string // full "ALTER TABLE t ADD COLUMN ..." statement
}

type TableSchema struct {
    Name       string
    CreateDDL  string              // CREATE TABLE IF NOT EXISTS ... (current full shape)
    ColumnAdds []ColumnMigration   // additive migrations, applied in order if column missing
    Indexes    []string            // CREATE INDEX IF NOT EXISTS ... (always ensured)
    // Migrate, when non-nil, FULLY handles an existing table (its live cols are passed in),
    // replacing the default additive-ColumnAdds path. It is the escape hatch for tables whose
    // evolution additive-ALTER cannot express: legacy rename+rebuild (changelog), legacy-detect
    // + reject-unsupported (anime_snapshots), or strict current-shape validation (jd_config).
    Migrate func(db *sql.DB, cols []string) error
}

func EnsureTableSchema(db *sql.DB, t TableSchema) error {
    cols, err := tableColumns(db, t.Name)      // moved here from sync
    if err != nil { return err }
    switch {
    case len(cols) == 0:
        if _, err := db.Exec(t.CreateDDL); err != nil { return err }
    case t.Migrate != nil:
        if err := t.Migrate(db, cols); err != nil { return err }
    default:
        for _, cm := range t.ColumnAdds {
            if !containsColumn(cols, cm.Column) {
                if _, err := db.Exec(cm.AlterDDL); err != nil { return err }
            }
        }
    }
    for _, idx := range t.Indexes {
        if _, err := db.Exec(idx); err != nil { return err }
    }
    return nil
}
```

`tableColumns` and `containsColumn` move from `sync` into `persistence` (they are pure introspection
helpers with no domain coupling). `sync` keeps thin wrappers only if other callers need them.

**Which tables use `Migrate` (idiosyncratic — preserve verbatim as closures) vs declarative
`ColumnAdds`:**
- `Migrate`: `anime_snapshots` (legacy 3-col detect + additive OR reject-unsupported),
  `changelog` (legacy payload-only detect → `migrateLegacyChangelogSchema` rename+rebuild),
  `download_jd_config` (validate `isCurrentDownloadJDConfigSchema` or reject). The existing helper
  functions (`isLegacyAnimeSnapshotsSchema`, `isLegacyPayloadOnlyChangelogSchema`,
  `migrateLegacyChangelogSchema`, `isCurrentDownloadJDConfigSchema`) are REUSED as-is inside these
  closures — no logic re-derivation.
- Declarative `ColumnAdds`: `download_schedule_config` (`enabled_weekdays`), `download_runs`
  (`up_to_date_count`). Pure create-only (no ColumnAdds, no Migrate): `conflicts`, `pairing_tokens`,
  `devices`, `download_hoster_priority`, `app_settings`.

**Test coupling note:** `TestEnsureAnimeSnapshotsSchemaRejectsUnsupportedSchema` calls
`ensureAnimeSnapshotsSchema(db)` directly. Preserve a callable seam (either keep that thin function
as the anime_snapshots descriptor's `Migrate` body, or update the test to drive the descriptor) so
the rejection contract stays covered.

## Decision 2 — Introspection idempotency preserved (NO versioned migrations)
The driver keeps the EXACT semantics of today's `ensure*Schema`: decide by live-column introspection,
never by a `user_version`/migrations-table stamp. Rationale: DBs in the wild have no version marker;
switching to versioned migrations would force a one-time baseline-stamping reconciliation for every
existing DB and risk re-running create/alter on already-present tables. That cost is not justified
now (YAGNI). Versioned migrations remain a future option ONLY if data backfills / multi-table
rewrites appear that introspection cannot cheaply express.

## Decision 3 — Bounded-context schema ownership; assembly in the sync bootstrap
Each context declares its own descriptors:
- `internal/download/schema.go` → `func SchemaTables() []persistence.TableSchema` for
  `download_hoster_priority`, `download_jd_config`, `download_schedule_config`, `download_runs`
  (the runs descriptor carries the `up_to_date_count` ColumnAdd from SDD-34-prev and the
  started-at index).
- `internal/sync/schema.go` → `func SchemaTables() []persistence.TableSchema` for `pairing_tokens`,
  `devices`, `conflicts`, `anime_snapshots`, `changelog` (with `IsLegacy`/`CustomMigrate`),
  `app_settings`.

`initializeBridgeDB` becomes a thin driver loop over the assembled set:
```go
tables := append(sync.schemaTables(), download.SchemaTables()...)
for _, t := range tables {
    if err := persistence.EnsureTableSchema(db, t); err != nil { return err }
}
if err := seedDefaultHosterPriorityIfEmpty(db); err != nil { return err } // data seed, not schema
```
`sync` importing `download` is cycle-free (download never imports sync) and REMOVES the boundary
leak: download now DEFINES its own tables; sync only aggregates them. The public `BootstrapBridgeDB`
/ `OpenBridgeDB` API and the `app_defaults.go` wiring stay UNCHANGED.

**Rejected alternative:** assembling in `app.go` (the strict composition root) by changing the
`bootstrapBridgeDB` seam to accept `[]TableSchema`. More invasive (touches the app wiring + the seam
signature) for equal cycle-safety; deferred.

## Decision 4 — Seeds and pragmas stay explicit
`seedDefaultHosterPriorityIfEmpty` (data, not schema) and `applyBridgePragmas` (connection-level) are
NOT descriptors. They remain explicit steps in `initializeBridgeDB`, ordered after schema ensure.

## Migration mapping (old → new)
| Current | Becomes |
|---|---|
| `animeSnapshotsDDL` + `ensureAnimeSnapshotsSchema` (+ legacy ALTER) | `sync` descriptor with `modified_at` ColumnAdd |
| `changelogDDL` + `ensureChangelogSchema` + `migrateLegacyChangelogSchema` | `sync` descriptor with `IsLegacy`=`isLegacyPayloadOnlyChangelogSchema`, `CustomMigrate`=`migrateLegacyChangelogSchema` |
| `conflictsDDL`, `pairingTokensDDL`, `devicesDDL` (raw Exec) | `sync` descriptors, no ColumnAdds |
| `downloadHosterPriorityDDL` (raw Exec) | `download` descriptor |
| `downloadJDConfigDDL` + `ensureDownloadJDConfigSchema` | `download` descriptor (no ColumnAdds today) |
| `downloadScheduleConfigDDL` + `ensureDownloadScheduleConfigSchema` | `download` descriptor with `enabled_weekdays` ColumnAdd |
| `downloadRunsDDL` + `ensureDownloadRunsSchema` + `downloadRunsStartedAtIndexDDL` | `download` descriptor with `up_to_date_count` ColumnAdd + started-at Index |
| `ensureAppSettingsSchema` | `sync` descriptor |

## Testing strategy (Strict TDD)
1. RED first: unit-test `EnsureTableSchema` directly in `internal/persistence` — create-fresh,
   additive-add-missing, no-op-when-current, custom-migrate-on-legacy — with an in-memory sqlite DB.
2. The existing `sqlite_bootstrap_tables_test.go` and `sqlite_bootstrap_migrations_test.go` are the
   REGRESSION NET: they assert the full table/column set and every legacy migration (schedule
   weekdays, anime_snapshots, changelog, download_runs up_to_date_count). They MUST pass unchanged
   after the refactor — that is the proof behavior is preserved.
3. Package-level: `go test ./internal/persistence/... ./internal/sync/... ./internal/download/...`
   plus the full suite + pre-commit gate (gofmt, golangci-lint, filesize).

## Risks / mitigations
- **Cycle**: mitigated by the neutral `persistence` package + cycle-free `sync → download` direction.
- **Changelog rewrite**: first-class `CustomMigrate`/`IsLegacy` hooks, not forced into additive path.
- **Behavior drift**: the untouched regression tests catch any divergence; coverage on
  `internal/sync` must not drop.
- **File-size**: `sqlite_bootstrap.go` drops well under 400 effective lines; descriptor data now
  lives in each context's `schema.go` (small, cohesive, per-context).
