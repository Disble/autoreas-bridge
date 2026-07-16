# Apply Progress: edit-anime

## Status

- Apply mode: Strict TDD
- Delivery mode: size:exception (maintainer-approved single PR)
- Tasks complete: 10 / 11
- Current slice: backend and frontend apply phases complete; fresh-review blockers/warnings fixed; parent verification tasks remain open

## Completed Tasks

- 1.0 Fresh-review blocker pass (this session):
  - B1: batch replacement now releases self-echo state on ambiguous errors; `TestBatchReplacementReleasesEchoStateAndWatcherResumesOnAmbiguousError` proves `ReplacementInFlight()` drops and the watcher resumes processing external appends.
  - B2: `validateScheduleDraft` merges submitted placements with authoritative unchanged records before contiguity checks; `TestScheduleServiceApplyAcceptsValidPartialDraftIntoPopulatedWeekday` proves a move into `Lunes#2` is valid when `Lunes#1` is unchanged.
  - B3: board-level `BoardModifiedAt` mismatch routes through `recordBoardConflict`, which records a conflict row; `TestScheduleServiceRejectsWholeDraftWhenUnchangedBoardMemberAdvances` asserts the count.
  - B4: `TestScheduleServiceApplyTwoAnimeDraftProducesAppliedOutcomeAndExactPublications` exercises the happy path through `ScheduleService.Apply` against real temp SQLite + `animes.dat`, asserting `applied`, refreshed board, and exactly two publications.
  - B5: Vitest config now has `forbidOnly: true`; no `.only` calls were present; full frontend suite remains green.
  - W1: dead `desired := current.CanonicalJSON` / `_ = desired` lines removed from `schedule_service.go`.
  - W2: `editorStringListFromFields` no longer treats `""` as null; empty strings fall through to `KindMissing`.
  - W3: `isWatchingAnime` and `ANIME_ESTADO_VALID_VALUES` already live in shared estado helpers/constants; moved the `AnimeEstadoStatus` interface to `anime-estado.helpers.types.ts` to satisfy strict colocation and cleared the lint error. Replaced the feature-local `getAnimeEditorEstadoColor` magic-number cases with a color map bound to `ANIME_ESTADO_VALID_VALUES`.
  - W4: proposal rollback plan already acknowledges `anime_batch_replacements`, staged operations, temp/backup files, fix-forward recovery, and downgrade caveats.
  - Housekeeping: restored `computeAnimeEditorListWindow` in `anime-editor-workspace.helpers.ts` (it was imported by `use-anime-editor-list-window.ts` but had been lost) and re-added its regression tests so `validate` and the full suite stay green.
- 1.1 Initial failing tests existed before corrective iteration reopened the remaining work.
- 1.2 Backend editor/schedule contracts, validation, lossless merge, and exact side-effect boundaries are green.
- 1.3 Forbidden ownership, lifecycle separation, launch-sink safety, and copied real-fixture fidelity are green.
- 2.1 All five Wails bindings have Go integration coverage for authority, unavailable services, validation, conflicts, and infrastructure failures.
- 2.2 Wails bindings were regenerated canonically and the infrastructure adapter was updated without a frontend UI refactor.

## Partial Progress This Session

- Completed frontend Phases 3 and 4 under strict TDD:
  - production runtime adapter now requires and invokes all five English editor Wails calls while preserving explicit outcomes, messages, refreshed records, and refreshed boards;
  - record editing, guarded transitions, list state, schedule orchestration, and transition execution are split into focused hooks with one guard reducer/state machine;
  - conflicts/errors retain the attempted draft while refreshed authority remains separate; applied/no-op/discard are the only dirty-clearing paths;
  - stale record responses are sequence-guarded, save/apply loading uses `try/catch/finally`, and save-and-continue branches on the returned outcome;
  - app-link, route/deep-link, browser-back, selection, schedule-entry, and reload/close interception are covered where the browser/Wails host exposes an interception seam;
  - the schedule-specific shared core owns ordered state, duplicate rules, normalization, serialization, reset/apply behavior, and dnd-kit projection; Season now adapts approved cards, rules, and persistence through that core;
  - the schedule modal separates weekday and special rows, scrolls/highlights origin, preserves one shared draft, and reloads returned authority on conflict;
  - the split-pane editor now has watching-first search/filter, independent scrolling, complete frequent/details fields, sticky semantic actions, deactivation wording, and selection-preserving refreshes.

- Reopened the overclaimed task state and invalidated the premature verify report.
- Added RED tests for fresh-review blockers:
  - `TestWriteOperationStageBatchDoesNotDeadlockSingleConnectionOnRejectedRow`
  - `TestEditorServiceSaveRejectsBlankTitleWithoutWrite`
  - `TestSaveAnimeEditorReturnsExplicitOutcomeWhenServiceUnavailable`
- Fixed the confirmed `StageBatch` single-connection deadlock by classifying stale/rejected rows through the active transaction instead of `s.db`.
- Added blank-title validation on editor saves so invalid names reject before any durable write.
- Added explicit `error` outcomes for editor save/deactivate/apply runtime unavailability and verified them through Go + frontend tests.
- Expanded backend editor validation to reject unsupported status values, negative progress, and unsafe page/folder patches.
- Added a stricter whole-board OCC test that currently fails before reaching the intended assertion because schedule apply still lacks a valid coordinated replacement path in the test/runtime setup.
- Fixed the schedule test harness to use real temp `animes.dat` files, then added `boardModifiedAt` whole-board OCC checks and a backend schedule validation matrix for invalid destinations, non-contiguous positions, duplicate anime IDs, and inactive entries.
- Completed the confirmed batch durability block:
  - ordinary appends and full-file replacements now share one path-keyed exclusive filesystem mutation coordinator;
  - replacement revalidates the canonical generation hash before promotion and retries safely when it changed;
  - SQLite now persists deterministic canonical/temp/backup paths, whole-file hashes, and replacement phases in `anime_batch_replacements`;
  - grouped startup recovery handles staged, temp-durable, backup-moved, promoted, restoration, all-base, all-desired, and mixed/divergent states without row-by-row batch recovery;
  - the shared self-echo registry blocks watcher observation while replacement finalization is pending, then the existing outbox publishes exactly once per changed anime.

- Added initial backend editor read contracts:
  - `AnimeEditorRecord`
  - `AnimeEditorScheduleBoard`
  - schedule destination / entry DTOs
- Added query-side projections for:
  - `QueryService.GetAnimeEditorRecord(...)`
  - `ScheduleQueryService.GetEditorBoard(...)`
- Added RED -> GREEN tests proving:
  - editor DTO JSON round-trip shape
  - query-side `estudios` kind preservation
  - query-side `portada` object + raw metadata preservation
  - active-only schedule board loading with 7 weekdays + 3 special destinations
- Added backend write foundations:
  - `EditorService.Save(...)`
  - `EditorService.Deactivate(...)`
  - `ScheduleService.Apply(...)`
  - `legacy.Gateway.UpdateRaw(...)`
  - raw-envelope field mutation helpers on `LegacyAnimeRaw`
- Added initial Go-side Wails/runtime foundation:
  - `GetAnimeEditorRecord`
  - `SaveAnimeEditor`
  - `DeactivateAnime`
  - `GetAnimeEditorScheduleBoard`
  - `ApplyAnimeEditorSchedule`
  - DTO adapters for editor save and schedule apply commands
- Completed the backend/editor contract matrix:
  - application and Wails editor identifiers are English while Legacy JSON names remain inside `internal/anime/legacy`;
  - nullable integer/string/time patches validate exact present/clear/value combinations and `fechaEstreno` supports preserve, clear, and value;
  - structured `portada` edits and clears retain object shape and unknown nested fields;
  - `estudios`, `generos`, `dias`, nullable metadata, and unknown top-level fields preserve their Legacy missing/null/empty/value forms;
  - malformed numeric JSON, non-finite/negative progress, invalid status/type/duration/date, forbidden ownership, unsafe URLs, and unsafe folders reject before mutation;
  - general save cannot reactivate an inactive anime; Restore remains the lifecycle path;
  - page/folder safety is enforced again immediately before BrowserOpenURL/explorer launch.
- Replaced zero-value Wails degradation with explicit result DTOs for all five editor bindings. Save/deactivate conflicts carry refreshed records; schedule conflict/error responses carry refreshed boards.

## TDD Cycle Evidence

| Slice | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Editor read DTO + board query | `internal/api/contracts/contracts_test.go`, `internal/anime/editor_query_service_test.go` | Unit | ✅ `go test ./internal/anime/... ./internal/api/contracts/...` baseline passing | ✅ Wrote tests against missing DTOs/methods | ✅ `go test ./internal/anime/... ./internal/api/contracts/...` | ✅ DTO round-trip + editor fidelity + board destinations/filters | ➖ None yet |
| Editor write + deactivate + stale OCC + schedule stale rejection | `internal/anime/editor_service_test.go` | Unit | ✅ `go test ./internal/anime/...` baseline passing | ✅ Wrote tests against missing services/commands | ✅ `go test ./internal/anime/...` | ✅ applied save + stale conflict + deactivate + whole-draft stale rejection | ➖ None yet |
| Schedule batch atomicity | `internal/anime/editor_service_test.go`, `internal/anime/legacy/*_test.go`, `internal/sync/*_test.go` | Unit / integration-ish | ✅ failing partial-write proof reproduced first | ✅ `go test ./internal/anime/... -run TestScheduleServiceApplyDoesNotPartiallyWriteWhenLaterAppendFails -v` | ✅ batch staging/finalization/recovery path now green in broader Go suite | ➖ Need deeper negative fixtures and editor-field semantics |
| React Doctor fix for shared async list hook | `frontend/src/shared/hooks/use-async-list/__tests__/use-async-list.test.ts` | Hook unit | ✅ Doctor bug repro on `use-async-list.ts:29/49` | ✅ added loading-state regression tests before code change | ✅ `bun --cwd="frontend" run doctor:react` now exits cleanly (warnings only) | ➖ No further refactor yet |
| Go-side Wails editor bindings | `app_runtime_editor_test.go` | Integration-ish unit | ✅ `go test ./...` green baseline before binding pass | ✅ Wrote tests against missing runtime methods | ✅ `go test ./...` | ✅ load/save/board delegation cases | ➖ None yet |
| Batch replacement durability | `internal/anime/legacy/batch_durability_test.go`, `internal/sync/sqlite_bootstrap_migrations_test.go` | Filesystem + single-connection SQLite + real watcher integration | ✅ Existing ordinary writer and recovery suites green | ✅ New tests first failed on missing journal/checkpoint contracts | ✅ Focused, anime/sync, repository, and vet gates pass | ✅ concurrent append, generation retry, every replacement checkpoint, grouped divergence, and exact publication counts | ✅ Journal store split kept Go files below the hard size ceiling |
| Typed editor patch matrix and authoritative validation | `internal/anime/editor_service_test.go`, `internal/anime/editor_query_service_test.go` | Application + Legacy boundary | ✅ Prior backend suite green | ✅ New typed nullable/cover/validation tests failed against string scanning and incomplete patches | ✅ Focused editor tests and package suite pass | ✅ preserve/clear/value, invalid shapes, inactive reactivation, one publication, and infrastructure failure | ✅ Numeric parsing removed; shared launch policies extracted |
| Five explicit Wails outcomes | `app_runtime_editor_test.go` | Go/Wails integration | ✅ Prior runtime tests green | ✅ Tests failed against nil/empty-board and generic patch results | ✅ All five bindings return explicit result DTOs | ✅ unavailable, validation, applied, conflict, refreshed authority, and closed-DB failures | ✅ Runtime result mapping centralized |
| Frontend editor outcomes and guards | `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/__tests__/*` | RTL hook/component | ✅ 167 focused tests green before corrective tests | ✅ conflict retention, save-and-continue, route/link/history/reload guards, reverse load race, and invalid-save tests failed against the monolithic hook | ✅ focused editor suite passes | ✅ applied/no-op, conflict/error, discard/stay/save, stale load, schedule conflict authority | ✅ split into list/record/guard/schedule/transition hooks and small dumb TSX panels |
| Shared schedule core and Season adapter | `frontend/src/features/anime-schedule-ordering/**/__tests__/*`, `frontend/src/features/season/ui/OrderingBoard/__tests__/*` | Pure helpers/hooks/RTL | ✅ existing OrderingBoard suite green | ✅ English placements, origin scrolling, row separation, reset, and adapter tests exposed missing behavior | ✅ shared-core and Season suites pass | ✅ special/weekday rows, duplicate rejection, full reset/apply, approved-only Season input | ✅ Season delegates ordered collections, DnD projection, validation, clone/remove, and serialization to the shared core |
| Launch-sink safety | `app_desktop_actions_test.go` | Desktop OS boundary | ✅ Valid HTTP launch behavior green | ✅ file URL, UNC, device, relative, and traversal paths reached sinks | ✅ unsafe values reject before BrowserOpenURL/explorer | ✅ valid existing HTTP behavior remains green | ✅ Editor and sink use one policy |
| Copied real-fixture fidelity | `internal/anime/legacy/wire_test.go` | Real fixture copy | ✅ Existing real-fixture round-trip green | ✅ Added missing/null/empty/array/object matrix on a temp copy | ✅ exact JSON round-trips pass | ✅ unknown fields and nested cover raw metadata retained | ➖ No production refactor required |

## Test Evidence

- Fresh-review blocker pass evidence (2026-07-15):
  - `go test ./internal/anime/legacy -run TestBatchReplacementReleasesEchoStateAndWatcherResumesOnAmbiguousError -count=1 -v` ✅ echo released and watcher resumes.
  - `go test ./internal/anime/legacy -run TestBatchReplacementReleasesEchoStateOnDefiniteError -count=1 -v` ✅ echo released on definite error.
  - `go test ./internal/anime -run TestScheduleServiceApplyAcceptsValidPartialDraftIntoPopulatedWeekday -count=1 -v` ✅ partial draft applied when unchanged record fills the gap.
  - `go test ./internal/anime -run TestScheduleServiceRejectsWholeDraftWhenUnchangedBoardMemberAdvances -count=1 -v` ✅ board-level conflict recorded.
  - `go test ./internal/anime -run TestScheduleServiceApplyTwoAnimeDraftProducesAppliedOutcomeAndExactPublications -count=1 -v` ✅ happy path through `ScheduleService.Apply`.
  - `go test ./internal/anime -run TestScheduleServiceApplyDoesNotPartiallyWriteWhenBatchReplacementFails -count=1 -v` ✅ atomicity under replacement failure (renamed from misleading append-failure name).
  - `bun --cwd="frontend" run test` ✅ 126 files / 1047 tests (forbidOnly enabled).
  - `bun --cwd="frontend" run validate` ✅ zero lint/type errors; two advisory derived-state warnings remain.
  - `go run ./tools/checkgofilesize` ✅ no hard-limit violations; `batch_durability_test.go` at 417 effective lines (warning only).
  - `bun --cwd="frontend" run filesize:warning` ✅ no frontend file-size warnings.
  - `bun --cwd="frontend" run doctor:react` ✅ completed with warnings only.
  - `bun --cwd="frontend" run fallow audit --quiet` ✅ advisory-only (duplicate inventory and css-token-drift warnings).
- Corrective RED -> GREEN loops:
  - `go test ./internal/sync -run TestWriteOperationStageBatchDoesNotDeadlockSingleConnectionOnRejectedRow -count=1 -v` ✅ after fix
  - `go test ./internal/anime -run TestEditorServiceSaveRejectsBlankTitleWithoutWrite -count=1 -v` ✅ after fix
  - `go test ./... -run 'Test(SaveAnimeEditorReturnsExplicitOutcomeWhenServiceUnavailable|DeactivateAnimeReturnsExplicitOutcomeWhenServiceUnavailable|ApplyAnimeEditorScheduleReturnsExplicitOutcomeWhenServiceUnavailable)' -count=1 -v` ✅ after explicit runtime outcomes
  - `go test ./internal/anime -run 'TestEditorServiceSaveRejects(BlankTitle|UnsupportedStatus|NegativeProgress|UnsafeURLAndFolder)WithoutWrite' -count=1 -v` ✅ after validation expansion
  - `go test ./internal/anime -run 'TestScheduleService(RejectsWholeDraftWhenUnchangedBoardMemberAdvances|ApplyDoesNotPartiallyWriteWhenLaterAppendFails|RejectsInvalidScheduleDraftsBeforeWrite)' -count=1 -v` ✅ after adding real temp-file harnessing and board-level validation

- Baseline:
  - `go test ./internal/anime/... ./internal/api/contracts/...` ✅
- After implementation:
  - `go test ./internal/anime/... ./internal/api/contracts/...` ✅
- Additional focused loops:
  - `go test ./internal/anime/...` ✅
- Broader regression:
  - `go test ./...` ✅
  - `go test ./... -cover` ✅
  - `go vet ./...` ✅
  - `bun --cwd="frontend" run test` ✅
  - `bun --cwd="frontend" run validate` ✅
  - `bun --cwd="frontend" run doctor:react` ✅ (warnings only)
  - `bun --cwd="frontend" run fallow audit --quiet` ⚠ warnings only
- Batch durability corrective evidence (2026-07-15):
  - RED: `go test ./internal/anime/legacy ./internal/sync -run 'Test(BatchReplacement|BatchReplacementJournal)' -count=1` failed on missing replacement phases/journal schema.
  - GREEN: the same focused command passes all durability cases, including real `fsnotify` watcher suppression and exact two-event finalized publication.
  - `go test ./internal/anime/... ./internal/sync/...` ✅
  - `go test ./internal/anime -run 'Test(UpdateWriter|AppendRecord|SelfEchoRegistry)' -count=1 -v` ✅ ordinary append/write/self-echo behavior preserved.
  - `go run ./tools/checkgofilesize` ✅ (warnings only; no hard-limit violation).
  - `go test ./...` ✅
  - `go vet ./...` ✅
  - `go test -race ./internal/anime/legacy -run 'TestBatchReplacement' -count=1` ⚠ unavailable in this Windows environment because cgo could not resolve the configured C compiler path (`C compiler "C:\\Program" not found`).
  - SonarQube IDE analysis unavailable because the local SonarQube IDE service was not running; this did not replace any required Go gate.
- Backend/editor corrective evidence (2026-07-15):
  - RED: typed nullable/cover editor tests failed on missing contracts; Wails integration tests failed on nil/zero-value returns; launch tests proved unsafe values reached OS sinks.
  - GREEN: focused editor/query/schedule tests, all five Wails binding tests, copied real-fixture matrix, and launch-sink rejection tests pass.
  - `go test ./internal/anime/legacy ./internal/sync -run 'Test(BatchReplacement|BatchReplacementJournal)' -count=1` ✅ durability protocol preserved.
  - `go test ./internal/anime/... ./internal/api/contracts/... -count=1` ✅
  - `go test ./... -count=1` ✅
  - `go vet ./...` ✅
  - `go run ./tools/checkgofmt` ✅
  - `go run ./tools/checkgofilesize` ✅ with warnings only and no file above 500 effective lines.
  - `bun --cwd="frontend" run test -- bridge-runtime-source` ✅ 27 tests.
  - `bun --cwd="frontend" run validate` ✅ with 8 pre-existing React Doctor warnings and zero lint/type errors.
  - `wails generate module` ✅ regenerated `frontend/wailsjs/go/main/App.{d.ts,js}` and `frontend/wailsjs/go/models.ts`.
- Frontend corrective evidence (2026-07-15):
  - RED: new RTL/hook/helper tests failed on dropped refreshed payloads, conflict draft replacement, stale load reversal, incomplete guards, missing origin scroll/row separation, and independent Season ordering helpers.
  - GREEN: `bun run test -- bridge-runtime-source anime-editor anime-schedule-ordering OrderingBoard AnimeDetail App` ✅ 235 tests.
  - `bun run test` ✅ 122 files / 1018 tests.
  - `bun run validate` ✅ typecheck/lint with two advisory schedule-state warnings and no errors.
  - `bun run build` ✅; Vite reports the existing large-chunk advisory.
  - `bun --cwd="frontend" run fallow audit --quiet` ✅ no unused or high-complexity findings; advisory clone inventory remains below the configured failure threshold.
  - `bun run filesize:warning` ✅ no frontend file-size warnings.
  - `bun run doctor:react` completed with zero error-level findings; advisory findings remain, including pre-existing project findings and schedule-authority reset heuristics.

## Files Changed

- `internal/api/contracts/contracts.go`
- `internal/api/contracts/contracts_test.go`
- `internal/anime/service.go`
- `internal/anime/editor_query_service_test.go`
- `internal/anime/schedule_query_service.go`
- `internal/anime/editor_service.go`
- `internal/anime/editor_service_test.go`
- `internal/anime/schedule_service.go`
- `internal/anime/legacy/gateway.go`
- `internal/anime/legacy/batch.go`
- `internal/anime/legacy/recovery.go`
- `internal/anime/legacy/file_mutation.go`
- `internal/anime/legacy/batch_durability_test.go`
- `internal/anime/schedule_service_test.go`
- `internal/anime/self_echo.go`
- `internal/anime/watcher.go`
- `frontend/src/shared/helpers/anime-estado.helpers.ts`
- `frontend/src/shared/helpers/anime-estado.helpers.types.ts`
- `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-workspace.constants.ts`
- `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-workspace.helpers.ts`
- `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/__tests__/anime-editor-workspace.helpers.test.ts`
- `frontend/vite.config.ts`
- `openspec/changes/edit-anime/apply-progress.md`
- `internal/anime/writer.go`
- `internal/anime/write_base_store.go`
- `internal/anime/legacy/wire.go`
- `internal/sync/schema.go`
- `internal/sync/batch_replacement_store.go`
- `internal/sync/sqlite_bootstrap_migrations_test.go`
- `internal/sync/write_base_store.go`
- `frontend/src/shared/hooks/use-async-list/use-async-list.ts`
- `frontend/src/shared/hooks/use-async-list/__tests__/use-async-list.test.ts`
- `app.go`
- `app_runtime_editor.go`
- `app_runtime_editor_dto.go`
- `app_runtime_editor_test.go`

## Remaining Work

- Parent verification remains responsible for Phase 5 repository-wide Go/architecture/OpenSpec gates and the final verify report.
- The frontend apply block is complete and green; no final PASS verify report was created.
- Replace the premature overall verify artifact only after every remaining task passes; this pass verifies the requested backend/editor block only.

## Risks

- Batch durability is now protected by real filesystem, SQLite, writer, watcher, and outbox tests. Cross-process writers outside this bridge still cannot participate in the in-process coordinator; generation revalidation detects changes observed before promotion and retries, while the legacy desktop remains an external filesystem actor.
- The previous verify report and task completion state were overclaimed and are now explicitly reopened.

## Current State

```text
Apply reopened; fresh-review blockers/warnings fixed.
- Backend/editor contract tasks 1.2, 1.3, 2.1, and 2.2 are now proven green.
- B1-B5 blockers and W1-W4 warnings from the fresh review are resolved.
- Frontend UI and final verification tasks remain reopened.
- The verify artifact is intentionally invalidated pending parent verification.
```
