Objective: block 3 of the anime write-path rebuild. Every anime save is ONE SQLite transaction that loads, checks the base, mutates, stamps, upserts the snapshot (with name_key), applies the Season rule and writes the changelog row. The bus event is published once, after commit. There is no staged reservation, no outbox and no retry loop in the new path. This is the first production release, and it stays revertible because the old tables remain until block 4.
Branch: feat/write-path-block3-single-tx (off dev 4b6a2f98) · Delivery: ask-on-risk, local merge into dev after mobile is told · Runners: `go test`, ditto per owning package · Risk: items 1 (stored data), 3 (the observable changelog/WS shape) and 4 (transaction ordering on one connection), so it gets an independent verifier.
Plan: artifact https://claude.ai/artifact/8AmVg9jk6D5Cs7rttPoCBH (block 3). Map: L3 below.

## Specs

- S1. Owner-approved design, verbatim intent: "one SQLite transaction per save, no durable reservation, no outbox, the Season auto-transition as an in-tx rule."
  - One save (single or batch) = one write transaction on the shared connection, begun so the write lock is taken up front (no lock upgrade inside the save).
  - Inside it:
    - load the current snapshot;
    - apply the base check (baseModifiedAt) and the mutation;
    - treat a byte-equal result as a no-op;
    - stamp modified_at with today's rule (single: max(now, base+1); batch: now+index+1);
    - upsert `anime_snapshots` with `name_key` from `animeNameKey`;
    - derive the changed fields and change type with the existing logic (`deriveChangedFields`, `deriveChangeType`);
    - insert the changelog row through the existing `insertPendingTx`.
  - After commit, publish exactly one `AnimeChangedEvent` per changed anime, with the same event id as the changelog row's `source_event_id`.
  - No call made while the transaction is open may use another connection: `SetMaxOpenConns(1)` would block until busy_timeout.
- S2. Every observable effect the block-1 referee pins stays identical, and the referee tests pass unchanged, with one exception: S4. The referee tests are:
  - `TestProductionWiringRecordsOneChangelogRowAndOneBusEventPerSave`;
  - the reconcile e2e in `internal/api/sync_e2e_*`;
  - the exact modified_at pins in the editor, schedule and episode tests;
  - `TestSeasonWatchedSubscriberMovesAWatchedVerHoyAnimeToVisto`. This one changes only as S4 says.
- S3. Conflicts keep today's outcome:
  - a stale base returns the conflict outcome with the winning modified_at and a conflict id;
  - the conflict record is persisted;
  - the snapshot is unchanged;
  - no changelog row or event is produced.
  A batch stays all-or-nothing: one item failing or conflicting leaves no item applied, no changelog row and no event. Re-host `internal/anime/schedule_service_test.go:72` (`failingFinalizeBatchStore`, the only mid-batch all-or-nothing test) on the new path.
- S4. Season rule in-tx.
  - When a save leaves the anime in "Ver hoy" with progress ≥ 1, during an active season whose row is `AvailabilityCreated`, the same transaction rewrites the days to "Visto" (preserving last-watched, as `MoveToSection` does today). Today's condition is in `season/service_anime_mutations.go:144`.
  - The result is ONE snapshot write, ONE changelog row (its snapshot already in Visto), ONE event and ONE modified_at.
  - The nested second save and its discarded error (`app_season_availability.go:169`) disappear, and so does the double publish of the outer event.
  - This is the one intended observable change: announce it in `docs/openapi.yaml` and to mobile before merging.
  - Mobile invariants (2026-10-25, L6), both pinned by tests:
    - (a) the reconcile `applied_operations[].modified_at` of the +1 is the FINAL token of the single save, the one whose snapshot already holds days=[Visto];
    - (b) that save's single changelog row lists `days` in `changed_fields` together with the progress fields.
- S5. Changelog failure. A changelog insert that fails now rolls back the save and returns an error outcome; today it is only logged. The recorder keeps its `EpisodeDurationsChanged` subscription.
- S6. Transition until block 4.
  - The old tables remain, and the new path writes nothing to `anime_write_operations` or `anime_changed_outbox`.
  - The existing startup `RecoverWrites` (Recover + DrainOutbox) stays as it is, so rows an older build left behind are still drained.
  - The recorder keeps deduplicating by `source_event_id`, so a drained legacy event and the in-tx row never double up.
  - Measured 2026-10-25 on production: 0 staged, 0 pending outbox rows.
  - Block 4 deletes all of this.
- S7. Owner, verbatim: "nada de código legacy, test legacies, helpers legacies, dead code, dead test… Después de cada fase, tienes que volver a validar con todos los dates, linters, etcétera. … no se puede romper la aplicación cuando hayas terminado."
  - Code made unreachable by the new path is removed in this block: the Gateway retry loops on `ErrWriteBaseChanged` / `ErrWriteReservationBusy` and the Season nested save.
  - Code that only the S6 transition still reaches stays, listed in the Log for block 4.
  - The real app must boot and save on a copy of the real DB (`AUTOREAS_DATA_DIR`), not only pass tests.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1–S7 | delegated writer `block3-writer` (one interdependent unit; the parent's context backstop) | done | this commit; 61 Go packages green; 7 writer hand mutations killed; ditto 0.93 and 0.80, CORE survivors killed (L7) |
| T2 | S1–S7 | independent verifier (risk items 1, 3, 4) | done | S1–S6 PASS; 1 lint blocker fixed and rechecked (L8) |
| T3 | S4, S7 | parent: openapi note, mobile notice, gates, CodeGraph sweep, real-app boot on a DB copy, merge | pending | |

## Log

- L1 (2026-10-25, owner): "Apruebo todo. Empieza de una vez."
- L2 (2026-10-25, owner): the block-1 process rules (no legacy or dead code, CodeGraph, fallow and react-doctor, gates every phase, delegation with counters and a heartbeat).
- L3 (2026-10-25): explorer map, in summary.
  - Every anime write ends at `store.Gateway`:
    - `Update` / `UpdateRaw` (gateway.go:96/115, with retry loops);
    - `Create` (:86);
    - `ApplyBatch` (:200, the only multi-anime path, used by `ScheduleService.Apply` and `CreateService.CreateBatch`).
  - `persist` (gateway_write_helpers.go:20) runs Stage → Finalize → DrainOutbox. Finalize derives the changed fields at write_base_finalize.go:55.
  - The recorder (changelog_recorder.go:49) inserts through `ChangelogStore.InsertPending`, which opens its own tx; `insertPendingTx` (changelog_store.go:51) already takes a tx.
  - The Season move is a nested `PatchAnime` inside the outer synchronous DrainOutbox, which republishes the outer event.
  - Under one connection, these would block if called inside the tx and need tx variants:
    - `LoadSnapshot`;
    - `InsertConflict`;
    - the season repo reads;
    - `InsertPending`.
  - Episode durations bypass the Gateway: they publish `EpisodeDurationsChangedEvent`, which the recorder records. That path is unchanged.
- L4 (2026-10-25): the `bridge_changes[].snapshot` `modified_at:0` from block 1 is intentional and documented (`internal/anime/mobile.go:51-58`): changelog snapshots carry no live OCC token. Closed, no change.
- L5 (2026-10-25): mobile was asked whether the phone depends on the intermediate "+1 still Ver hoy" changelog row, on two WS notices, or on the second modified_at. Awaiting the answer; S4 merges only after it.
- L6 (2026-10-25, mobile `autoreas-mobile-4c`): nothing on the phone depends on the intermediate row, on two notices or on the second token.
  - The phone stores `bridge_modified_at` only from `applied_operations[].modified_at` (reconcile-round.helpers.ts:120), so today it never learns the Visto save's T2, and the next +1 hits a spurious conflict. One save removes that conflict.
  - Invariants: (a) the applied_operations token is the final token; (b) `changed_fields` includes `days`. Phone merge is field-level and writes only the named columns. With both, mobile needs no change; the openapi announcement is enough.
- L7 (2026-10-25): T1 done; the parent ran ditto per package.
  - `internal/sync` + `internal/season` + `internal/persistence`: 0.93 (40/43).
    - Killed by extending `TestAnimeSaveStore*`: the CORE survivors `anime_save_store.go:80` (continue→break) and `:84` (rule error check inverted). The extension adds a no-op item ahead of the applied one, plus a failing rule case.
    - `watched_rule.go:18` `animeID == ""` is equivalent: an empty id matches no season row, so the rule returns "" anyway.
  - `internal/anime` + `internal/anime/store`: 0.80 (45/56).
    - Killed by hand after new tests: `save_rule.go:28` (no days, covered by a new `TestSectionMoveRule` row) and `gateway.go:190-191` / `gateway_write_helpers.go:68` (stamping, covered by the new `TestGatewayStampsPastTheStoredTokenWhenTheClockLagsIt`).
    - `store_gateway_config.go:26` wiring: killed by the desktop tests.
    - Skipped: `gateway.go:102` `stampSingle(0)±1` on create is equivalent for any clock past 1 ms. `gateway_contracts.go:30` `writeCleanupTimeout` is INFRASTRUCTURE and reached only by the S6 drain.
  - `internal/desktop` mutants were not run: composition-root wiring, INFRASTRUCTURE.
  - Real-runtime proof on a copy of the real DB, with the production runtime wiring and no GUI: an editor save and a +1 each wrote one changelog row. write_ops and outbox stayed unchanged, and integrity is ok.
- L8 (2026-10-25): T2 verifier.
  - S1–S6 PASS, Q2–Q7 PASS.
  - Differential probe of baseline vs candidate with production deps: byte-identical except S4 and A1. Baseline S4: rows `[episodesWatched lastWatchedAt premieredAt]` and `[days]`, with the first event published twice. Candidate: one row `[days episodesWatched lastWatchedAt premieredAt]` and one event.
  - Blocker B1: gocognit on the parent's new stamp test. Fixed by splitting it into helpers; lint rechecked at 0 issues.
  - Request correlation is unchanged: CorrelationID was already the operation id, and no runtime code reads `anime_write_operations.request_id`.
  - Advisories:
    - A1: batch event ids lose their shared `<batch>-NNN` suffix; no consumer parses it.
    - A2: legacy outbox events drained at startup skip the Season rule; production has 0 such rows.
    - A3: the rule now runs even before season availability starts; the end state is the same.
    - `tools/checkeventcoverage` and `tools/checktruncation` fail identically on baseline and candidate over a copy of the real DB. They are in no gate and only see frozen legacy rows now.
- L9 (2026-10-25): block 4 demolition list, from the writer and verifier, CodeGraph-checked.
  - Unreachable in production now: `WriteBaseStore.Stage`, `StageBatch`, `classifyStageRejection*`, `ErrWriteReservationBusy`, and the dead test `internal/sync/write_base_request_id_test.go`. They stay one block so block 3 stays revertible and reviewable alone; block 4 removes them first.
  - Reached only by the S6 drain:
    - store: `Recover`/`recoverNext`/`recoverBatch`/`splitRecoveryBatch`/`sortBatchOperations`, `DrainOutbox`, `writeCleanupTimeout`, the `WriteBaseStore` and `AnimeChangedOutboxStore` ports, the WriteOperation types, the `ErrWriteOperation*`/`ErrWriteBaseNotFound`/`ErrAnimeChangedOutboxEventNotFound` sentinels, `GatewayConfig.Operations`/`Outbox`, and `AnimeChangedOutboxEvent.OperationID` (always equal to EventID now);
    - anime: the `write_base_store.go` aliases, `RecoverWrites`, `RecoveryConfigured`, `writeBases`;
    - desktop: `recoverStagedAnimeWrites`;
    - sync: Finalize/FinalizeBatch/ListStaged/ListPendingAnimeChanged/MarkAnimeChangedPublished and the already-unreachable Abort/AbortBatch/GetBase/Recover/MarkBatchSuperseded/transitionFromStaged;
    - also `AnimeSnapshotStore.WriteBaseStore()`, the recorder's AnimeChanged subscription, and the tables `anime_write_operations` and `anime_changed_outbox`.
  - Repoint or delete `tools/checkeventcoverage` and `tools/checktruncation`.
  - `ErrWriteBaseChanged` stays: the new path uses it.
