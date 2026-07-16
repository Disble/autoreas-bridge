# Tasks: Edit Anime

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2200-3200 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 backend -> PR2 schedule core -> PR3 editor UI |
| Delivery strategy | single-pr-default |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Lossless backend editor + OCC contracts | PR 1 | Real-fixture tests, one append/event/changelog/ws |
| 2 | Reusable anime schedule ordering core | PR 2 | Thin Season adapter, atomic bulk apply |
| 3 | Anime Editor route, modal, guards, Wails wiring | PR 3 | HeroUI split pane, deep-link, sticky actions |

## Phase 1: Backend RED -> GREEN -> REFACTOR

- [x] 1.1 Add failing Go tests in `internal/api/contracts/contracts_test.go`, `internal/anime/legacy/{wire,mapper,gateway}_test.go`, and new `internal/anime/{editor_service,schedule_service,schedule_query_service}_test.go` for lossless DTOs, omitted-vs-clear semantics, unknown fields, structured `estudios`/`portada`, `modified_at` OCC, changed-record-only apply, and reject paths: stale, invalid, duplicate positions, no partial write.
- [x] 1.2 Make RED pass in `internal/api/contracts/contracts.go`, `internal/anime/{editor_service.go,schedule_service.go,schedule_query_service.go}`, and `internal/anime/legacy/{wire.go,mapper.go,gateway.go}` so accept = one append + `anime.changed` + changelog + websocket, reject = zero publication.
- [x] 1.3 Refactor without drift: reject `_id`/`modified_at`/`repetir`/`primeravez`, keep `activo=false` as **Deactivate anime**, and prove behavior with temp SQLite plus copied `resources/autoreas-data/animes.dat` fixtures.

## Phase 2: Runtime/Wails integration

- [x] 2.1 Add failing integration tests around `app_runtime.go` for `GetAnimeEditorRecord`, `SaveAnimeEditor`, `DeactivateAnime`, `GetAnimeEditorScheduleBoard`, and `ApplyAnimeEditorSchedule`; accept current authority payloads, reject `conflict`/`error`/nil-not-found with no publication.
- [x] 2.2 Wire the bindings in `app_runtime.go` and `frontend/src/infrastructure/bridge-runtime-source/{bridge-runtime-source.types.ts,bridge-runtime-source.helpers.ts,index.ts}` so frontend runtime sources expose authoritative outcomes and refreshed record/board payloads.

## Phase 3: Schedule ordering core RED -> GREEN -> REFACTOR

- [x] 3.1 Add Vitest failures in generated `frontend/src/features/anime-schedule-ordering/**/__tests__` and `frontend/src/features/season/ui/OrderingBoard/__tests__/*` for weekdays + `Sin ver`/`Ver hoy`/`Visto`, origin highlight/scroll, shared draft reset/apply, duplicate validation, and whole-draft stale reload; test helpers/hooks, not gestures.
- [x] 3.2 Implement `frontend/src/features/anime-schedule-ordering/**` with only `@dnd-kit/react` + `@dnd-kit/helpers`, then refactor `frontend/src/features/season/ui/OrderingBoard/**` into a thin Season adapter; no generic board, legacy dnd, native HTML5 DnD, or StrictMode removal.

## Phase 4: Anime Editor UI RED -> GREEN -> REFACTOR

- [x] 4.1 Add failing tests for `frontend/src/app/routes/AnimeEditorRoute.tsx`, `frontend/src/App.tsx`, `frontend/src/shared/navigation/app-layout.constants.ts`, `frontend/src/features/anime-detail/ui/AnimeDetail/__tests__/*`, and generated `frontend/src/features/anime-editor/**/__tests__` covering first-class `/editor`, dirty selection guard, sticky dirty/save area, `Discard changes`, Anime Detail deep-link, and blocked leave-after-conflict.
- [x] 4.2 Generate `frontend/src/features/anime-editor/**`, then implement the watching-first split pane with independent list/form scrolling, frequent fields visible, `More details`, near-full-screen schedule modal launch, and HeroUI primitives only; keep `.tsx` dumb, hook anatomy ordered, readonly props, helper JSDoc, and files under 500 lines.

## Phase 5: Verification

- [x] 5.1 Run focused RED/GREEN loops first (`go test ./internal/anime/... ./internal/api/contracts/...`; `bun --cwd="frontend" run test -- anime-editor anime-schedule-ordering OrderingBoard AnimeDetail`) and verify risky boundaries with temp files/SQLite plus copied real fixtures.
- [x] 5.2 Run repo gates: `go test ./...`, `go test ./... -cover`, `golangci-lint run`, `go vet ./...`, `bun --cwd="frontend" run test`, `bun --cwd="frontend" run validate`, `bun --cwd="frontend" run fallow audit --quiet`, `bun --cwd="frontend" run filesize:warning`, `go run ./tools/checkgofmt`, `go run ./tools/checkgofilesize`, `go run ./tools/checkarchitecture`, `go run ./tools/checksdd`, `go run ./tools/checkopenapi`.
