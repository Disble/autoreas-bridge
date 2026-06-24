# Tasks: SDD-30 — Sync Conflict Detection (non-blocking OCC, soft-delete, conflict storage)

Change: `2026-06-23-sdd-30-conflict-detection`
Inputs: `proposal.md`, `design.md`, `specs/*` (4 capabilities), engram #4298/#4299/#4300/#4301.
Strict TDD is active: every implementation task is preceded by a failing (RED)
test, then minimal (GREEN), then refactor. No call site ships without a test.
Test runner: `go test ./...`.

Out of scope (explicitly NOT tasks here, per proposal/design): resolution UX,
removing dead `Reconcile()` CRDT-MAX code, idempotency keys, device ownership,
delta sync, the "reconcile failed" notification (SDD-29 row #3).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550-750 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (token+migration+soft-delete) -> PR 2 (OCC gate+conflict writer+notify) -> PR 3 (contract+docs) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (ask user) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `modified_at` token: migration, `SnapshotRecord` field, `stampModifiedAt`, write+observe stamping, soft-delete | PR 1 | Base = main/tracker. Self-contained: schema + stamping + real-fixture soft-delete test. No behavior change to mobile contract yet. |
| 2 | OCC gate in `PatchAnime` + `ConflictWriter`/`InsertConflict` + `Notifier` wiring + failure isolation | PR 2 | Base = PR 1 branch (needs `ModifiedAt`/`stampModifiedAt`). Largest unit — gate logic + new writer + DI wiring + tests. |
| 3 | Contract fields (`AnimePatch.Base`, `MobileAnime.ModifiedAt`, `ConflictInfo` dual snapshot) + OpenAPI doc + integration/verification pass | PR 3 | Base = PR 2 branch. Wire-level, smallest, fastest review. |

## Phase 1 — `modified_at` token + migration (ADR-30-1/3)

- [x] 1.1 RED: add `internal/sync/sqlite_bootstrap_test.go` case — bootstrapping a
  legacy 3-col `anime_snapshots` table results in a `modified_at INTEGER NOT NULL
  DEFAULT 0` column added in place; pre-existing rows read back `ModifiedAt=0`.
- [x] 1.2 RED: add fresh-DB case (creates 4-col table) and already-migrated case
  (noop) and unsupported-schema case (returns error).
- [x] 1.3 GREEN: implement `ensureAnimeSnapshotsSchema(db)` in
  `internal/sync/sqlite_bootstrap.go` (column-introspection, mirrors
  `ensureChangelogSchema`/`ensureDownloadJDConfigSchema`); replace the bare
  `db.Exec(animeSnapshotsDDL)` at line 194 with it; widen `animeSnapshotsDDL` to
  include `modified_at`.
- [x] 1.4 RED: add `internal/anime/snapshot_test.go` case for a new
  `stampModifiedAt(prev int64, now func() time.Time) int64` helper — same-ms two
  calls strictly increase; clock-regression (`now`<`prev`) clamps to `prev+1`;
  fresh (`prev=0`) yields `max(now,1)`.
- [x] 1.5 GREEN: implement `stampModifiedAt` in `internal/anime/snapshot.go`;
  add `ModifiedAt int64` to `SnapshotRecord` (snapshot.go:11-15); `HashSnapshot`
  unchanged.
- [x] 1.6 RED: extend `DiffSnapshots` tests — unchanged-hash record copies
  `baseline.ModifiedAt` (no bump); new/changed record bumps via `stampModifiedAt`.
- [x] 1.7 GREEN: wire the copy/bump rule into `DiffSnapshots` (snapshot.go:44-58).
- [x] 1.8 RED: extend `internal/sync/anime_snapshot_store_test.go` —
  `ReplaceBaseline` persists `modified_at` for every upserted row; round-trip via
  `GetSnapshot` returns the stamped token.
- [x] 1.9 GREEN: update `ReplaceBaseline` (anime_snapshot_store.go:48) INSERT/UPSERT
  to include `modified_at`; update row-scan to populate `SnapshotRecord.ModifiedAt`.
- [x] 1.10 RED: `updateConfirmedSnapshot` (service.go:211) test — confirms the
  written snapshot's `ModifiedAt` is `stampModifiedAt(prevRecord.ModifiedAt, s.now)`,
  not zero/unset.
- [x] 1.11 GREEN: call `stampModifiedAt` inside `updateConfirmedSnapshot` before
  building the new `SnapshotRecord` (service.go:221-225).

## Phase 2 — Soft-delete (ADR-30-3b)

- [x] 2.1 RED: `internal/anime/snapshot_test.go` — a baseline id absent from
  `current` (tombstoned/`$$deleted`) produces an UPDATE event with payload
  `Activo=0`+`FechaEliminacion=now`, NOT a `pruneID`; row retained.
- [x] 2.2 GREEN: rewrite the prune loop in `DiffSnapshots` (snapshot.go:60-67) —
  drop `pruneIDs` population for absent baseline ids; synthesize the soft-delete
  payload from `baseline.CanonicalJSON` + bumped `modified_at`; keep `pruneIDs`
  param in `ReplaceBaseline`'s signature for genuine removals (now always empty
  from this call site).
- [x] 2.3 RED: real-fixture test using `resources/autoreas-data/animes.dat` —
  derive a copy with a `$$deleted` line for a known id; after catch-up, assert
  the row is PRESENT in `anime_snapshots` with `Activo=0` + `FechaEliminacion`
  set (not pruned); assert mobile mapping (`mobile.go`) reports it inactive;
  assert it does not appear in any active-list query.
- [x] 2.4 GREEN: confirm `parser.go:50-51,75-77` $$deleted handling still yields
  a usable tombstone marker consumed by 2.2 (adjust only if the real-fixture test
  in 2.3 fails); no behavior change to active-record parsing. Confirmed: no
  parser.go changes were required -- the tombstone (empty Hash/CanonicalJSON,
  AnimeID set) still flows into `delete(records, id)` in parser.go, which feeds
  DiffSnapshots' "absent from current" branch exactly as designed.

## Phase 3 — OCC gate in `PatchAnime` (ADR-30-2)

- [x] 3.1 RED: `internal/anime/service_test.go` — `base==current.modified_at` ->
  applies patch, stamps next token, no conflict recorded.
  `TestWriteServicePatchAnimeFastForwardsWhenBaseMatchesCurrent` — GREEN.
- [x] 3.2 RED: `base!=current` AND value differs -> write returns success,
  current snapshot NOT clobbered, no `RequestWrite`/baseline mutation for the
  divergent value.
  `TestWriteServicePatchAnimeDoesNotClobberOnDivergentBase` — GREEN.
- [x] 3.3 RED: incoming desired value already `==` current (regardless of base)
  -> no-op success, no stamp, no write (idempotency guard).
  `TestWriteServicePatchAnimeNoOpsWhenDesiredValueAlreadyMatchesCurrent` — GREEN.
- [x] 3.4 RED: `base=nil` + record does not exist -> create path, applies +
  stamps, no conflict.
  `TestWriteServicePatchAnimeCreatesWhenBaseNilAndRecordIsNew` — GREEN.
- [x] 3.5 RED: `base=nil` + record exists (old client) -> safe path, treated
  like divergence (no silent overwrite).
  `TestWriteServicePatchAnimeSafePathWhenBaseNilButRecordExists` — GREEN.
- [x] 3.6 GREEN: implement the gate in `PatchAnime` (service.go:156). Computes
  `desired` via the existing merge, compares canonical JSON
  (`patchValueEqualsCurrent`) for value-equality, branches per design.md
  section 3 pseudocode (`recordExists` distinguishes create vs existing-record
  base==nil branches).
- [x] 3.7 REFACTOR: extracted `patchValueEqualsCurrent` and `recordDivergence`
  (plus the Phase-4 seam `reportConflict`, currently a no-op) as small private
  helpers so `PatchAnime` stays readable; the pre-existing merge logic is
  reused unchanged by the fast-forward/create branches.

  **Regression discovered + fixed**: adding the `base==nil` + record-exists
  safe-path branch (3.5) is an intentional, designed behavior change (engram
  decision #4298, design.md §6) but it broke 11 pre-existing tests that called
  `PatchAnime`/PATCH/websocket-reconcile/sync-reconcile without a `base` field
  against already-seeded records (`internal/anime/service_test.go` x6,
  `internal/anime/writer_writeback_test.go` x2, `internal/api/websocket_test.go`
  x1, `internal/api/sync_e2e_test.go` x2). Confirmed via design.md re-read this
  is the correct designed consequence, not a bug — fixed by adding a `base`
  value matching each test's seeded/expected `ModifiedAt` to the patch
  payload (Go struct field or JSON `"base"` key), converting each from an
  "old-client safe path" scenario into a legitimate fast-forward, preserving
  each test's original intent. Also pulled forward part of Phase 5 (`Base
  *int64` on `contracts.AnimePatch`, `base` JSON decoding in
  `decodeAnimePatch`/`anime_handler.go`) since the gate cannot be tested or
  used end-to-end without it. Full `go test ./...` is GREEN after the fix; no
  remaining regressions found across the whole repo.

## Phase 4 — Conflict writer + notifier (ADR-30-4)

- [x] 4.1 Added `contracts.ConflictRecord{ConflictID, AnimeID,
  LocalSnapshotJSON, RemoteSnapshotJSON, DetectedAtMs}` as a pure DTO in
  contracts.go (no standalone shape test — exercised end-to-end by 4.2/4.8).
- [x] 4.2 RED: `internal/sync/conflict_store_test.go` (new file) —
  `TestConflictStoreInsertConflictPersistsBothSnapshots`,
  `TestConflictStoreInsertConflictRejectsDuplicateID`,
  `TestConflictStoreResolveConflictUnaffectedByNewSnapshotColumns`.
- [x] 4.3 GREEN: implemented `ConflictStore.InsertConflict(ctx,
  contracts.ConflictRecord)` in `internal/sync/conflict_store.go`.
- [x] 4.4 RED: covered by the same `conflict_store_test.go` suite —
  `ListConflicts` asserted to expose `LocalSnapshotJSON`/`RemoteSnapshotJSON`.
- [x] 4.5 GREEN: widened the `ListConflicts` SELECT + `ConflictInfo` struct to
  include both snapshot columns (additive, old field order preserved).
- [x] 4.6 RED: `internal/anime/service_test.go` —
  `TestWriteServicePatchAnimeDefaultDepsAreNilSafeNoOps` confirms
  `NewWriteService(store, writer)` (no `SetDeps` call) behaves exactly as
  pre-Phase-4.
- [x] 4.7 GREEN: defined `ConflictWriter` interface + `WriteServiceDeps`
  struct in `internal/anime/service.go`; threaded through via a new
  `SetDeps(deps WriteServiceDeps)` setter (mirrors the existing `SetNow`
  setter convention) rather than widening `NewWriteService`'s signature —
  every pre-Phase-4 call site keeps compiling unmodified.
- [x] 4.8 RED: `TestWriteServicePatchAnimeDivergenceInsertsConflictAndNotifies`
  — asserts `InsertConflict` called once with `Local=current`/`Remote=desired`
  and `Notify` called once with `Source:"sync"`, `Level:warning`.
- [x] 4.9 RED: `TestWriteServicePatchAnimeIsolatesConflictWriterFailure` +
  `TestWriteServicePatchAnimeIsolatesNotifierFailure` — both fakes returning
  errors still yield a successful `PatchAnime` return.
- [x] 4.10 GREEN: wired into `recordDivergence`/`reportConflict` —
  `InsertConflict` happens before `Notify`; both errors are logged via the
  optional `WriteServiceDeps.Logger` (nil-safe) and never bubble.
- [x] 4.11 RED:
  `TestWriteServicePatchAnimeObserveOnlyAppliesLastCallWinsWithoutConflict` —
  `OCCObserveOnly=true` applies last-call-wins (writer called), 0
  InsertConflict/Notify calls.
- [x] 4.12 GREEN: implemented as an early branch in `recordDivergence`
  (checked before `reportConflict`); default `false` (zero value).
- [x] 4.13 GREEN: wired `app.go` composition root — `conflictService :=
  bridgeSync.NewConflictStore(a.bridgeDB)` moved earlier (it already existed
  for the `Conflicts:` API config field) and `animeWrite.SetDeps(...)` now
  injects `Conflicts: conflictService, Notifier: a.notifier, Logger:
  a.sharedLogger` immediately after `NewWriteService`.

  All 5 new RED tests passed on the first GREEN attempt (no regressions this
  time). Refactor note: extracted `applyWrite`/`nowFunc`/`nowFuncForToken`/
  `logf`/`newConflictID` helpers; `PatchAnime`'s final apply block and
  `recordDivergence`'s `OCCObserveOnly` branch now share the same
  `applyWrite` write+confirm sequence. Full `go build ./...`, `go vet ./...`,
  `go test ./...` (whole repo), `gofmt -l .`, and `golangci-lint run ./...`
  all clean after Phase 4.

## Phase 5 — Contract + backward-compat (ADR-30-5)

- [x] 5.1/5.2 `AnimePatch.Base *int64 \`json:"base,omitempty"\`` and its
  `decodeAnimePatch` wire decoding were pulled forward into Phase 3 (see the
  3.7 regression note) to unblock the OCC gate's own tests. This session
  closed the missing dedicated coverage gap: added
  `TestPatchAnimeHandlerDecodesBaseToken` (table-driven: explicit positive
  base, explicit zero base, base omitted -> nil) to
  `internal/api/handlers/anime_handler_test.go` — GREEN on first run (no
  production code change needed, confirming the prior session's
  implementation was already correct).
- [x] 5.3 RED: `internal/anime/service_test.go` —
  `TestQueryServiceListMobileAnimesEchoesModifiedAtToken` and
  `TestQueryServiceGetMobileAnimeEchoesModifiedAtToken`, both seeding via
  `seedAnimeSnapshotWithModifiedAt(..., 1710000000123)` and asserting
  `MobileAnime.ModifiedAt == 1710000000123`. Confirmed RED via compile
  failure (`MobileAnime has no field ModifiedAt`).
- [x] 5.4 GREEN: added `ModifiedAt int64 \`json:"modified_at"\`` to
  `contracts.MobileAnime` (contracts.go) — non-pointer, always present
  (pre-migration rows echo 0, itself a legitimate base value, so there is no
  "absent" state to model). Threaded a new `modifiedAt int64` parameter
  through `mobileAnimeFromSnapshot` (internal/anime/mobile.go) and updated
  its 3 call sites in `internal/anime/service.go`
  (`ListMobileAnimes`/`ListAnimeItems`/`GetMobileAnime`) to pass
  `records[id].ModifiedAt`/`record.ModifiedAt`. `MobileAnimeFromSnapshotForSync`
  (used by `internal/sync/service.go`'s changelog-snapshot path, which has no
  access to the live `anime_snapshots.modified_at` column) now explicitly
  passes `0` with a comment explaining why that is correct, not a gap: mobile
  is not expected to use changelog/sync-feed snapshots as a write base — the
  query endpoints are the source of the live token. Both new tests GREEN
  after the change; full `go test ./...` confirmed no regressions from the
  additive JSON field (no test in the repo asserts exact/closed JSON shape
  for `MobileAnime`).
- [x] 5.5/5.6 RED+GREEN: confirmed via inspection that
  `decodePendingOperationPatch` (sync_handler.go) is already a thin
  re-marshal-and-forward to `decodeAnimePatch` — zero handler-level OCC logic
  exists or was needed. Added 3 new cases to the existing table-driven
  `TestDecodePendingOperationPatch` in
  `internal/api/handlers/sync_handler_test.go` ("round-trips explicit base
  token", "round-trips explicit zero base token", "base omitted decodes to
  nil") plus a `Base` comparison in the `equalAnimePatch` helper. All GREEN
  on first run — no production code change required, confirming the
  no-new-branching design constraint was already satisfied.
- [x] 5.7 Updated `docs/openapi.yaml`: added `base` (nullable integer, with
  ADR-30-2/30-5 semantics in the description) to the
  `PATCH /api/animes/{id}` request body schema; added `modified_at` to the
  `Anime` schema; added `local_snapshot_json`/`remote_snapshot_json`
  (base64 `format: byte`, nullable) to `ConflictInfo`. `go run
  ./tools/checkopenapi` passes (path-presence gate only, but schema content
  was reviewed for completeness against the new Go types).

  Files touched this phase: `internal/api/handlers/anime_handler_test.go`,
  `internal/api/handlers/sync_handler_test.go`,
  `internal/api/contracts/contracts.go`, `internal/anime/mobile.go`,
  `internal/anime/service.go`, `internal/anime/service_test.go`,
  `docs/openapi.yaml`. No deviations from design.md.

## Phase 6 — Integration & verification

- [x] 6.1 `go build ./...`, `go vet ./...`, `go test ./... -cover`, `gofmt -l
  .` (excluding `node_modules`), `golangci-lint run ./...` — all clean, zero
  new warnings/failures. Coverage: `internal/anime` 83.1%, `internal/api`
  63.4%, `internal/api/handlers` 57.7%, `internal/sync` 70.7% (unchanged or
  improved vs. pre-Phase-5 baseline).
- [x] 6.2 `go run ./tools/checkopenapi` — "OpenAPI gate passed." (router
  paths all present in docs/openapi.yaml after the 5.7 edit).
- [x] 6.3 Re-ran the Phase 2.3 real-fixture soft-delete test explicitly:
  `go test ./internal/anime/... -run
  TestStartupCoordinatorCatchUpSoftDeletesRealFixtureTombstone -v` — PASS.
  Evidence: the test copies
  `resources/autoreas-data/animes.dat` to a temp dir, synthesizes a
  `$$deleted` line for a known id, runs catch-up, and asserts (a) the row is
  retained in `anime_snapshots` with `Activo=0`+`FechaEliminacion` set
  rather than pruned, (b) `mobile.go` mapping reports it inactive, (c) it is
  excluded from active-list queries, and (d) the original `.dat` fixture is
  byte-identical after the run (re-read comparison) — confirming no in-place
  mutation of the shared fixture.
- [x] 6.4 Attempted `go test ./internal/anime/... -race -run
  "TestWriteServicePatchAnimeIsolatesConflictWriterFailure|TestWriteServicePatchAnimeIsolatesNotifierFailure"`.
  BLOCKED by a pre-existing environment limitation, not a code defect: cgo
  invocation fails with `cgo: C compiler "C:\\Program" not found: exec:
  "C:\\Program" not found in %PATH%` because `$CC`/`$CXX` point to an MSVC
  `cl.exe` path containing spaces that this shell/cgo invocation does not
  quote correctly. Confirmed via `go env CC`/`go env CXX` inspection that
  this is an environment/toolchain quirk unrelated to any SDD-30 change (the
  same failure occurs on `go test ./... -race` for the whole repo, not just
  the new tests). Without `-race`, both failure-isolation tests pass
  (confirmed in 6.1's plain `go test ./...` run). Reporting as a risk/known
  limitation rather than a silently skipped gate.
- [x] 6.5 Confirmed `frontend/` is untouched (no `git status` changes under
  `frontend/`); no OpenAPI-doc-driven frontend type generation step exists in
  this repo for this change (the 5.7 OpenAPI edits are additive/optional
  fields consumed only by the bridge-mobile contract, not by the desktop
  frontend), so there is no regeneration step to run. Frontend architecture
  constraints in `CLAUDE.md` remain satisfied trivially (no frontend files
  touched).
- [x] 6.6 Write `verify-report.md` (orchestrator-run per project policy).
  Done — verdict PASS WITH WARNINGS; all 4 capabilities verified, gates green.
