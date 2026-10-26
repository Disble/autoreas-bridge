Objective: block 4 of the anime write-path rebuild. Demolish the two-phase write: the staged reservation, the outbox, startup recovery, their ports, types, sentinels, tests and tools, and drop the tables `anime_write_operations` and `anime_changed_outbox`. Irreversible: once a DB opens with this build, no pre-block-3 build can run on it.
Branch: feat/write-path-block4-demolition (off dev e87e71e8) · Delivery: ask-on-risk, local merge into dev · Runners: `go test`, ditto per owning package · Risk: item 1 (dropping stored tables), so it gets an independent verifier.
Plan: artifact https://claude.ai/artifact/8AmVg9jk6D5Cs7rttPoCBH (block 4). Inventory: `odd/tasks/write-path-block3-single-tx.md` L9, `odd/tasks/write-path-block1-referee.md` L6.

## Specs

- S1. Owner, verbatim: "nada de código legacy, test legacies, helpers legacies, dead code, dead test. Tienes que hacer triangulación con CodeGraph para asegurarte de que no estén quedando restos ni código muerto por allí." Remove everything in block 3's L9 list, and everything that becomes unreachable once it is gone:
  - code unreachable in production since block 3: `WriteBaseStore.Stage`, `StageBatch`, `classifyStageRejection*`, `ErrWriteReservationBusy`, and `internal/sync/write_base_request_id_test.go`;
  - code reached only by the startup drain:
    - Recover/recoverNext/recoverBatch/splitRecoveryBatch/sortBatchOperations, DrainOutbox and `writeCleanupTimeout`;
    - the WriteBaseStore and AnimeChangedOutboxStore ports, the WriteOperation types and statuses, and the sentinels `ErrWriteOperation*`/`ErrWriteBaseNotFound`/`ErrAnimeChangedOutboxEventNotFound`;
    - `GatewayConfig.Operations`/`Outbox`, and `AnimeChangedOutboxEvent.OperationID`;
    - the anime `write_base_store.go` aliases, `RecoverWrites`, `RecoveryConfigured` and `writeBases`;
    - desktop `recoverStagedAnimeWrites` and its startup wiring, including the startupFatal path it fed;
    - the sync write-base files: Finalize, FinalizeBatch, ListStaged, ListPendingAnimeChanged, MarkAnimeChangedPublished, Abort, AbortBatch, GetBase, Recover, MarkBatchSuperseded, transitionFromStaged and their scan helpers;
    - `AnimeSnapshotStore.WriteBaseStore()`;
  - the changelog recorder's `AnimeChanged` subscription. It keeps `EpisodeDurationsChanged`: the save writes its own row in the transaction.
  - Tests whose subject is removed go with it. Code still used keeps its tests. `ErrWriteBaseChanged` stays: the new path uses it.
- S2. Schema.
  - Fresh databases no longer create `anime_write_operations` or `anime_changed_outbox`, nor their indexes.
  - Existing databases drop both tables, the outbox first (it holds the foreign key), in one migration transaction. A second open is a no-op. Every other table's rows are unchanged.
  - The older migrations that only alter those two tables (outbox columns, the vocabulary migration over write-op payloads, and so on) are removed or reduced. A migration that also touches other tables keeps that part.
- S3. Tools. `tools/checkeventcoverage` and `tools/checktruncation` read only `anime_write_operations` (checktruncation needs its base/desired pairs, which no other table holds), are wired into no gate, and already fail on the real DB at baseline. They are deleted, with their docs references; `docs/learning-log.md` is append-only history and is left as it is.
- S4. Nothing a consumer observes changes.
  - The block-1 referee tests and the block-3 tests pass unchanged: `TestProductionWiringRecordsOneChangelogRowAndOneBusEventPerSave`, the reconcile e2e including `TestSyncReconcilePlusOneThatMovesASeasonAnimeToVistoIsOneSave`, and the Season rule, stamping and save-store tests.
  - Each save still leaves exactly one changelog row and one event.
  - `docs/openapi.yaml` gets a dated "NO REST/WS wire change" note.
- S5. Owner, verbatim: "Después de cada fase, tienes que volver a validar con todos los dates, linters, etcétera. … no se puede romper la aplicación cuando hayas terminado." All gates must pass, plus a boot of the production runtime wiring on a COPY of the real DB. The copy shows:
  - both tables gone;
  - integrity ok;
  - every other table's row count unchanged;
  - a save that still writes one changelog row.
- S6. Docs. `docs/architecture/**` and `docs/observability/architecture.md` stop describing the staged/outbox/recovery flow, and any ADR that describes it gets a superseding note. `docs/cover-url-migration.md` and `docs/episode-durations-analysis.md` are historical analyses: they get a one-line note only if they present those tables as current.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1–S6 | delegated writer `block4-writer` (one unit; the parent's context backstop) | done | this commit; ditto sync 1.00; 3 hand mutations killed (L5) |
| T2 | S1–S6 | independent verifier (risk item 1) | pending | |
| T3 | S5 | parent: ditto, gates, CodeGraph sweep, merge | pending | |

## Log

- L1 (2026-10-25, owner): "Apruebo todo. Empieza de una vez."
- L2 (2026-10-26, owner): block 3 approved in real use (block 3 doc L11). Then: "Sí, ya cerré dev. Así que haz el bloque 4."
- L3 (2026-10-26): the real DB was backed up with the app closed, through modernc VACUUM INTO, to `D:/dev/disble/autoreas-sp/_backups/bridge-pre-block4-2026-10-26.db` (integrity ok, 862 snapshots).
- L4 (2026-10-26): the tools decision for S3 is to delete rather than repoint. checktruncation's subject, base/desired pairs of a committed write, exists in no other table: changelog keeps only the result, and acknowledged rows are pruned.
- L5 (2026-10-26): T1 done by block4-writer. 68 files: +610 / −4563.
  - Rename: `AnimeChangedOutboxEvent` is now `store.CommittedChange`, without `OperationID`, and the event's CorrelationID is its EventID.
  - Migration: `dropRetiredWriteTables` runs in one `persistence.InTx` before the schema loop and drops the outbox first.
  - Tools: both audit tools are deleted.
  - Recorder: subscribes to episode durations only.
  - Real-DB copy proof:
    - both tables absent;
    - 862 snapshots and the other 31 tables unchanged;
    - one editor save added one changelog row (35 → 36), whose id matches the bus correlation;
    - integrity ok;
    - a second boot changed nothing.
  - Hand mutations, each killed:
    - M1, skip the outbox DROP;
    - M2, re-create both tables;
    - M3, keep the recorder on AnimeChanged. Only the recorder test catches M3: the referee passes because `ON CONFLICT(source_event_id)` deduplicates the extra row.
  - Parent checks:
    - lint `-Profile all` passes with 0 issues once the deletions are staged;
    - ditto on `internal/sync` scores 1.00 (8 mutants, 1 did not compile);
    - ditto on `internal/anime` and `internal/anime/store` produced no mutants: the changes there are deletions and a rename, so there is nothing to score;
    - desktop changes are deletions only (INFRASTRUCTURE wiring).
  - Parent edits:
    - rewrote the write mechanism and the changelog-recorder lines in `docs/architecture.md`;
    - left the `checktruncation` mention in `docs/reports/plan-migracion-raiz-go-ejecutable.md:200` unchanged, because it records a past measurement.
- L6 (2026-10-26): T2 verifier on c7000efc.
  - Verdicts:
    - S2, S3, S5, S6: PASS.
    - S1: PARTIAL, for naming leftovers only.
    - S4: FAIL, with one blocker.
  - Differential probe on real-DB copies: changelog rows, snapshots, bus events, the reconcile response and the conflict count are identical to the baseline.
  - Blocker B1: anime saves no longer wrote their `sync.changelog` log row.
    - At baseline it was domain sync, level info, EventType `sync.changelog`, EntityID the anime, CorrelationID the event id, metadata `sourceEventId`/`changeType`/`changedFields`, and the message "recorded pending changelog for <id>". The recorder's AnimeChanged handler wrote it.
    - It matters because the row lands in `runtime_events`, where `activityread/change_context.go` reads it as a step of an Activity change line. The real DB holds 356 such rows.
  - Advisories:
    1. Changelog ids are now dense: the old duplicate insert used to burn one AUTOINCREMENT id per save. Consumers see no change.
    2. `ErrWriteBaseChanged` has no direct test. Its new-path uses were untested at baseline too.
    3. Naming leftovers: `NewOperationID`, `newOperationID`, and comments that mention the outbox drain and the stored write base.
    4. Downgrade: a pre-block-4 binary re-creates both tables empty and works; the next open drops them again. No corruption.
    5. `sqlite_bootstrap_tables_test.go` is at 407 lines, a warning only.
- L7 (2026-10-26): B1 fixed by the parent, inline: a small fix of one understood change.
  - `newStoreGatewayConfig` wraps `PublishChanged` with `logRecordedChangelog`, which writes the exact baseline row before each committed change is published. It is one seam shared by the write, editor and schedule services.
  - The desktop now passes `Logger` only when `a.sharedLogger` is non-nil, like its other uses. A typed-nil `*FanoutLogger` otherwise panics in tests.
  - Tests: the editor and schedule wiring tests now assert one `sync.changelog` row equal to the baseline shape. RED was observed before the code existed.
  - Advisory 3 fixed: `NewOperationID` is now `NewEventID`, and the stale comments and test ids are updated.
  - Checks:
    - ditto on `internal/anime` and `internal/anime/store` scores 1.00 (3 of 3 killed);
    - `go test ./internal/... ./tools/...` passes;
    - lint, checkarchitecture, checkgofilesize and gofmt are clean.
