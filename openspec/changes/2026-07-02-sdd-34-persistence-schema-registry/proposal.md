# Proposal — 2026-07-02-sdd-34-persistence-schema-registry

## Why
`internal/sync/sqlite_bootstrap.go` (459 effective lines, in the warning band) grows structurally,
not cosmetically, with every new table. `initializeBridgeDB` is a hand-wired sequence that mixes
three idioms — raw `db.Exec(xxxDDL)`, per-table `ensureXxxSchema(db)` introspection+ALTER functions,
and index/seed steps. Adding a table forces edits in three places (a DDL const, often a new
`ensure*Schema` function, and a new line in the sequence). Worse, the file lives in `package sync`
but defines **download** tables (`download_runs`, `download_jd_config`, `download_schedule_config`,
`download_hoster_priority`) — a bounded-context boundary leak.

The six `ensure*Schema` functions (`ensureAnimeSnapshotsSchema`, `ensureChangelogSchema`,
`ensureDownloadJDConfigSchema`, `ensureDownloadScheduleConfigSchema`, `ensureDownloadRunsSchema`, plus
`ensureAppSettingsSchema`) are near-identical: introspect columns → create-if-empty → additive-ALTER
missing columns. That is duplication disguised as functions, and it is what keeps the file growing.

A file split (like SDD did for `service.go`) is a cosmetic band-aid — it reparts the growth without
stopping it. This change addresses the growth **structurally**.

## What changes
Introduce a **Schema Registry** pattern (data-driven descriptors + one generic driver), keeping the
exact introspection-based idempotency semantics that existing production DBs already rely on:

- New neutral package `internal/persistence`: a `TableSchema` descriptor (name, create DDL, additive
  column migrations, indexes, optional `CustomMigrate` escape hatch) and ONE generic
  `EnsureTableSchema(db, TableSchema)` driver that replaces the six near-identical functions.
- Each bounded context OWNS its schema: `download.SchemaTables()` and `sync.SchemaTables()` each
  return `[]persistence.TableSchema` for their own tables.
- The composition root assembles the combined table list and calls `persistence.Bootstrap(db, ...)`,
  so neither `sync` nor `download` imports the other for schema (no import cycle).
- The one genuinely complex migration (`migrateLegacyChangelogSchema`, a rename+rebuild that
  introspection cannot express) becomes a `CustomMigrate` hook on the changelog descriptor.

## Impact
- New: `internal/persistence/schema.go` (+ tests).
- New: `internal/download/schema.go`, `internal/sync/schema.go` (descriptors moved from bootstrap).
- `internal/sync/sqlite_bootstrap.go` shrinks to pragmas + registry invocation; `initializeBridgeDB`
  becomes a thin loop. Target: well under the 400-line warning band.
- Composition root (`app.go`/bootstrap wiring) assembles descriptors.
- Behavior is UNCHANGED: same tables, same additive migrations, same idempotency. Existing
  `sqlite_bootstrap_tables_test.go` and `sqlite_bootstrap_migrations_test.go` are the safety net and
  MUST stay green; new tests cover the generic driver directly.

## Scope
- IN: the registry package, per-context descriptors, composition-root assembly, bootstrap slim-down.
- OUT: NO switch to versioned migrations (`user_version`/goose) — existing DBs have no version stamp
  and rely on introspection idempotency; that migration-onto-migrations cost is not justified now
  (YAGNI). NO schema/column changes. NO behavior change.

## Risks
- Import-cycle risk if descriptor assembly is placed inside `sync` or `download`. Mitigation:
  assemble at the composition root; the driver/type live in the neutral `internal/persistence`.
- `migrateLegacyChangelogSchema` does not fit the additive-ALTER mold; it MUST remain a first-class
  custom hook, not be forced into the generic driver.
- Seed steps (`seedDefaultHosterPriorityIfEmpty`) are data, not schema — they stay as an explicit
  post-schema step, not shoehorned into a descriptor.
