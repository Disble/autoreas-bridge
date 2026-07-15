# Apply Progress: SDD-49 Anime Repeat/Restore/Edit

## Status

- Mode: Strict TDD
- Artifact store: hybrid
- Delivery: auto-chain / feature-branch-chain
- Progress: 18/23 tasks complete
- Current boundary: PR7 — fresh review rejected the first enforcement attempt; tasks 7.1-7.3 are pending corrective strict TDD
- Commit/PR: pending orchestrator integration

## Task State

- [x] 1.1 Added behavior-first null, cover-object, unknown-field, real-fixture, malformed-repetition, Repeat, and Restore tests.
- [x] 1.2 Added the lossless Legacy wire and mapper plus English domain-owned Repeat/Restore change tracking.
- [x] 1.3 Routed parser canonicalization and snapshot soft-delete mapping through the Legacy boundary without changing effective-state/tombstone behavior.
- [x] 2.1 Added real-SQLite migration, staging, finalization, recovery, abort, restart, and retention tests before production code.
- [x] 2.2 Added the domain-facing write-base port, SQLite adapter, and idempotent `anime_write_operations` table/indexes.
- [x] 2.3 Covered desired/base/divergent recovery without merging, retained every committed pre-write base, and blocked reverse-order snapshot regression.
- [x] 3.1 Added permanent cleanup, synthetic-Create recovery, partial-recovery outbox, replay, atomicity, changelog-idempotency, startup-order, and durable-append tests.
- [x] 3.2 Added the existing-DB transactional anime.changed outbox, stable EventID dispatch, independent bounded cleanup, and missing-Create recovery.
- [x] 3.3 Preserved OCC behavior, made append acknowledgment one-write-plus-Sync durable, deduplicated changelog replay, and split recovery below the file-size warning threshold.
- [x] 4.1 Added permanent canonical validation, nullable metadata, cover sentinel, source/persistence failure, ownership ordering, no-outbox, and token tests.
- [x] 4.2 Added `CreateService` with a `MetadataProvider`, canonical Legacy construction, mandatory register-first ownership, authoritative token return, and season composition.
- [x] 4.3 Kept enrichment above the Legacy gateway, preserved source errors, ignored observational latest-episode values for `totalcap`, and split the season adapter below 400 lines.
- [x] 5.1 Added permanent chapter, activity, Wails, HTTP projection, and season outcome tests before changing production contracts.
- [x] 5.2 Propagated authoritative anime id, outcome, modified token, and conflict identity through internal contracts, ChapterService, Wails mapping, activity composition, and season ports/adapters.
- [x] 5.3 Kept HTTP/mobile responses on the explicit error-only adapter, rejected conflict/unknown outcomes as success, recorded activity only for `applied`, and split touched chapter/season files below the size warning threshold where practical.
- [x] 6.1 Added permanent visibility, confirmation/cancel, explicit-base, outcome, refetch-scope, generated-runtime, and Catalog all-record/reversible-filter tests.
- [x] 6.2 Added HeroUI Repeat/Restore controls with accurate applied/no-op/conflict/error feedback, exact `detail.modifiedAt` calls, typed runtime fallbacks, and regenerated Wails models.
- [x] 6.3 Extracted dumb mutation UI and a focused mutation hook, documented helpers, kept readonly props, removed new Fallow complexity/style drift, and retained Detail-only refetch behavior.
- [ ] 7.1 Fresh review found missing permanent cases for lexical reassignment, function/receiver aliases, decoder/encoder flows, generated-header spoofing, overbroad exemptions, and deterministic multiple violations.
- [ ] 7.2 The first AST implementation is rejected pending position-aware lexical dataflow and removal of broad directory/prefix exemptions.
- [ ] 7.3 Corrective refactor and full gates are pending.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `internal/anime/legacy/wire_test.go`, `mapper_test.go` | Fixture regression + unit | `go test ./internal/anime/... -count=1` passed | Focused command failed on missing `LegacyAnimeRaw`/`NewMapper`; nested malformed-history test then failed behaviorally | Focused command passed | Nullable synthetic + real fixture; Repeat + Restore; existing + absent repetition history | Test helpers keep assertions semantic and fixtures read-only |
| 1.2 | `internal/anime/legacy/wire_test.go`, `mapper_test.go` | Unit | Existing anime suite passed | Tests referenced the new public boundary before production code existed | `go test ./internal/anime/... -run 'Legacy(Wire|Mapper)' -count=1` passed | Unknown top-level/nested fields, nullable metadata, cover object, malformed nested history | Wire, mapper, and domain aggregate remain below 500 lines |
| 1.3 | Existing `parser_test.go`, `snapshot_test.go` plus Unit 1 tests | Approval/fixture regression | Existing parser/snapshot behavior passed before edits | N/A — behavior-preserving refactor used the passing approval baseline | Parser/snapshot/soft-delete focused tests passed | Full `internal/anime/...` suite passed | Parser and snapshot now use the mapper; canonical hashes, tombstones, and soft deletes remain stable |
| 2.1 | `internal/sync/write_base_store_test.go`, `sqlite_bootstrap_migrations_test.go` | SQLite integration | `go test ./internal/sync/... -count=1` passed | Focused command failed to compile on missing `NewWriteBaseStore` and write-operation contracts | Focused command passed | Durable stage + atomic finalize; desired + base + third-state recovery; abort; restart; old + new bases | Tests use real SQLite under `t.TempDir()` and never mutate Legacy fixtures |
| 2.2 | Unit 2 integration tests | Port + SQLite adapter | Existing sync suite passed | Tests referenced the new public port and adapter before production code existed | Focused and full sync suites passed | Two committed tokens for one anime retain distinct bases; current snapshot advances atomically | Persistence mechanics stay in `internal/sync`; `internal/anime` exposes only English contracts |
| 2.3 | Unit 2 integration tests | Recovery regression | Focused Unit 2 suite passed after GREEN | Reverse-order finalization test failed because an older staged write returned nil and regressed the snapshot | Full repository suite passed after SQL monotonic CAS guard | Desired hash finalizes, base hash remains retryable, third hash becomes superseded; older/equal-token divergent finalization is terminal `superseded` | No pruning/delete API, process-local lock, or merge/resolution behavior was added |

## Command Evidence

### RED

```text
go test ./internal/anime/... -run 'Legacy(Wire|Mapper)' -count=1
FAIL autoreas-bridge/internal/anime/legacy [build failed]
undefined: LegacyAnimeRaw
undefined: NewMapper
```

```text
go test ./internal/anime/legacy -run 'TestLegacyWireRejectsMalformedNestedRepetition' -count=1
FAIL: expected malformed nested repetition to fail
```

### GREEN / REFACTOR

```text
go test ./internal/anime/... -run 'Legacy(Wire|Mapper)' -count=1
PASS

go test ./internal/anime/... -run 'Legacy(Wire|Mapper)|Parser|Snapshot|SoftDelete|LegacyAnimeRaw' -count=1
PASS

go test ./internal/anime/... -count=1
PASS

go test ./... -count=1
PASS (rerun)

go vet ./...
PASS

go run ./tools/checkgofilesize
PASS; touched-file maximum is 339 lines

go run ./tools/checkarchitecture
PASS
```

The first full-suite run observed one transient failure in
`TestRuntimeWatcherTransientRecoveryEmitsZeroNotifications`; its focused test
then passed 5/5 and the complete suite passed on rerun. No watcher code changed.

### Unit 2 RED

```text
go test ./internal/sync/... -run 'Write(Base|Operation)|Migration|Recover' -count=1
FAIL autoreas-bridge/internal/sync [build failed]
undefined: NewWriteBaseStore
undefined: anime.WriteOperationStatusStaged
undefined: anime.WriteRecoveryAction
```

```text
go test ./internal/sync/... -run 'TestWriteOperationFinalizeRejectsReverseOrderRegression' -count=1
FAIL: expected reverse-order finalize to be superseded, got <nil>
```

### Unit 2 GREEN / REFACTOR

```text
go test ./internal/sync/... -run 'Write(Base|Operation)|Migration|Recover' -count=1
PASS

go test ./internal/sync/... -run 'TestWriteOperationFinalizeRejects(ReverseOrderRegression|EqualTokenDifferentState)' -count=1
PASS

go test ./internal/sync/... -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofilesize
PASS; Unit 2 touched files remain below 400 effective lines

go run ./tools/checkarchitecture
PASS
```

## Files

- `internal/anime/legacy/wire.go` — lossless Legacy JSON envelope and schema-shape validation.
- `internal/anime/legacy/mapper.go` — domain extraction and changed-field overlays onto the original envelope.
- `internal/anime/legacy/wire_test.go` — synthetic and real-fixture round trips plus malformed nested-history guard.
- `internal/anime/legacy/mapper_test.go` — Repeat/Restore preservation contracts.
- `internal/anime/domain/anime.go` — English aggregate state and owned mutation/change tracking.
- `internal/anime/domain/anime_raw_projection.go` — transitional projection aligned with the English aggregate.
- `internal/anime/parser.go`, `internal/anime/snapshot.go` — routed through the boundary.
- `internal/anime/write_base_store.go` — English domain port, operation lifecycle, retained-base, and recovery contracts.
- `internal/sync/write_base_store.go` — real SQLite stage/finalize/abort/query/recovery adapter.
- `internal/sync/write_base_store_test.go` — durable lifecycle, restart, divergence, and no-pruning integration coverage.
- `internal/sync/schema.go` — idempotent write-operation DDL and lookup/recovery indexes.
- `internal/sync/sqlite_bootstrap_migrations_test.go` — existing-database bootstrap and index idempotency coverage.

## Deviations and Risks

- No behavior deviation from the reviewed Unit 1 design.
- Existing `domain.LegacyAnimeRaw` remains temporarily for callers assigned to later gateway/propagation units; parser and snapshot no longer depend on it. Removing the compatibility path now would implement later units prematurely.
- PR1 exceeds the default 400-line review budget because it contains the complete lossless wire, mapper, domain operations, fixture tests, and parser/snapshot migration. The autonomous rollback boundary remains Unit 1; do not mix Unit 2 into this PR.
- No behavior deviation from the reviewed Unit 2 design: a recovered base hash stays staged and returns `retry_append`, while only a definite append failure is marked `aborted`.
- Finalization now uses a SQLite monotonic compare-and-set guard. An older or equal-token divergent operation is durably marked `superseded`, returns `ErrWriteOperationSuperseded`, and cannot overwrite the newer authoritative snapshot or its retained base.
- PR2 exceeds the default 400-line review budget because its autonomous SQLite contract includes the port, schema, adapter, and real integration tests. Do not mix Unit 3 gateway/OCC work into this PR.

## Rollback Boundary

- PR1: revert the new `internal/anime/legacy` package, domain aggregate evolution,
  and parser/snapshot routing together.
- PR2: revert the write-base port, SQLite adapter/tests, and
  `anime_write_operations` schema descriptor together. Existing database rows
  are intentionally retained; rollback removes code paths, not stored evidence.

## Next

Fresh adversarial gate review of Unit 5; Unit 6 remains out of scope until PR5 is approved.

## Unit 3 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 | `gateway_outbox_test.go`, `writer_append_test.go`, `write_outbox_store_test.go`, `outbox_migration_test.go`, `changelog_outbox_idempotency_test.go`, `app_startup_recovery_order_test.go` | Real SQLite + temp-file + EventBus boundary | Focused Unit 3 baseline passed before test edits | Focused command failed on missing outbox APIs/EventID/appendRecord and showed observers before recovery publication; ambiguous self-echo test then failed behaviorally | Focused remediation command passed | Abort success/failure; missing Create; partial recovery; publish-before-mark replay; outbox rollback; one-write/short-write/Sync failure; definite/ambiguous self-echo | Recovery moved to `recovery.go`; every touched Go file remains below 400 effective lines |
| 3.2 | Unit 3 tests plus existing gateway/writer/sync suites | Gateway + SQLite transaction + startup composition | Units 1-2 remained green | Tests referenced the approved transactional contract before production code existed | Focused and full repository suites passed | Finalize commits snapshot + operation + pending outbox atomically; runtime/startup drain; stable event id | Anime-specific outbox stays in existing bridge.db; no external service or second DB |
| 3.3 | Existing OCC/no-op tests plus new replay/durability regressions | OCC + recovery + delivery semantics | Existing stale/base-less/no-op matrix passed | Old in-memory recovery publication and two-write/no-Sync append failed the new contracts | Full suite and quality gates passed | Explicit stale conflict; base-less LWW; no-op suppression; at-least-once replay with changelog dedup | `CorrelationID` remains request correlation; `EventID` is separate stable operation identity |

## Unit 3 RED Evidence

```text
go test ./internal/anime/... ./internal/sync/... . -run 'Outbox|DefiniteAppendFailureCleans|MissingSyntheticCreate|PartialRecovery|AppendRecord|StartupRecovers|ChangelogRecorderDeduplicates' -count=1
FAIL internal/anime: undefined appendRecord
FAIL internal/anime/legacy: Recover signature mismatch; missing AnimeChangedOutboxStore, DrainOutbox, and pending-outbox methods
FAIL internal/sync: missing AnimeChangedEvent.EventID, ChangelogEntry.SourceEventID, outbox store methods, and outbox error
FAIL root: startup observers ran while anime_changed_outbox was absent and no recovered event was published
```

```text
go test ./internal/anime -run 'TestUpdateWriterPreservesSelfEchoOnlyForAmbiguousAppend' -count=1
FAIL: ambiguous append may have changed file: want remembered self-echo, got false
```

## Unit 3 GREEN / REFACTOR Evidence

```text
go test ./internal/anime/... ./internal/sync/... . -run 'Outbox|DefiniteAppendFailureCleans|MissingSyntheticCreate|PartialRecovery|AppendRecord|StartupRecovers|ChangelogRecorderDeduplicates' -count=1
PASS

go test ./internal/anime -run 'TestUpdateWriterPreservesSelfEchoOnlyForAmbiguousAppend|AppendRecord|RequestAppend' -count=1
PASS

go test ./internal/anime/... ./internal/sync/... . -run 'Outbox|DefiniteAppendFailureCleans|MissingSyntheticCreate|PartialRecovery|AppendRecord|StartupRecovers|ChangelogRecorderDeduplicates|Gateway|OCC|Recovery|Reservation|WriteOperation|Migration' -count=1
PASS

go test ./internal/anime/... ./internal/sync/... . -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; no Unit 3 touched file is above the 400-line warning threshold

go run ./tools/checkarchitecture
PASS

git diff --check
PASS
```

## Unit 3 Files

- `internal/anime/legacy/gateway.go`, `recovery.go`, `outbox.go`, `append_error.go` ? staged writes, bounded cleanup, Create-aware recovery, and at-least-once outbox dispatch.
- `internal/anime/legacy/gateway_outbox_test.go`, `gateway_concurrency_test.go`, `gateway_recovery_test.go` ? real SQLite/file recovery and concurrency regressions.
- `internal/anime/writer.go`, `writer_append_test.go` ? one complete record write, length verification, and `Sync` before acknowledgment.
- `internal/anime/write_service.go`, `write_base_store.go` ? gateway/outbox composition and English ports.
- `internal/sync/schema.go`, `write_base_store.go`, `write_outbox_store_test.go`, `outbox_migration_test.go` ? existing-DB outbox schema, atomic finalize, pending delivery, and rollback proof.
- `internal/events/event.go`, `internal/sync/changelog_recorder.go`, `changelog_store.go`, `changelog_outbox_idempotency_test.go` ? stable EventID propagation and durable replay deduplication.
- `app.go`, `app_startup_runtime.go`, `app_startup_recovery_order_test.go` ? writer first, classify staged operations, drain pending events, then start observers.
- `design.md` ? transactional outbox and stable at-least-once semantics.

## Unit 3 Deviations and Risks

- Approved architecture implemented without deviation: the outbox is anime-specific and lives inside the existing SQLite database.
- Delivery is intentionally at-least-once. A crash after EventBus publish and before mark may replay the same `EventID`; changelog persistence deduplicates it, while realtime/refresh subscribers tolerate duplicate refresh signals.
- A mark/abort cleanup failure is returned and its durable row remains retryable; it is never swallowed or marked early.
- PR3 still excludes Unit 4 enrichment/Create redesign, Unit 5 result propagation, frontend work, and conflict resolution.

## Unit 3 Rollback Boundary

Revert the gateway/recovery/outbox, writer durability seam, SQLite outbox and changelog EventID migration, startup ordering, and their tests/docs together. Keep approved Units 1-2 wire and retained write-base evidence.

## Unit 4 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1 | `internal/anime/write_service_create_test.go`, `service_test.go`, `create_service_test.go`, `app_season_availability_test.go` | Application service + real SQLite outbox + composition adapter | Focused Units 1-3/Create baseline passed before test edits | Focused anime command failed on missing `CreateMetadata`, `NewCreateService`, and `CreateCanonicalAnime`; app test failed on missing `seasonAnimeMetadataProvider` | Focused anime and app/season commands passed | Invalid id/title/page/day/order; announced total 24; unknown total/duration; cover URL/sentinel; latest episode 13/17; source/append/ownership failures; authoritative token | Negative paths query the real SQLite outbox and prove zero pending success evidence |
| 4.2 | Unit 4 tests plus existing startup ownership test | Metadata port + canonical writer + app composition | Unit 4 RED captured before production APIs | New service/port and canonical builder satisfied the focused contract | Relevant anime, app, and season suites passed | Nil provider degrades honestly; provider source errors stay explicit; persistence returns no result; real bridge-owned registry recognizes a created id | `AnimeCreator` returns the rich result while the current season port unwraps only the id, avoiding Unit 5 propagation |
| 4.3 | Unit 4 latest-episode and file-size regressions | Architecture + composition boundary | Focused GREEN held before refactor | N/A — behavior-preserving extraction initially exposed one unused import and was corrected before acceptance | Full repository suite and quality gates passed after extraction | App provider carries `LatestEpisode` separately while `CreateService` maps only `AnnouncedTotal`; unknowns remain null/sentinel | Season gateway/provider moved to `app_season_anime_gateway.go`; every Unit 4 touched Go file is below 400 effective lines |

## Unit 4 RED Evidence

```text
go test ./internal/anime/... -run 'CreateAnime|CreateService|Ownership' -count=1
FAIL internal/anime [build failed]
undefined: anime.CreateMetadata
undefined: anime.NewCreateService
service.CreateCanonicalAnime undefined
```

```text
go test . -run 'SeasonAnimeMetadataProvider' -count=1
FAIL root [build failed]
undefined: seasonAnimeMetadataProvider
```

## Unit 4 GREEN / REFACTOR Evidence

```text
go test ./internal/anime/... -run 'CreateAnime|CreateService|Ownership' -count=1
PASS

go test . ./internal/season/... -run 'SeasonAnimeMetadataProvider|SeasonAvailability|SeasonAnimeGateway|StartupRegistersNewAnime|CreateSeasonAnimes' -count=1
PASS

go test ./internal/anime/... ./internal/season/... . -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; no Unit 4 touched file is above the 400-line warning threshold

go run ./tools/checkarchitecture
PASS

git diff --check
PASS
```

## Unit 4 Files

- `internal/anime/create_service.go`, `create_service_test.go` — metadata-provider orchestration, validation, honest degradation, and error propagation.
- `internal/anime/legacy/create.go` — scraper-agnostic canonical Legacy wire construction with explicit nulls and cover object.
- `internal/anime/write_service.go`, `write_service_create_test.go` — canonical input persistence, mandatory register-first ownership, and authoritative token.
- `internal/anime/service.go`, `service_test.go`, `service_test_helpers_test.go` — rich Create port, strict ownership ordering, and durable no-outbox checks.
- `app.go`, `app_season_availability.go`, `app_season_anime_gateway.go`, `app_season_availability_test.go` — CreateService composition and season adapter that never fabricates announced totals.

## Unit 4 Deviations and Risks

- No behavior deviation from the reviewed Unit 4 design: metadata enrichment is outside `internal/anime/legacy`, which accepts only already-enriched canonical values.
- The current production episode source proves only `LatestEpisode`; it cannot prove announced total, duration, or cover. Those fields therefore serialize as the required null/sentinel values until a richer authoritative provider is wired.
- `WriteService.CreateAnime` remains as a compatibility wrapper that uses unknown metadata; `CreateService.CreateAnime` is the rich Unit 4 boundary. Unit 5 result propagation remains untouched.
- The real ownership integration test confirms a successful create is listed by the Bridge-native registry; registration or missing-registry failure produces no append or pending outbox event.

## Unit 4 Rollback Boundary

Revert `CreateService`, canonical Legacy construction, mandatory ownership validation, season Create composition, and their tests/docs together. Keep approved Units 1-3 mapper, write-base, gateway, recovery, and transactional-outbox work.

## Unit 4 Review Remediation

The adversarial Unit 4 review found that the season adapter treated a snapshot-listing failure as an empty list and skipped malformed snapshots. Both paths could fabricate order `1` and call the Legacy creator without a trustworthy ordering view. `nextOrden` now returns `(int, error)`, propagates wrapped listing and decode failures, and returns `1` only for a successfully read empty list. `CreateAnime` aborts before invoking the creator when order calculation fails.

### Corrective RED Evidence

```text
go test . -run 'TestSeasonAnimeGatewayCreateFailsBeforeCreatorWhenOrderCannotBeRead' -count=1
FAIL: snapshot listing fails: CreateAnime error = nil, want snapshot read/parse failure
FAIL: snapshot is malformed: CreateAnime error = nil, want snapshot read/parse failure
```

### Corrective GREEN / TRIANGULATE Evidence

```text
go test . -run 'TestSeasonAnimeGateway(CreateFailsBeforeCreatorWhenOrderCannotBeRead|NextOrden)' -count=1
PASS

go test . ./internal/anime/... ./internal/season/... -run 'SeasonAnimeGateway|SeasonAvailability|CreateAnime|CreateService|Ownership' -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; existing unrelated 400-line warnings remain below the 500-line hard limit, and both corrective files are below 400 lines

go run ./tools/checkarchitecture
PASS

git diff --check
PASS
```

The permanent test covers listing failure, malformed snapshot JSON, zero creator calls on both failures, and the valid empty-list case that still starts at order `1`. An initial focused multi-package run encountered a transient missing `autoreas-bridge-res.syso` compiler input; the file is untracked/generated, and the identical focused command plus the full repository suite passed on clean reruns.

### Corrective Files

- `app_season_anime_gateway.go` — propagates snapshot-listing and decode failures instead of fabricating order data.
- `app_season_availability_test.go` — proves failure-before-create behavior and valid empty-list ordering.

At the Unit 4 remediation boundary, tasks 4.1-4.3 were complete and cumulative progress was **12/23**; Unit 5 had not started.

## Unit 5 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.1 | `internal/anime/chapter_service_test.go`, `chapter_service_outcome_test.go`, `app_activity_write_test.go`, `app_outcome_propagation_test.go`, `app_season_availability_test.go`, `internal/api/handlers/common_outcome_test.go`, `internal/season/mutation_outcome_test.go` | Application services + composition adapters + HTTP handler | Root, anime, API, and season package suites passed before test edits | Required focused command failed on missing `contracts.AnimePatchResult`, outcome constants, Chapter result fields, season mutation result, and the explicit HTTP adapter | Required focused command passed after minimal propagation | Applied/no-op/conflict/error; exact token/conflict fields; zero activity for non-applied; stable HTTP success/error shapes; season conflict rejection; authoritative Create result | Permanent outcome tests are colocated by boundary and use public ports rather than storage internals |
| 5.2 | Unit 5 tests plus existing OCC/Create/season suites | Canonical result + adapters | Units 1-4 safety baseline passed | New tests referenced the richer result before production contracts existed | Focused chapter/activity/API/season suites passed | Repeat and Restore applied fields; current-token no-op/conflict; Create id/token; handler conflict projection; season applied/no-op acceptance | `WriteService` maps the Legacy result once into the English contract; downstream layers copy rather than reconstruct authority |
| 5.3 | Unit 5 tests plus repository gates | Transport compatibility + activity semantics + file-size policy | Focused GREEN passed before extraction | Existing activity composition recorded after every error-free patch and season callers accepted any nil-error result | Full repository suite and all quality gates passed | HTTP applied/no-op remain the existing success body; conflict is not downgraded; unknown outcome fails closed; app and Chapter activity remain applied-only | Chapter Repeat/Restore and season mutation flows were extracted into focused files; no touched production file exceeds 500 effective lines |

## Unit 5 RED Evidence

```text
go test ./... -run 'PatchAnime|RepeatAnime|RestoreAnime|Season' -count=1
FAIL internal/api/handlers: undefined contracts.AnimePatchResult, outcome constants, ErrAnimePatchConflict, AdaptAnimePatchWriter
FAIL internal/anime: undefined contracts.AnimePatchResult and ChapterCommandResult outcome/token/conflict fields
FAIL root: activity adapter still returned error only; Wails and season result fields were missing
FAIL internal/season: undefined AnimeMutationResult and AnimeMutationOutcome
```

## Unit 5 GREEN / TRIANGULATE / REFACTOR Evidence

```text
go test ./... -run 'PatchAnime|RepeatAnime|RestoreAnime|Season' -count=1
PASS

go test ./internal/anime -run 'ChapterService|RepeatAnime|RestoreAnime|PatchAnime' -count=1
PASS

go test . -run 'ActivityAnimeWriteService|ToChapterCommandContract|SeasonAnimeGateway|SendSeasonAnimes' -count=1
PASS

go test ./internal/api/handlers -run 'AdaptAnimePatchWriter|OutcomeAdapter|PatchAnimeHandler' -count=1
PASS

go test ./internal/season -run 'MutationOutcome|HandleAnimeWatched|CreateSeasonAnimes|ApplySchedule|ConfirmSelection' -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; ChapterService and season service mutation paths were split below 400 effective lines; remaining warnings are pre-existing or the improved 404-line router

go run ./tools/checkarchitecture
PASS

git diff --check
PASS
```

## Unit 5 Files

- `internal/api/contracts/contracts.go`, `internal/anime/write_service.go` — canonical English outcome/result contract and single Legacy-to-application mapping.
- `internal/anime/chapter_service.go`, `chapter_service_repeat_restore.go` — authoritative result propagation and activity only for applied mutations.
- `app_runtime.go`, `app_outcome_propagation_test.go` — exact Wails mapping of outcome, current token, and conflict identity while keeping transport status separate.
- `internal/api/handlers/common.go`, `common_outcome_test.go`, `internal/api/router.go` — explicit richer-result-to-error adapter preserving existing HTTP/mobile response shapes without reporting conflict as success.
- `app_activity_write.go`, `app_activity_write_test.go` — composition wrapper returns the canonical result and records exactly one activity only for applied writes.
- `internal/season/ports.go`, `service_anime_mutations.go`, `service_ordering.go`, `app_season_anime_gateway.go` — English season mutation result, applied/no-op acceptance, conflict rejection, and authoritative Create id/token propagation.
- `chapter_service_outcome_test.go`, `chapter_service_repeat_restore_test.go`, `internal/season/mutation_outcome_test.go`, `availability_test_helpers_test.go` — permanent outcome and failure regressions plus size-safe test colocation.

## Unit 5 Deviations and Risks

- No behavior deviation from the reviewed Unit 5 design. The error-only HTTP/mobile seam accepts `applied` and `no_op`; `conflict`, unknown outcome, and writer error remain non-success without changing the established success body.
- Base-less legacy/mobile writes still rely on the Unit 3 last-write-wins/no-op gateway contract and do not invent conflicts.
- Season operations preserve their existing partial-apply policy where applicable, but a conflicting individual mutation is never counted as applied or used to advance season state.
- Generated Wails bindings and all Unit 6 frontend work remain untouched. A transient workspace process regenerated `frontend/wailsjs/go/models.ts` after the Go contract changed; that generated diff was explicitly reverted before completion.

## Unit 5 Rollback Boundary

Revert the canonical result contract, WriteService mapping/signature, Chapter/Wails/activity propagation, HTTP projection adapter, season mutation result/validation, and their tests/extractions together. Keep approved Units 1-4 Legacy gateway, OCC/outbox, and canonical Create behavior.

Tasks 5.1-5.3 are complete, cumulative progress is **15/23**, and Unit 6 remains out of scope.

## Unit 5 Adversarial Gate Remediation

The fresh Unit 5 review identified two correctness blockers: zero was omitted from the Wails mutation token wire, and season schedule application continued after a conflicting, unknown, or failed mutation. Both were reproduced with permanent tests before production changes.

### Corrective RED Evidence

```text
go test . -run 'TestToChapterCommandContractPreservesZeroMutationTokenOnJSONWire' -count=1
FAIL: authoritative ModifiedAt 0 serialized without the modifiedAt property

go test ./internal/season -run 'TestApplyScheduleStopsAtFirstNonSuccess|TestApplyScheduleAcceptsAppliedAndNoOp' -count=1
FAIL conflict: returned nil with res={Applied:2 Failed:[anime-b]}
FAIL unknown outcome: returned nil with res={Applied:2 Failed:[anime-b]}
FAIL mutation error: returned nil with res={Applied:2 Failed:[anime-b]}
```

The season RED proves the third sorted mutation was still invoked after the second failed. It retains the accepted first no-op in `Applied`, records the current failed anime, and does not claim rollback of an earlier accepted mutation.

### Corrective GREEN / TRIANGULATE / REFACTOR Evidence

```text
go test . -run 'TestToChapterCommandContractPreservesMutationAuthority|TestToChapterCommandContractPreservesZeroMutationTokenOnJSONWire' -count=1
PASS

go test ./internal/season -run 'TestApplyScheduleStopsAtFirstNonSuccess|TestApplyScheduleAcceptsAppliedAndNoOp' -count=1
PASS

go test . -run 'ToChapterCommandContract|ActivityAnimeWriteService|SeasonAnimeGateway' -count=1
PASS

go test ./internal/api/... -run 'AnimePatch|OutcomeAdapter|AdaptAnimePatchWriter' -count=1
PASS

go test ./internal/season -run 'ApplySchedule|MutationOutcome|HandleAnimeWatched' -count=1
PASS

go test ./... -run 'PatchAnime|RepeatAnime|RestoreAnime|Season' -count=1
PASS

go test ./... -count=1
PASS

go vet ./...
PASS

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; only existing warnings remain below the 500-line hard limit

go run ./tools/checkarchitecture
PASS

git diff --check
PASS
```

### Corrective Files and Semantics

- `internal/api/contracts/contracts.go`, `app_outcome_propagation_test.go` — `modifiedAt` is always present on the Wails command-result JSON, including the legitimate authoritative value `0`; nonzero tokens and the remaining mutation fields stay exact.
- `internal/season/service_ordering.go`, `service_ordering_test.go` — `ApplySchedule` returns at the first gateway error, conflict, or unknown outcome, records that anime as failed, leaves the applied milestone unset, and performs no later mutation calls. Earlier accepted writes remain reported; applied and no-op outcomes remain accepted.
- `internal/season/mutation_outcome_test.go` — the general season mutation matrix now explicitly rejects an unknown outcome.

A workspace generator again produced a transient `frontend/wailsjs/go/models.ts` diff after the Go contract changed. It was explicitly reverted so generated bindings and all Unit 6 work remain outside this boundary.

Tasks 5.1-5.3 remain complete, cumulative progress remains **15/23**, and Unit 6 remains out of scope pending the fresh Unit 5 re-gate.

## Unit 6 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 6.1 | `AnimeDetail/__tests__/*`, `CatalogPanel/__tests__/use-catalog-panel.test.ts`, `internal/anime/query_service_test.go` | HeroUI + hook + query approval | Focused Go suites and 115 frontend tests passed before edits | Eligibility helpers failed 7 assertions; component actions/confirmation failed 3; mutation helpers/hooks failed 13 | Focused AnimeDetail/Catalog command passed 9 files / 142 tests | Finished/inactive exposes both; active/watching neither; active/inactive Catalog filtering is reversible | Existing backend and Catalog production behavior already complied, so their new tests passed immediately as approval regressions and no needless production change was made |
| 6.2 | `use-anime-detail-mutation.test.tsx`, `bridge-runtime-source.test.ts` | Runtime binding + generated contract | Existing runtime-source suite passed | New hook import failed before extraction; generated required `modifiedAt` made degraded runtime results fail typecheck; runtime fallback test failed without token | Wails build regenerated bindings; runtime suite passed 26 tests; TypeScript validation passed | Exact zero base, applied/no-op/conflict/error, missing binding, refresh failure, current token/conflict id, exact result passthrough | One typed fail-closed command fallback now matches the generated model |
| 6.3 | Unit 6 frontend tests and repo gates | Refactor + quality | Behavior stayed green during extraction | Fallow initially rejected new component/hook complexity and the arbitrary modal width | Fallow audit, lint/typecheck, focused/full tests, and file-size advisory passed | Applied outcome survives a failed Detail refresh; route changes ignore stale mutation completions | Mutation controls and mutation hook were extracted; all touched non-generated frontend files remain below 500 lines with no file-size warning |

## Unit 6 RED Evidence

```text
bun --cwd=frontend run test -- src/features/anime-detail/ui/AnimeDetail/__tests__/anime-detail.helpers.test.ts
FAIL 7: modifiedAt/canRepeat/canRestore were undefined

bun --cwd=frontend run test -- src/features/anime-detail/ui/AnimeDetail/__tests__/AnimeDetail.test.tsx
FAIL 3: Repeat, explicit confirmation dialog, and Confirm Restore were missing

bun --cwd=frontend run test -- src/features/anime-detail/ui/AnimeDetail/__tests__/anime-detail.helpers.test.ts src/features/anime-detail/ui/AnimeDetail/__tests__/use-anime-detail.test.tsx
FAIL 13: mutation confirmation/result helpers and hook callbacks were missing

bun --cwd=frontend run test -- src/infrastructure/__tests__/bridge-runtime-source.test.ts
FAIL: degraded ChapterCommandResult omitted required modifiedAt

bun --cwd=frontend run test -- src/features/anime-detail/ui/AnimeDetail/__tests__/use-anime-detail-mutation.test.tsx
FAIL: use-anime-detail-mutation module did not exist
```

The strengthened Go Catalog query test and reversible frontend Catalog filter test passed on their first run because the current production paths already listed all active/inactive/status records. This is recorded as approval-test evidence rather than a fabricated RED; no Catalog production code was changed.

## Unit 6 GREEN / TRIANGULATE / REFACTOR Evidence

```text
go test ./internal/anime/... -run Catalog -count=1
PASS

bun --cwd=frontend run test -- AnimeDetail CatalogPanel
PASS (10 files, 156 tests after review remediation)

bun --cwd=frontend run test -- src/infrastructure/__tests__/bridge-runtime-source.test.ts
PASS (26 tests)

wails build -s -nopackage -skipembedcreate -m -nocolour
PASS; bindings generated and Windows application compiled

go test ./... -count=1
PASS

go vet ./...
PASS

bun --cwd=frontend run validate
PASS

bun --cwd=frontend run test
PASS (113 files, 986 tests after review remediation)

bun --cwd=frontend run fallow audit --quiet
PASS; existing duplicate-shape advisories remain baselined, with no new complexity or CSS-token failure

go run ./tools/checkgofmt
PASS

go run ./tools/checkgofilesize
PASS; advisory-only existing warnings remain below 500

go run ./tools/checkarchitecture
PASS

bun --cwd=frontend run filesize:warning
PASS; no warnings

git diff --check
PASS
```

React Doctor completed after review remediation with a 100/100 score and no findings in the changed files. Wallaby status was attempted with the mandated CLI command, but npm could not determine the package executable; Vitest focused and full suites are green.

## Unit 6 Files

- `frontend/src/features/anime-detail/ui/AnimeDetail/AnimeDetail.tsx`, `AnimeDetailMutationControls.tsx` — dumb detail composition and HeroUI action/feedback/confirmation UI.
- `frontend/src/features/anime-detail/ui/AnimeDetail/use-anime-detail.ts`, `use-anime-detail-mutation.ts`, `use-anime-detail-mutation-visit.ts` — keyed query state, explicit-base mutation orchestration, and mounted route-visit invalidation.
- `frontend/src/features/anime-detail/ui/AnimeDetail/anime-detail.helpers.ts`, `anime-detail.types.ts`, `anime-detail.constants.ts` — documented eligibility, confirmation, authoritative result, refresh-failure, and readonly display contracts.
- `frontend/src/features/anime-detail/ui/AnimeDetail/__tests__/` — action visibility, cancel, zero token, applied/no-op/conflict/error, refetch failure, and component feedback regressions.
- `frontend/src/features/catalog/ui/CatalogPanel/__tests__/use-catalog-panel.test.ts`, `internal/anime/query_service_test.go` — default all-record and reversible-filter approval regressions.
- `frontend/src/infrastructure/bridge-runtime-source/bridge-runtime-source.constants.ts`, `bridge-runtime-source.helpers.ts`, `frontend/src/infrastructure/__tests__/bridge-runtime-source.test.ts` — generated-contract-compatible degraded result and exact Wails passthrough.
- `frontend/wailsjs/go/models.ts` — generated outcome, modified token, and conflict identity fields; `App.d.ts`/`App.js` regenerated with no content change because their Repeat/Restore signatures were already current.

## Unit 6 Deviations and Risks

- No product behavior deviation. Catalog required no production correction because both backend and frontend already defaulted to every record and applied filtering only after explicit user selection.
- Applied/no-op/conflict refetch only `GetAnimeDetail`; errors and missing bindings never refetch or claim success. A failed post-write refetch preserves the authoritative outcome and warns that Detail is stale.
- Generated `models.ts` now makes `modifiedAt` required. Every degraded command result therefore includes `modifiedAt: 0`; zero remains a legitimate explicit token, never an absent-base sentinel.
- Conflict feedback is informational only and includes current token and conflict identity. No SDD-50 resolution or merge UI was added.

## Unit 6 Review Remediation

The fresh PR6 gates found three async-lifecycle gaps. All were corrected test-first without advancing the task count, changing the SDD-50 boundary, adding Catalog invalidation, or weakening StrictMode behavior.

| Blocker | Permanent RED | Corrected contract |
|---|---|---|
| Accepted mutation followed by a `null` Detail refresh | Three applied/no-op/conflict cases rendered not-found | Preserve the prior Detail and authoritative outcome; warn that Detail is stale |
| Route A → B → A while a mutation is pending | Old A visit revived confirmation/pending state | Require both anime id and monotonically advancing route generation before any continuation |
| Component unmount while a mutation is pending | Resolved completion refetched Detail after unmount | Require hook-instance mounted state plus id/generation before refetch, snapshot write, or state publication |

### Corrective RED Evidence

```text
use-anime-detail.test.tsx + use-anime-detail-mutation.test.tsx
FAIL (4): three null-refresh outcomes became not-found; A → B → A revived pending state

anime-detail-mutation.helpers.test.ts
FAIL: route-scope, route-generation, then mounted-visit helpers did not exist

use-anime-detail-mutation.test.tsx
FAIL (1): resolved completion after unmount called GetAnimeDetail once

use-anime-detail-mutation-visit.test.tsx
FAIL: mounted route-visit lifecycle hook did not exist
```

The rejected-after-unmount case was the negative triangulation case and already stayed inert before the resolved-path correction.

### Final Corrective GREEN / REFACTOR Evidence

```text
bun --cwd=frontend run test -- AnimeDetail CatalogPanel
PASS (10 files, 156 tests)

bun --cwd=frontend run validate
PASS

bun --cwd=frontend run test
PASS (113 files, 986 tests)

bun --cwd=frontend run fallow audit --quiet
PASS; existing baselined duplicate/style advisories only

npx -y react-doctor@latest . --verbose --diff
PASS (100/100, no changed-file findings)

npx -y @wallabyjs/cli run --skill
UNAVAILABLE: npm could not determine the package executable

go test ./... -count=1
go vet ./...
go run ./tools/checkgofmt
go run ./tools/checkgofilesize
go run ./tools/checkarchitecture
bun --cwd=frontend run filesize:warning
wails build -s -nopackage -skipembedcreate -m -nocolour
git diff --check
PASS
```

### Corrective Semantics and Risk

- Initial-load `null` still means not-found; only a post-acceptance null/rejected refresh preserves the prior Detail and reports staleness.
- Async continuation must match mounted hook instance, anime id, and route generation. Leaving and returning to the same id cannot revive an older action.
- StrictMode cleanup/setup stays live because cleanup does not mutate route generation; a newly mounted same-id view owns independent refs and can complete a new action.
- Extracting `useAnimeDetailMutationVisit` reduced the main mutation hook's temporary Fallow cognitive complexity 17 without adding global cancellation or timeout behavior.
## Unit 6 Rollback Boundary

Revert the AnimeDetail mutation controls/hook/helpers/tests, Catalog approval regressions, typed runtime fallback, and regenerated Wails model together. Keep approved Units 1-5 backend contracts and outcome propagation unchanged.

Tasks 6.1-6.3 are complete, cumulative progress is **18/23**, and Unit 7 remains out of scope pending the fresh PR6 adversarial gate.

## Unit 7 Corrective Enforcement Evidence

Fresh review rejected the first checker because local aliases/order, detached JSON codecs, generated-marker strings, broad allowlists, and directory symlinks bypassed it. Tasks 7.1-7.3 were reset and re-completed only after permanent regressions, production cleanup, and all required Go gates passed.

### Strict-TDD Evidence

Permanent suites: `legacy_boundary_dataflow_test.go` covers function/path aliases, concatenation, `os.DirFS`, reassignment order, append mode, shadowing, and unrelated I/O; `legacy_boundary_json_test.go` covers aliased/detached codecs, Legacy-decode flow, and English JSON negatives; `legacy_boundary_policy_test.go` covers exact files, canonical generated headers, parallel DTOs, deterministic diagnostics, docs/runtime Spanish values; `walker_test.go` covers cycle-safe directory-symlink traversal without OS privileges.

```text
go test ./tools/checkarchitecture -run 'TestRun(RejectsLexicalAnimeDataFileIOBypasses|AllowsUnrelatedIOBeforeAnimePathReassignmentAndInShadowedScope)$' -count=1
RED: function_alias, constant_folded_filename, directory_filesystem_receiver, read_before_path_reassignment, aliased_append_open
GREEN: PASS

go test ./tools/checkarchitecture -run 'TestRun(RejectsLegacyJSONDecoderAndEncoderBypasses|RejectsSpanishFieldFromLegacyDecodeResult|AllowsUnrelatedJSONDecodersAndEncoders)$' -count=1
RED: four codec bypasses accepted
GREEN: PASS

go test ./tools/checkarchitecture -run 'TestRun(RejectsFilesHiddenByBroadLegacyPathExemptions|AllowsOnlyExactLegacyBoundaryImplementationFiles|RequiresCanonicalGeneratedHeaderBeforePackage|ReturnsDeterministicMultipleLegacyDiagnostics|AllowsDocumentationAndRuntimeSpanishValues)$' -count=1
RED: broad legacy/domain paths and generated-header spoofs accepted
GREEN: PASS
```

Adapter/consumer REDs were captured before adding the complete mapper projection, English Gateway/Get/List and QueryService `ReadRecord` APIs, English-only `Decode`, lifecycle helpers, and season read seams. Permanent GREEN coverage lives in `mapper_projection_test.go`, `gateway_read_test.go`, `query_service_read_record_test.go`, `decode_contract_test.go`, `lifecycle_test.go`, and `app_season_availability_test.go`.

### Production Correction

- `internal/anime/legacy` exclusively opens/parses/serializes/mutates the lossless envelope. Exported `Decode` returns only `domain.Anime` plus opaque canonical bytes; lifecycle helpers preserve unknown fields.
- Mapper/Gateway/QueryService expose complete English metadata, schedule, and repetition values. Mobile, season, parser, snapshot, and restore consume those contracts.
- Season event projection uses the English adapter facade directly, avoiding the shutdown-time SQLite callback panic caught by the first full-suite run.
- Obsolete `internal/anime/domain/anime_raw*` production code/tests were removed. Legacy wire/mapper/gateway/lifecycle tests own compatibility; service tests assert English semantics or opaque JSON.
- Lexical flow was split across `legacy_boundary_flow.go`, `legacy_boundary_evaluate.go`, and `legacy_boundary_values.go`; the unsafe global-binding analyzer was deleted. No touched Go file reaches 400 effective lines.

### Narrow Allowlist

DTO/serialization ownership is exact: `legacy/create.go`, `gateway.go`, `mapper.go`, `projection.go`, `recovery.go`, `wire.go`. Physical `animes.dat` I/O is exact: `legacy/gateway.go`, `legacy/recovery.go`, `startup_catchup.go`, `writer.go`. No package-prefix, generated-directory, domain, snapshot, tool, or fixture exemption exists; only `_test.go`, `testdata`, and a canonical leading generated header are excluded.

### Final Gates

```text
go test ./tools/checkarchitecture -count=20
PASS

go run ./tools/checkarchitecture
PASS (zero violations)

go test ./... -count=1
go vet ./...
go run ./tools/checkgofmt
go run ./tools/checkgofilesize
git diff --check
PASS; file-size output contains only pre-existing advisory warnings, no touched warning/baseline
```

No Wails/API/frontend contract changed, so frontend regeneration/validation was not required; task 7.5 remains the orchestrator-owned cross-stack verify.

### Risks and Rollback

Analysis is intraprocedural and conservative across local branches, not whole-program points-to analysis. Symlink traversal scans reachable external targets while ancestor canonical paths prevent cycles without hiding a second logical alias. Roll back the checker walker/flow/tests and English boundary migration together; do not restore the duplicate domain raw DTO or broaden exemptions. Tasks 7.1-7.3 are complete, cumulative progress is **21/23**; 7.4-7.5 remain pending.

## Final Delivery and Verification

The user approved one aggregate-commit delivery exception; per-unit rollback boundaries remain above. Root verification passed Go/frontend suites, coverage, vet, formatting, file-size, architecture, Fallow, changed-scope React Doctor, Wails build, and diff checks. The unavailable fresh Unit 7 reviewer is recorded as a warning; the root repeated its adversarial cases ×20. Final progress: **23/23**; verdict: **PASS WITH WARNINGS**.
