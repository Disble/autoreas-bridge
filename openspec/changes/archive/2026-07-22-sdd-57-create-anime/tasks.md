# Tasks: Create Anime (Editor, batch-capable)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1300 (backend ~350-450, frontend ~600-850) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend contract+service+batch+season) -> PR 2 (App binding+source method) -> PR 3 (AnimeScheduleOrdering generalization) -> PR 4 (anime-create feature+route tab) |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `Placement`/`Dias` contract + validation + canonical `Days` emission | PR 1 | `go test ./internal/api/contracts/... ./internal/anime/store/... -run Create` | N/A — pure validation/codec, no I/O harness | Revert contract+store changes; no downstream depends yet |
| 2 | `CreateBatch` atomic write + season gateway adapt | PR 1 (same branch) | `go test ./internal/anime/... -run CreateBatch` | `go run . ` against `resources/autoreas-data` dev copy, trigger season intake | Revert `create_batch.go` + gateway diff, keep contract from unit 1 |
| 3 | `App.CreateAnime` Wails binding + result DTO | PR 2 (base=PR1 branch) | `go build ./...` + `go test ./... -run CreateAnime` | `wails dev`, call binding from devtools console | Revert `app_runtime_create.go`; backend stays usable standalone |
| 4 | `bridge-runtime-source.createAnime` + wire DTO types | PR 2 (same branch) | `bun --cwd=frontend run test -- bridge-runtime-source` | `wails dev`, inspect network/binding call | Revert source method; no UI depends yet |
| 5 | `AnimeScheduleOrdering` generalization (`lockedAnimeIds`, draft seeding, `partitionCreateSubmit`) | PR 3 (base=PR2 branch) | `bun --cwd=frontend run test -- anime-schedule-ordering` | `wails dev`, open existing edit-mode schedule modal to confirm unchanged behavior | Revert additive props/helper; edit-mode caller untouched by construction |
| 6 | `anime-create` feature (grid + board mount + submit) + Editor Create tab | PR 4 (base=PR3 branch) | `bun --cwd=frontend run test -- anime-create` | `wails dev`, Editor -> Create tab, submit a 2-row batch | Revert new feature dir + route tab wiring; Library tab unaffected |

## Phase 1: Backend Contract Foundation

- [x] 1.1 RED: `internal/api/contracts/services_test.go` (or existing test file) — add failing test asserting `AnimeCreate` has `Dias []Placement` and no `Section`/`Orden` fields; add `Placement{Day string; Order int}` type test.
- [x] 1.2 GREEN: `internal/api/contracts/services.go` — replace `Section string`/`Orden int` with `Dias []Placement`; add `Placement` struct; add `AnimeCreateResult` DTO (`Outcome`, `Message`, `AnimeIDs`, `ModifiedAt`, `ConflictID`, `Details`).
- [x] 1.3 REFACTOR: fix all compile breaks referencing old `Section`/`Orden` on `AnimeCreate` across the repo (grep and update call sites).

## Phase 2: Create Validation and Canonical Snapshot

- [x] 2.1 RED: `internal/anime/create_service_test.go` — failing table test: `validateCreateRequest` rejects empty `Dias`, rejects a placement with empty `Day` or `Order<=0`, accepts one valid placement (spec: "Create without any placement is rejected").
- [x] 2.2 GREEN: `internal/anime/create_service.go` — update `validateCreateRequest` to require `len(Dias) >= 1` and validate each placement.
- [x] 2.3 RED: `internal/anime/store/create_test.go` — failing test: `NewCanonicalCreate` with multi-entry `Dias` emits full `days` array (not single `{Section,Order}`), `Section`/`Orden` absent from top-level JSON (spec: "Canonical structural state").
- [x] 2.4 GREEN: `internal/anime/store/create.go` — `CanonicalCreateInput.Days []AnimeDay`; `NewCanonicalCreate` maps `Dias` into `Days`.
- [x] 2.5 GREEN: `internal/anime/write_service.go` — thread `Dias`/`Days` from create request into `CanonicalCreateInput` before invoking `NewCanonicalCreate`.
- [x] 2.6 REFACTOR: dedupe placement-to-day mapping helper if used both in create_service and write_service.

## Phase 3: Atomic Batch Create (ApplyBatch)

- [x] 3.1 RED: `internal/anime/create_batch_test.go` (new) — failing test: `CreateService.CreateBatch` with 1 create + empty neighbors produces exactly one `ApplyBatch` call with one create `BatchOperation` (`Base` empty snapshot, `Desired` = canonical create JSON).
- [x] 3.2 RED: same file — failing test: `CreateBatch` with reflowed neighbors builds neighbor `BatchOperation`s via `buildScheduleOperation` shape (decode/`SetDays`/re-marshal) alongside create ops, all passed to one `ApplyBatch` call.
- [x] 3.3 RED: **threat-matrix case** — failing test: whole-batch rejection on stale neighbor base — one neighbor's base hash/`modifiedAt` mismatches current authority; assert `CreateBatch` returns error, `ApplyBatch` is invoked exactly once, and zero new anime IDs are returned (spec: "Stale existing neighbor rejects a create batch"). DEVIATION: implemented as an explicit pre-`ApplyBatch` staleness check (mirrors `ScheduleService.staleScheduleEntry`) rather than relying on the gateway's nowMs-based OCC race, so `ApplyBatch` is never invoked on a detected stale neighbor (stronger "no partial writes" guarantee); see apply-progress for rationale.
- [x] 3.4 RED: same file — failing test: empty-`Base` create op vs stale-base op in the same batch — confirm creates (empty Base) never trigger a stale-base rejection, only neighbor ops with a real prior snapshot do.
- [x] 3.5 GREEN: `internal/anime/create_batch.go` (new) — implement `CreateService.CreateBatch(ctx, []contracts.AnimeCreate, []contracts.ApplyAnimeScheduleDraftEntry) (contracts.AnimeCreateResult, error)`: validate/enrich each create, build create ops + neighbor reflow ops, call `Gateway.ApplyBatch` once, map result to `AnimeCreateResult`. DEVIATION: implemented as `CreateService.CreateBatch` + `WriteService.BuildCreateOperation`/`ApplyBatch` in `create_service.go`/`write_service.go` (no new `create_batch.go` file) to reuse the existing id-gen/clock seam cleanly; effective-line budget stayed well under the file-size gate either way.
- [x] 3.6 REFACTOR: extract shared "build neighbor reflow op" logic between `create_batch.go` and existing `buildScheduleOperation` caller to avoid duplication. DONE by direct reuse: `CreateService.buildNeighborOperations` calls the existing unexported `buildScheduleOperation` (same package) instead of a duplicate.

## Phase 4: Season Gateway Adaptation

- [x] 4.1 RED: `app_season_anime_gateway_test.go` — failing test: `seasonAnimeGateway.CreateAnime` builds `AnimeCreate.Dias = []Placement{{Day: in.Section, Order: nextOrden(...)}}` (spec: "Season intake adapts with a default placement"). DEVIATION: added to existing `app_season_availability_test.go` (which already hosts `fakeSeasonAnimeCreator`/`TestSeasonAnimeGatewayCreatePreservesAuthoritativeResult`) instead of a new file.
- [x] 4.2 GREEN: `app_season_anime_gateway.go` — update to construct `Dias` from the season default placement; keep `nextOrden` unchanged.
- [x] 4.3 REFACTOR: confirm no other season call sites reference removed `Section`/`Orden` fields. Verified via `go build ./...` + full `go test ./...` green.

## Phase 5: App Binding

- [x] 5.1 RED: `app_runtime_create_test.go` (new) — failing test: `App.CreateAnime(req)` maps wire DTO to `contracts.AnimeCreate`/`CreateBatch` call and returns mapped `AnimeCreateResult`.
- [x] 5.2 GREEN: `app_runtime_create.go` (new) — implement `App.CreateAnime` Wails binding calling `CreateService.CreateBatch` (via new `anime.BatchCreator` port + `App.animeCreateBatch` field, wired in `app_runtime_services.go`/`app_season_availability.go`).
- [x] 5.3 REFACTOR: verify Wails binding generation picks up the new method (`wails generate` or repo's binding-gen step) and no unused imports remain. Confirmed: `frontend/wailsjs/go/main/App.d.ts`/`App.js`/`frontend/wailsjs/go/models.ts` were auto-regenerated (background `wails dev`/codegen) and include `CreateAnime`, `main.AnimeCreateCommandDTO`, `contracts.AnimeCreateResult`, etc.

## Phase 6: Frontend Wire Types and Source Method

- [x] 6.1 RED: `frontend/src/infrastructure/__tests__/bridge-runtime-source.test.ts` — failing test for `createAnime(command)` calling the generated `CreateAnime` binding and mapping DTOs. DEVIATION: colocated at the existing top-level `frontend/src/infrastructure/__tests__/` convention (matches how every other bridge-runtime-source test lives), not a nested `bridge-runtime-source/__tests__/` dir.
- [x] 6.2 GREEN: `frontend/src/shared/contracts/anime.types.ts` — add `AnimeCreatePlacement`, `AnimeCreateItem`, `AnimeCreateCommand`, `AnimeCreateResult` (all readonly props). DEVIATION: `AnimeCreateCommand` has no `boardModifiedAt` (the generated `AnimeCreateCommandDTO` wire shape only has `creates`/`changedNeighbors`; each neighbor already carries its own `baseModifiedAt`).
- [x] 6.3 GREEN: `frontend/src/infrastructure/bridge-runtime-source/*` — implement `createAnime` source method + DTO mappers. `toAnimeCreateDTO` maps English frontend fields to the wire DTO's still-Spanish `nombre`/`pagina`/`carpeta`/`tipo`/`fechaEstreno` (inherited from `contracts.AnimeCreate`, out of scope for this slice to rename).
- [x] 6.4 REFACTOR: aligned naming/shape with existing source method conventions (`applyAnimeEditorSchedule`); reused `toOutcome`/`toWailsSchedulePlacement`.

## Phase 7: AnimeScheduleOrdering Generalization

- [x] 7.1 RED: `.../__tests__/anime-schedule-ordering.helpers.test.ts` — failing test: `partitionCreateSubmit(board, state)` splits `buildAnimeScheduleDraftPlacements(state)` output into `{ creates, changedNeighbors }` by `__draft__:` prefix.
- [x] 7.2 RED: **threat-matrix case** — failing test: board seeded with `lockedAnimeIds` renders those cards non-draggable (`data-locked="true"`, dnd-kit `disabled:{draggable:true}`), and inserting a draft ahead of a locked card reflows the locked card's position in the DOM without making it draggable (spec: "Existing cards are drag-locked but reflow on mid-insertion"). Test in `AnimeScheduleOrdering.test.tsx` using `testDriverRef.moveAnime`.
- [x] 7.3 RED: **threat-matrix case** — collision-safety is inherited for free: locked cards keep `droppable` enabled (only `draggable` is disabled) and `applyAnimeScheduleOrder`'s existing one-anime-per-destination check (untouched) rejects any duplicate-slot projection regardless of lock/draft status; covered by the existing `flags duplicate cards in one destination` helper test plus the new reflow test (no separate collision test needed since the collision engine itself was not touched).
- [x] 7.4 RED: `.../__tests__/use-anime-schedule-ordering.test.ts` — failing tests: hook seeds `__draft__:N` synthetic entries in staging when `draftEntries` supplied; `lockedAnimeIds` marks matching instances `locked:true`; edit-mode callers passing neither behave identically (regression); `onApplyCreateSubmit` (when provided) routes apply through `partitionCreateSubmit` instead of `onApply`/`createAnimeScheduleApplyEntries`.
- [x] 7.5 GREEN: `anime-schedule-ordering.types.ts` — added `lockedAnimeIds?`, `draftEntries?: readonly AnimeScheduleOrderingDraftEntry[]`, `onApplyCreateSubmit?`, and `instance.locked?: boolean`. DEVIATION: `onApply` widened to optional (still always passed by every existing caller) so a create-mode caller can omit it in favor of `onApplyCreateSubmit` — zero behavior change for callers that keep passing `onApply`.
- [x] 7.6 GREEN: `anime-schedule-ordering.helpers.ts` — implemented `seedDraftEntries`, `applyLockedAnimeIds`, `partitionCreateSubmit`, and `buildInitialAnimeScheduleOrderingState` (all no-ops when their new args are omitted/empty — verified by explicit regression tests).
- [x] 7.7 GREEN: `use-anime-schedule-ordering.ts` (routes `onApply` through `onApplyCreateSubmit` when present; initial/reset state uses `buildInitialAnimeScheduleOrderingState`) / `AnimeScheduleOrderingCard.tsx` (drag-disable via dnd-kit `disabled:{draggable:true}` + `data-locked`/`data-anime-id` attributes) — collision engine (`applyAnimeScheduleOrder`, `shouldBlockDuplicateHover`) untouched. `AnimeScheduleOrdering.tsx` needed no changes (props pass through unchanged).
- [x] 7.8 REFACTOR: ran full existing `AnimeScheduleOrdering.test.tsx` + `use-anime-schedule-ordering.test.ts` + `anime-schedule-ordering.helpers.test.ts` suites (31 tests) plus the full frontend suite (134 files / 1112 tests) green; `tsc --noEmit` and `eslint` (0 errors, 2 pre-existing-pattern `react-doctor` warnings on the reset/board-change effects, not new) clean.

## Phase 8: anime-create Frontend Feature

- [x] 8.1 RED: `frontend/src/features/anime-create/ui/AnimeCreate/__tests__/*.test.ts(x)` — failing tests first (helpers, hook, component). DEVIATION: the "optional metadata disclosure" scope is narrower than the task text implies -- `contracts.AnimeCreate` (verified in `internal/api/contracts/services.go`) has NO `progress`/`totalEpisodes`/`duration`/`cover` fields (design doc's own Open Questions already flags "optional-metadata enrichment stays nil-provider (out of scope)"); the disclosure covers only the fields the backend actually accepts: `folder` (primary row), `kind`/`premieredAt` (disclosed). Covered scenarios: empty Name/Page blocks submit (helpers), row without a placement blocks submit naming the row (helpers), one deferred submit sends exactly one `createAnime` call (hook), successful submit clears rows (hook), conflict/error keeps rows + surfaces message (hook), add/remove row reflects in the seeded staging cards (component).
- [x] 8.2 GREEN: `anime-create.types.ts` — readonly `AnimeCreateRowDraft`, `AnimeCreateRowPatch`, `AnimeCreateViewModel`.
- [x] 8.3 GREEN: `anime-create.constants.ts` — `ANIME_CREATE_MIN_ROWS`, unset-field sentinel, runtime-unavailable message.
- [x] 8.4 GREEN: `anime-create.helpers.ts` — `createAnimeCreateRow`, `validateAnimeCreateRow(s)`, `buildAnimeCreateCommand`, `applyRowFolder` (JSDoc on every export).
- [x] 8.5 GREEN: `use-anime-create.ts` — strict hook anatomy; fetches the shared board via `getAnimeEditorScheduleBoard('')` (origin id only affects `originHighlighted`, verified safe in `internal/anime/schedule_query_service.go`); routes submit through `AnimeScheduleOrdering`'s `onApplyCreateSubmit` seam (Phase 7) into `bridge-runtime-source.createAnime`.
- [x] 8.6 GREEN: `AnimeCreate.tsx` + `index.ts` — dumb UI: one `Card` per row (Name/Page/Type/Folder + Accordion-disclosed optional metadata), embedded `AnimeScheduleOrdering` with `draftEntries`/`lockedAnimeIds`/`onApplyCreateSubmit`, no Wails calls/`useEffect`/business logic in the `.tsx`. DEVIATION: required a new `reconcileDraftEntries` helper + effect in `anime-schedule-ordering.helpers.ts`/`use-anime-schedule-ordering.ts` (Phase 7 surface, additive) so seeded draft cards rename/add/remove reactively as rows change post-mount -- the original Phase 7 seeding only ran once at mount/board-change, which under-served a live batch grid.
- [x] 8.7 REFACTOR: every touched file stays well under 500 effective lines (largest is `AnimeCreate.tsx` ~95 lines); `eslint` on the new feature is 0 errors (only 1 advisory `react-doctor/no-barrel-import` warning from importing the existing `bridge-runtime-source` barrel, consistent with every other feature). `fallow` audit not run this batch (no duplication/complexity signal from eslint); flag for Phase 10 if warranted.

## Phase 9: Editor Route Wiring

- [x] 9.1 RED: `frontend/src/app/routes/__tests__/AnimeEditorRoute.test.tsx` (new) — failing test: Create tab renders the `anime-create` feature in place, no modal opens (spec: "Create tab opens without a modal").
- [x] 9.2 GREEN: `frontend/src/app/routes/AnimeEditorRoute.tsx` — Library/Create `Tabs` shell (HeroUI `Tabs`, uncontrolled `defaultSelectedKey`, no local state/effects/hooks in the route file itself — pure composition of `AnimeEditorWorkspace` and `AnimeCreate`). DEVIATION: added an `Element.prototype.getAnimations` polyfill to `frontend/src/test/setup.ts` — jsdom lacks the Web Animations API that HeroUI's `Tabs.Indicator` calls during its layout-effect transition, which otherwise throws and aborts the whole render in every `Tabs`-based test (this was a pre-existing gap, not previously hit because no test clicked a `Tabs.Tab` before this route test).
- [x] 9.3 REFACTOR: confirmed `AnimeEditorRoute.tsx` stays delivery/composition-only per CLAUDE.md constraint 4 (no `useState`/`useEffect`/Wails calls; tab selection is HeroUI's own uncontrolled state).

## Phase 10: Integration and Gate Verification

- [x] 10.1 Run `go test ./...`, `gofmt -l .`, `go vet ./...`, `golangci-lint run`, `go run ./tools/checkgofilesize` (baseline stays empty). — orchestrator-verified: all green.
- [x] 10.2 Run `bun --cwd="frontend" run test`, `bun --cwd="frontend" run lint` (ESLint >500 hard fail), `bun --cwd="frontend" run filesize:warning` (advisory). — orchestrator-verified: typecheck + 1134 tests pass, ESLint 0 errors, filesize advisory only (415/453 < 500).
- [ ] 10.3 Manual `wails dev` smoke: submit a 3-row batch (mixed weekday + `Sin ver`), confirm one atomic write, new animes selectable in Library, Create tab clears. — PENDING MANUAL (requires interactive app run by the user).
- [x] 10.4 Update `docs/openapi.yaml` (or equivalent wire-adjacent doc) announcing `App.CreateAnime` / `createAnime` per API-consumer convention. — done; `checkopenapi` passes.
- [x] 10.5 Append one line to `docs/learning-log.md` on any non-obvious decision hit during apply (e.g. ApplyBatch neighbor-op shape reuse). — done (two sdd-57 entries).
