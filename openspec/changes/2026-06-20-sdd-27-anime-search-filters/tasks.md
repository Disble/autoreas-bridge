# Tasks: AnimePanel Search & Advanced Filters

## Backend

- [x] B1 — Extend `contracts.AnimeListItem` with `Tipo`, `Dias`, `Generos`.
- [x] B2 — Update `internal/anime/service.go` `ListAnimeItems` to populate new fields.
- [x] B3 — Add helper to extract day names from `[]MobileAnimeDay`.
- [x] B4 — Regenerate or manually update Wails JS bindings.
- [x] B5 — Add/update Go tests for `ListAnimeItems` extended fields.

## Frontend shared

- [x] F1 — Update `frontend/src/shared/contracts/anime.types.ts` `Anime` with new fields.
- [x] F2 — Create `frontend/src/shared/hooks/use-debounce.ts` with tests.

## Frontend AnimePanel types/constants

- [x] F3 — Add `AnimeFilterState`, `AnimeFilterBarProps`, `AnimeFilterOption` to `anime-panel.types.ts`.
- [x] F4 — Add filter constants and label maps to `anime-panel.constants.ts`.

## Frontend AnimePanel schema

- [x] F5 — Extend `anime-panel.schema.ts` with `tipo`, `dias`, `generos`.

## Frontend AnimePanel helpers

- [x] F6 — Add filter predicates and dynamic option builders to `anime-panel.helpers.ts`.
- [x] F7 — Add/update tests in `anime-panel.helpers.test.ts`.

## Frontend AnimePanel hook

- [x] F8 — Add filter state, debounced query, memoized filtered list, and callbacks to `use-anime-panel.ts`.
- [x] F9 — Add/update tests in `use-anime-panel.test.ts`.

## Frontend filter bar component

- [x] F10 — Generate `AnimeFilterBar` scaffold.
- [x] F11 — Implement controlled `AnimeFilterBar.tsx` with Input and Select controls.
- [x] F12 — Add `AnimeFilterBar.test.tsx`.

## Frontend AnimePanel integration

- [x] F13 — Render `AnimeFilterBar` in `AnimePanel.tsx`.
- [x] F14 — Update `AnimePanel.test.tsx` if needed.

## Verification

- [x] V1 — `go test ./...` passes.
- [x] V2 — `bun --cwd="frontend" run test` passes.
- [x] V3 — `bun --cwd="frontend" run lint` passes.
- [x] V4 — `bun --cwd="frontend" run typecheck` passes.
- [x] V5 — `lefthook` pre-commit gate passes.
