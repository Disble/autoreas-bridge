# Persistence

Every bounded context stores its state in one embedded SQLite file, `bridge.db`. This document
covers the conventions they share: how the database is opened, which transaction helper to use,
the one-connection rule, the schema bootstrap order, and the machine owners that keep writers
honest. The anime save that relies on most of them is in `../contexts/anime/workflow.md`.

## The bridge database

`OpenBridgeDB` and `initializeBridgeDB` (`internal/sync/sqlite_bootstrap.go`) open the file with
the pure-Go `modernc.org/sqlite` driver:

| Setting | Value | Where |
|---|---|---|
| Location | `<user config dir>/Autoreas/data/bridge.db`, overridable for tests and copies with `AUTOREAS_DATA_DIR` | `ResolveBridgeDBPath`, `dataDir` (`sqlite_bootstrap_datadir.go`) |
| Connections | `SetMaxOpenConns(1)`, `SetMaxIdleConns(1)` | `initializeBridgeDB` |
| Busy timeout | 5000 ms, in the data source name (`_pragma=busy_timeout(5000)`) so every connection has it from its first statement, then set and verified again by `PRAGMA` | `bridgeDSN`, `applyBridgePragmas` |
| Journal | `PRAGMA journal_mode = WAL`, verified to read back `wal` | `applyBridgePragmas` |
| Auto-vacuum | `INCREMENTAL`, converted once with a full `VACUUM` on an older file; bounded `IncrementalVacuum` at every start | `applyBridgePragmas`, `ensureIncrementalAutoVacuum` |
| Foreign keys | Not enabled: `ON DELETE CASCADE` never fires, so a store deletes children first (`internal/notification/center/sqlite_store.go`) | — |

### One connection

The whole process shares one connection. A statement issued while another one holds it waits in
the `database/sql` pool, not in SQLite. Two consequences every store follows:

- **Inside a transaction, use only the transaction.** A call on the `*sql.DB` while a transaction is
  open waits for a connection the transaction itself holds; it never proceeds.
- **Buffer rows before writing.** An open `*sql.Rows` cursor holds the connection, so a loop that
  writes while it reads must read everything first (`backfillAnimeNameKeys`,
  `internal/sync/anime_name_key.go`).

## Transactions — `InTx` and `InWriteTx`

Both helpers live in `internal/persistence` and share the same contract: commit only when the body
returns nil, roll back on any error or panic, return the body's error unwrapped.

| Helper | File | Begins with | Body receives | Use it for |
|---|---|---|---|---|
| `InTx` | `tx.go` | `db.BeginTx` (deferred, `BEGIN`) | `*sql.Tx` | Migrations and store writes that do not read-then-write under contention (`dropRetiredWriteTables`, `ensureAnimeNameKeyColumn`, `ChangelogStore.InsertPending`, and others) |
| `InWriteTx` | `write_tx.go` | `BEGIN IMMEDIATE` on a dedicated `db.Conn` | `persistence.Querier` | A save that reads and then writes: it takes the write lock up front, so it never has to upgrade a read lock halfway through. Today `AnimeSaveStore.CommitSave` (`internal/sync/anime_save_store.go`) is its only caller |

`database/sql` cannot begin an immediate transaction on a pool whose data source name does not ask
for one, which is why `InWriteTx` runs `BEGIN IMMEDIATE`, `COMMIT` and `ROLLBACK` as statements on a
held connection. Its rollback runs on `context.Background()`: a cancelled caller must still end the
transaction, or the shared connection would go back to the pool inside it.

### The `Querier` rule

`persistence.Querier` (`write_tx.go`) is `ExecContext`, `QueryContext` and `QueryRowContext`. Both
`*sql.Tx` and the connection `InWriteTx` hands out satisfy it, so a helper written against it
serves either kind of transaction (`recordPendingTx`, `insertPendingTx`,
`internal/sync/changelog_store.go`).

Code that runs inside a write transaction uses only the `Querier` it receives. That includes code
from another context plugged into the save: the Season rule reads `seasons` and `season_animes`
through it (`WatchedSection`, `internal/season/watched_rule.go`). Anything that must use another
statement path runs after the transaction closes, as the conflict record does
(`saveOne`, `internal/anime/store/gateway_write_helpers.go`).

### Machine owner of hand-opened transactions

`tools/checkarchitecture/transactions.go` rejects `.BeginTx(` and `.Begin(` in any Go file outside
`transactionBaseline`. The baseline lists the files that opened transactions by hand before
`InTx` existed; it may shrink, never grow. New code uses `InTx` or `InWriteTx`.

## Schema bootstrap

`persistence.EnsureTableSchema` (`internal/persistence/schema.go`) applies one `TableSchema`
descriptor idempotently: it creates an absent table from `CreateDDL`, calls `Migrate` (or adds the
missing `ColumnAdds`) on an existing one, then runs every `Indexes` statement. There is no persisted
schema version; each start inspects the live tables.

`initializeBridgeDB` runs, in this order:

1. Connection limits, `Ping`, `applyBridgePragmas`.
2. `ensureIncrementalAutoVacuum` (logs on failure, never fatal).
3. `ensureRequestCaptureTableRename`, before the table loop, because `EnsureTableSchema` never calls
   `Migrate` for a table it just created.
4. `dropRetiredWriteTables` (`internal/sync/retired_write_tables.go`, a deprecated upgrade only
   migration): drops `anime_changed_outbox` then `anime_write_operations`, in one `InTx`; `IF
   EXISTS` makes every later open a no-op.
5. `EnsureTableSchema` for every context's descriptors, in this order: `schemaTables()`
   (`internal/sync/schema_tables.go`, ending with `anime_snapshots`), download, activity, season,
   eventlog, incident, telemetry, notification center, watch history, episodes.
6. `ensureVocabularyMigration` (`internal/sync/vocabulary_migration.go`), once, after every table
   exists; a failure aborts the open.
7. `ensureWatchHistoryBackfill` (logs on failure).
8. `ensureDefaultHosterPriority`, `ensureRequestCaptureMetadata` (seed rows).
9. `IncrementalVacuum` (logs on failure).

`anime_snapshots` migrates through `migrateAnimeSnapshotsSchema` (`schema_tables.go`): it adds
`modified_at` to the oldest shape, the `schedule_day_migrated_at` and `vocabulary_migrated_at`
markers, and then calls the deprecated `ensureAnimeNameKeyColumn`.

## `name_key` and its machine owner

`anime_snapshots.name_key` is plain `TEXT` computed in Go by `animeNameKey`
(`internal/sync/anime_name_key.go`): the `name` field with surrounding U+0020 spaces trimmed and
ASCII A–Z folded to lower case; a snapshot with no readable string name keys as NULL. The unique
index `idx_anime_snapshots_name_key` (`internal/sync/schema.go`) enforces it.

It is Go, not a generated column, because a generated column is re-evaluated by whatever SQLite
build opens the file: an ICU build folds more runes, and a `REINDEX` from such a tool once desynced
the index from the rows the app wrote. `ensureAnimeNameKeyColumn` turns an older generated column
into the plain one in one `InTx`, backfills every row, and rebuilds the index; it refuses, with the
database unchanged, a catalogue where two animes share a key, naming each duplicate.

`tools/checkarchitecture/namekey.go` (`nameKeyWriterViolations`) is the machine owner: any
production SQL string literal that inserts into, replaces into or updates `anime_snapshots` without
writing `name_key` fails the architecture check. Test files and `testdata/` are out of its scope.

## Deprecated upgrade-only migrations

The migrations that upgrade databases created before 2.6.0 are deprecated and are removed in the
next major release (3.0.0). 2.6.0 is the next minor release and is not published yet, so it is where
both migrations first ship; 2.5.1 contains neither. See
`docs/architecture/cross-cutting/deprecations.md` for the register, the marker and the removal steps.

## Known drift

- The comment on `animeSnapshotsTable` in `schemaTables()` (`internal/sync/schema_tables.go`) says
  its `Migrate` hook drives `ensureVocabularyMigration`. It does not: `initializeBridgeDB` calls it
  after the table loop, as `migrateAnimeSnapshotsSchema` itself explains.
