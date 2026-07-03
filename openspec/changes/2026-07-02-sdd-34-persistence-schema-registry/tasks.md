# Tasks — 2026-07-02-sdd-34-persistence-schema-registry

Strict TDD: write/adjust the failing test FIRST in each step, then implement to green. The existing
`sqlite_bootstrap_tables_test.go` + `sqlite_bootstrap_migrations_test.go` are the regression net and
MUST stay green throughout.

## Phase 0 — Baseline
- [x] Run `go test ./internal/sync/... ./internal/download/...` and confirm GREEN before any change.

## Phase 1 — Neutral driver (`internal/persistence`)
- [x] RED: `internal/persistence/schema_test.go` — `TestEnsureTableSchemaCreatesFreshTable`,
      `TestEnsureTableSchemaAddsOnlyMissingColumns`, `TestEnsureTableSchemaNoOpWhenCurrent`,
      `TestEnsureTableSchemaRunsCustomMigrateForLegacyShape`, `TestEnsureTableSchemaEnsuresIndexes`.
- [x] GREEN: `internal/persistence/schema.go` — `TableSchema`, `ColumnMigration`,
      `EnsureTableSchema`, plus `tableColumns`/`containsColumn` moved here.

## Phase 2 — Download context owns its descriptors
- [x] `internal/download/dbschema/schema.go` — `SchemaTables()` returning the 4 download_* descriptors
      (hoster_priority, jd_config, schedule_config with `enabled_weekdays` add, runs with
      `up_to_date_count` add + started-at index). Note: placed in `internal/download/dbschema` sub-package
      (not `internal/download`) to avoid an import cycle with download's in-package test files
      that import sync.
- [x] Keep DDL strings co-located in `download/dbschema/schema.go`.

## Phase 3 — Sync context owns its descriptors
- [x] `internal/sync/schema.go` — `schemaTables()` returning pairing_tokens, devices, conflicts,
      anime_snapshots (`modified_at` add), changelog (`IsLegacy` + `CustomMigrate`), app_settings.
- [x] Keep `migrateLegacyChangelogSchema` + `isLegacyPayloadOnlyChangelogSchema` reachable as the
      changelog descriptor's hooks.

## Phase 4 — Slim the bootstrap
- [x] Rewrite `initializeBridgeDB` to: pragmas → loop `persistence.EnsureTableSchema` over
      `append(schemaTables(), dbschema.SchemaTables()...)` → `seedDefaultHosterPriorityIfEmpty`.
- [x] Delete the six now-dead `ensure*Schema` functions and the migrated DDL consts from
      `sqlite_bootstrap.go`. Add test-only seam wrappers in `sqlite_bootstrap_helpers_test.go`
      for `ensureAnimeSnapshotsSchema`, `ensureDownloadJDConfigSchema`,
      `ensureDownloadScheduleConfigSchema` to keep existing test callsites green.
- [x] Confirm `sync` imports `download/dbschema` (not `download` importing `sync`); no cycle.

## Phase 5 — Verify (orchestrator)
- [x] `sqlite_bootstrap_tables_test.go` + `sqlite_bootstrap_migrations_test.go` GREEN unchanged (assertions untouched; only helpers_test.go gained seam wrappers).
- [x] `go test ./...` GREEN; coverage on `internal/sync` 72.5% → 72.9% (not regressed).
- [x] `go run ./tools/checkgofilesize` — `sqlite_bootstrap.go` 459 → 174 effective lines (out of warning band); no new file over 400.
- [x] golangci-lint clean on persistence/download/sync; no import cycle (dbschema imports only persistence).

## Phase 6 — Close
- [x] Orchestrator created the commit `6a82271` (`refactor(persistence): data-driven schema registry`); full pre-commit gate green.
- [ ] Archive DEFERRED: matching repo practice, recent changes (e.g. sdd-33) stay in `openspec/changes/` post-implementation until a later archive pass (typically post-merge). Delta spec at `specs/persistence-schema/spec.md` to be merged into `openspec/specs/` at archive time.
