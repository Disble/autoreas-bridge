# Tasks: Active-Only Syncing Anime + New Animes Section

## Backend

- [x] B1 — Add `Activo int` to `contracts.SyncingAnimeItem` in `internal/api/contracts/contracts.go`.
- [x] B2 — Filter inactive rows in `internal/sync/service.go` `ListPendingAnimeSyncs`.
- [x] B3 — Add `contracts.AnimeListItem` DTO in `internal/api/contracts/contracts.go`.
- [x] B4 — Add `ListAnimeItems` to `internal/anime/service.go` `QueryService`.
- [x] B5 — Add `GetAnimes` Wails binding in `app.go`.
- [x] B6 — Regenerate or manually update Wails JS bindings (`frontend/wailsjs/go/main/App.js`, `App.d.ts`, `frontend/wailsjs/go/models.ts`).
- [x] B7 — Add/update Go tests for active-only filter and `ListAnimeItems`.

## Frontend shared contracts

- [x] F1 — Add `activo: number` to `frontend/src/shared/contracts/syncing-anime.types.ts` `SyncingAnime`.
- [x] F2 — Create `frontend/src/shared/contracts/anime.types.ts` with `Anime` interface.

## Frontend runtime source

- [x] F3 — Add `getAnimes` to `BridgeRuntimeSource` interface and `createBridgeRuntimeSource` in `frontend/src/infrastructure/bridge-runtime-source.ts`.
- [x] F4 — Add/update `bridge-runtime-source.test.ts` for `getAnimes`.

## Frontend AnimePanel feature

- [x] F5 — Generate scaffold: `bun --cwd="frontend" run generate:feature anime AnimePanel`.
- [x] F6 — Implement `anime-panel.types.ts` with readonly props and view model.
- [x] F7 — Implement `anime-panel.constants.ts`.
- [x] F8 — Implement `anime-panel.helpers.ts` with JSDoc on exported functions.
- [x] F9 — Implement `use-anime-panel.ts` following 10-step hook anatomy.
- [x] F10 — Implement `AnimePanel.tsx` as dumb HeroUI/Tailwind list with active/inactive badge.
- [x] F11 — Add colocated tests: helpers, hook, component.

## Routing and navigation

- [x] F12 — Create `frontend/src/app/routes/AnimeRoute.tsx`.
- [x] F13 — Register `/animes` route in `frontend/src/App.tsx`.
- [x] F14 — Add Animes nav item in `frontend/src/app/AppLayout.tsx`.

## Verification

- [x] V1 — `go test ./...` passes.
- [x] V2 — `bun --cwd="frontend" run test` passes.
- [x] V3 — `bun --cwd="frontend" run lint` passes.
- [x] V4 — `bun --cwd="frontend" run typecheck` passes.
- [x] V5 — `lefthook` pre-commit gate passes.
