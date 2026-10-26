# Deprecation register

This register lists code that is already considered legacy but stays in the tree for backward
compatibility, with the release that removes it and the exact steps to do so.

## Policy

- Upgrade-only code is code that exists solely so a database created by an older version opens on
  the current one. A fresh database never runs it.
- It stays through every 2.x release, because a minor release must not break backward
  compatibility: a user may jump from any 2.x straight to the latest 2.x.
- It is removed in the next major release, 3.0.0. From now on it is deprecated.
- Every deprecated symbol carries this Go doc paragraph, which is also the marker the machine owner
  scans for:

  ```go
  // Deprecated: upgrade-only migration for databases created before 2.6.0; remove in 3.0.0 (docs/architecture/cross-cutting/deprecations.md).
  ```

- Code that serves fresh databases too is current behaviour and is never marked, even when an
  upgrade also passes through it.
- A call site inside a shared hook carries no marker of its own, because the hook keeps running for
  fresh and upgraded databases: `migrateAnimeSnapshotsSchema` calls the marked
  `ensureAnimeNameKeyColumn`, and `initializeBridgeDB` calls the marked `dropRetiredWriteTables`.
  The register lists each call as a removal step; deleting the marked function turns a leftover call
  into a compile error.
- 2.6.0 is where both migrations first ship; 2.5.1 contains neither. "Created before 2.6.0"
  therefore means written by 2.5.1 or older. The guard reads the real `info.productVersion`, so
  publishing 2.6.0 changes nothing and publishing 3.0.0 makes it fail.

## Register

| Item | Files and functions | Tests | Added in | Why it exists | Removal steps |
|---|---|---|---|---|---|
| Drop of the retired two-phase write tables (write-path block 4) | `internal/sync/retired_write_tables.go`: `dropRetiredWriteTables`; its call in `initializeBridgeDB`, `internal/sync/sqlite_bootstrap.go` | `internal/sync/write_tables_drop_test.go`: `TestOpenBridgeDBDropsTheRetiredWriteTablesAndKeepsEveryOtherRow`, `droppedWriteTables`, `shippedWriteTablesDDL`, `seedRetiredWriteTables`, `reopenBridgeDB`, `dumpBridgeTables`, `dumpTableRows` | `c7000efc` | A database created before 2.6.0 still holds `anime_write_operations` and `anime_changed_outbox`. The first open on 2.6.x drops both in one transaction; later opens are no-ops. | Delete `retired_write_tables.go` and its call. Delete the marked test and helpers. Keep `TestOpenBridgeDBNeverCreatesTheRetiredWriteTables` and `assertNoRetiredWriteSchema`: they check fresh databases and stay true. |
| Conversion of `name_key` to a plain column (write-path block 2) | `internal/sync/anime_name_key.go`: `nameKeyColumnState` and its constants, `ensureAnimeNameKeyColumn`, `rebuildAnimeNameKey`, `readNameKeyColumnState`, `backfillAnimeNameKeys`, `readAnimeNameKeys`, `refuseDuplicateAnimeNameKeys`; the `ensureAnimeNameKeyColumn` call in `migrateAnimeSnapshotsSchema`, `internal/sync/schema_tables.go` | `internal/sync/anime_name_uniqueness_test.go`: `TestExistingDatabaseGainsThePlainNameKeyColumnAndItsIndex`, `TestMigrationRepairsAnIndexDesyncedFromItsRows`, `TestMigrationNamesTheDuplicatesItCannotIndexAndLeavesTheSchemaUnchanged`, `TestMigrationIsIdempotentOverAnAlreadyMigratedDatabase`, and the helpers `preChangeAnimeSnapshotsDDL`, `generatedNameKeyAnimeSnapshotsDDL`, `legacyNameKeySeeds`, `openOldShapeDB`, `seedAnimeSnapshotRaw`, `readSchemaShape`, `assertIntegrityOK`, `assertMigratesToPlainNameKey`, `assertRefusesDuplicateNameKeys` | `a606fc16` | A database created before 2.6.0 has either no `name_key` or the old VIRTUAL generated column. The first open on 2.6.x replaces it with the plain column, backfills every key through `animeNameKey`, rebuilds the unique index, and refuses duplicate names with the database unchanged. A fresh database gets the plain column from `animeSnapshotsDDL` in `internal/sync/schema.go`, and persistence runs `Migrate` only on an existing table, so it never reaches this code. | Delete the marked functions, the type and its constants, and the call. Drop the imports only that code used (`context`, `fmt`, `sort`, `internal/persistence`). Delete the marked tests and helpers, and the imports only they used. Keep `animeNameKey`, `animeSnapshotsNameKeyIndexDDL`, the plain column in `animeSnapshotsDDL`, the helpers unmarked tests share (`openNameUniquenessDB`, `insertAnimeNamed`, `insertAnimeSnapshot`, `animeSnapshotNamed`, `readNameKeys`), and the fresh-schema tests (`TestAnimeNameKey`, `TestFreshSchemaRejectsASecondAnimeHoldingTheSameName`, `TestNameUniquenessIgnoresCaseAndSurroundingSpace`, `TestNameUniquenessStillAllowsADistinctName`, `TestNameUniquenessLeavesRecordsWithoutAReadableNameUnconstrained`). |

## Deliberately not marked

These older migrations are also upgrade-only, and they stay in the tree unmarked for now: they
predate the write-path rebuild, and removing them is an owner decision that has not been taken. They
are listed here so the omission is a recorded decision, not an oversight, and so the machine owner
above stays scoped to the two migrations of this rebuild.

| Group | Code | Why it is upgrade-only |
|---|---|---|
| Vocabulary cutover (SDD-56) | `internal/sync/vocabulary_migration_tables.go`: `ensureVocabularyMigration`, `migrateAnimeSnapshotsRows`, `migrateChangelogRows`, `migrateConflictRows`; `internal/sync/vocabulary_migration.go`: `migrateVocabularyJSON`, `transformVocabularyNode`, `vocabularyRenameMap` | It rewrites the Spanish keys and `{"$$date": n}` wrappers of rows written before the cutover; a row the current codec writes is already English and is left byte-identical |
| `source_event_id` on `changelog` | `ensureSourceEventIdentityColumn`, `internal/sync/schema_tables.go` | It adds the column a database created before the column existed is missing; `changelogDDL` already creates it |
| Payload-only `changelog` rebuild | `migrateLegacyChangelogSchema`, `internal/sync/schema_migrations.go` | It rebuilds the payload-only table shape that no current schema creates |
| Legacy `anime_snapshots` columns | `migrateAnimeSnapshotsSchema` and `ensureScheduleDayMigrationColumn`, `internal/sync/schema_tables.go`, except the `ensureAnimeNameKeyColumn` call registered above | It adds `modified_at` and the migration markers to the oldest table shape; `animeSnapshotsDDL` already creates them |
| Additive `request_captures` columns | `migrateRequestCapturesSchema`, `internal/sync/schema_tables.go` | It adds the telemetry columns to an older table via `ADD COLUMN` only; `requestCapturesDDL` already creates them |
| `mobile_request_captures` → `request_captures` rename | `ensureRequestCaptureTableRename`, `dropStaleCaptureIndexes`, `internal/sync/capture_table_rename.go` | It renames tables an older install still holds under their old names; a fresh database has nothing to rename |
| Watch-history backfill (SDD-69) | `ensureWatchHistoryBackfill`, `internal/sync/watch_history_backfill.go` | It fills the projection from history stored before the projection existed, gated by its own `schema_migration_markers` row |

## What removal means

Once 3.0.0 removes these migrations, a database that never opened on any 2.6.x–2.x release is no
longer upgraded: it would still hold the retired tables, or a `name_key` the app no longer
recognises. The 3.0.0 entry in `CHANGELOG.md` must therefore say: "open the app once on the last
2.x before upgrading".

## Machine owner

`TestDeprecatedMigrationsAreGoneByTheNextMajor`, in `internal/sync/deprecated_migrations_test.go`:

- it walks up from the package directory to the real `wails.json` and reads `info.productVersion`;
- while the major is below 3 it passes;
- once the major is 3 or more, it fails if any Go file under `internal/` still carries the
  `Deprecated: upgrade-only migration` marker, and its message lists each marked `path:line` and
  points here.

The test is the only file allowed to name the marker without being deprecated itself. It resolves
the repository root from the working directory and reads `wails.json` and the source tree, never git
history, so it can be exercised on a copy of the tree: build it with `go test -c`, then run that
binary with its working directory inside the copy, whose `wails.json` has a 3.x `info.productVersion`
and which holds the marked files (it fails, naming each `path:line`) or not (it passes). A future
upgrade-only migration joins this register by carrying the same marker and a row in the table above.
