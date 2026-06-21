# Proposal: Active-Only Syncing Anime + New Animes Section

**Change ID:** `2026-06-20-sdd-26-anime-section-active-filter`
**Date:** 2026-06-20

## Intent

1. Make the Dashboard's "Syncing Anime" panel show **only active animes** (`activo=true`).
2. Add a dedicated **"Animes" section** to the application navigation, similar to Network, Status, and Pairing, where the user can browse the full anime catalog and see active/inactive status clearly.

## Scope

### In scope
- Backend: extend the `SyncingAnimeItem` contract with an `activo` flag and filter inactive rows out of `GetSyncingAnimeItems`.
- Backend: add a new Wails binding `GetAnimes()` that returns the full anime catalog (active + inactive).
- Frontend: extend `BridgeRuntimeSource` with `getAnimes()`.
- Frontend: generate and implement a new `AnimePanel` feature module following the existing colocation pattern.
- Frontend: add a `/animes` route and nav item.
- Frontend: update `SyncingAnimePanel` tests to cover active-only filtering semantics.

### Out of scope
- Adding/removing/editing animes from the UI (read-only catalog for this change).
- Filtering, sorting, or search beyond a stable default order.
- Moving dashboard panels around or redesigning the dashboard layout.
- Changing the legacy `animes.dat` parser or writer.
- Persisting UI state (selected tab, scroll position, etc.).

## Approach Summary

### Active-only syncing filter
- Add `Activo int` to `contracts.SyncingAnimeItem`.
- In `internal/sync/service.go` (`TriggerService.ListPendingAnimeSyncs`), read the `activo` value from the latest snapshot and skip rows where `activo == 0`.
- Regenerate Wails bindings so the frontend receives the new field.
- Add Go tests that verify inactive rows are excluded and active rows remain.

### New Animes section
- Add `GetAnimes()` to `app.go`, delegating to an anime query service.
- Introduce a lightweight `AnimeListItem` contract (subset of `MobileAnime`) for the Wails binding to avoid leaking too many legacy fields.
- Extend `BridgeRuntimeSource` with `getAnimes()`.
- Generate `AnimePanel` with `bun --cwd="frontend" run generate:feature anime AnimePanel`.
- Implement the panel: hook fetches the list, helper maps to a view model, `.tsx` renders a HeroUI table/card list with an active/inactive badge.
- Add `/animes` route and register it in `App.tsx` and `AppLayout.tsx`.

## Decision: Top-Level Route vs Dashboard Panel

We will implement `/animes` as a **top-level route** with its own nav item, matching Network, Status, and Pairing. The Dashboard will keep its current panels. This keeps navigation consistent and gives the catalog room for future features (search, filtering, detail view) without crowding the Dashboard.

## Acceptance Criteria

- `GetSyncingAnimeItems` never returns an anime whose latest snapshot has `activo=false`.
- `SyncingAnimePanel` renders the same number of rows returned by `GetSyncingAnimeItems` and shows an empty message when none.
- `/animes` route exists and is reachable from the nav rail.
- `AnimePanel` displays the full catalog including active and inactive animes.
- Active/inactive status is visible for every row in `AnimePanel`.
- All new helpers and hooks have colocated tests written first (TDD).
- Frontend lint, typecheck, and tests pass; Go tests pass; lefthook gate passes.

## Risks

1. **`activo` semantics**: `MobileAnime.Activo` maps absent `activo` to `0`. If the legacy app treats absent as active, the filter will hide valid animes. We will verify against `resources/autoreas-data/animes.dat` fixtures.
2. **Wails binding regeneration**: Adding `GetAnimes` and changing `SyncingAnimeItem` requires regenerating JS bindings. We will use `wails generate module` or `wails dev` as needed.
3. **Scope ambiguity**: The user said "section/tab to the Dashboard". We chose a top-level route. If the user expected a dashboard panel, we can embed the same `AnimePanel` component later.
4. **TDD overhead**: New contract mapping, backend filter, hook, and helper all require tests.

## Dependencies

- SDD-25 (Syncing Anime panel) is complete and committed; we build on top of it.
- Existing `MobileAnime` contract and anime query service in `internal/anime`.
- Existing `BridgeRuntimeSource` and Wails infrastructure.
