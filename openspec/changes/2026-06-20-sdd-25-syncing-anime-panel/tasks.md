# Tasks: Syncing anime dashboard panel (sdd-25)

> Dashboard slice for current syncing anime items, backed by pending changelog
> rows and implemented under strict TDD.

## Review Workload Forecast

- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Chain strategy: pending

## Phase 1: Backend runtime truth (test-first)

- [x] 1.1 RED: extend `internal/sync/changelog_store_test.go` for `ListPending(ctx)` returning only pending rows in newest-first order.
- [x] 1.2 GREEN: implement `ChangelogStore.ListPending`.
- [x] 1.3 RED: extend `internal/sync/service_test.go` for `ListPendingAnimeSyncs(ctx)` compacting by `anime_id`, using the latest pending snapshot for title/progress, and counting duplicate pending rows.
- [x] 1.4 GREEN: implement `TriggerService.ListPendingAnimeSyncs` and the new DTO in `internal/api/contracts/contracts.go`.
- [x] 1.5 RED: extend `app_test.go` for `GetSyncingAnimeItems()` returning `[]` when unavailable and delegating to the sync service when present.
- [x] 1.6 GREEN: implement `App.GetSyncingAnimeItems()` and the Wails JS typings.

## Phase 2: Frontend helper + hook (test-first)

- [x] 2.1 RED: replace the scaffold helper tests with view-model tests covering progress labels, pending-count labels, fallback title, and empty changed-fields handling.
- [x] 2.2 GREEN: implement `syncing-anime-panel.helpers.ts`, `.types.ts`, and `.constants.ts` with JSDoc on exported helpers.
- [x] 2.3 RED: replace the scaffold hook tests with fetch-on-mount and refetch-on-refresh-token scenarios using the injected runtime source.
- [x] 2.4 GREEN: implement `use-syncing-anime-panel.ts` with the mandatory hook anatomy and the new runtime-source method.
- [x] 2.5 RED/GREEN: extend `use-bridge-dashboard.test.ts` / `use-bridge-dashboard.ts` so dashboard reconcile completion advances a refresh token for the syncing panel.

## Phase 3: Dumb UI composition

- [x] 3.1 RED: replace the scaffold component test with a rendering test covering empty state and a populated syncing item card.
- [x] 3.2 GREEN: implement `SyncingAnimePanel.tsx` as dumb HeroUI + Tailwind UI only.
- [x] 3.3 GREEN: compose the panel into `BridgeDashboard.tsx` without introducing Wails calls or business logic into `.tsx` files.

## Phase 4: Verification gate

- [x] 4.1 `go test ./...`
- [x] 4.2 `bun --cwd="frontend" run test`
- [x] 4.3 `bun --cwd="frontend" run validate`
- [x] 4.4 Write `verify-report.md` only if the executed validation supports `PASS` or `PASS WITH WARNINGS`.
