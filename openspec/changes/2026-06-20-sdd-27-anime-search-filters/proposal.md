# Proposal: AnimePanel Search & Advanced Filters

**Change ID:** `2026-06-20-sdd-27-anime-search-filters`
**Date:** 2026-06-20
**Depends on:** `2026-06-20-sdd-26-anime-section-active-filter`

## Intent

Add a fast, responsive search box and a set of advanced filter controls to the `/animes` catalog so users can quickly narrow down large anime lists.

## Scope

### In scope
- Extend the Wails `GetAnimes` contract to expose `tipo`, `dias` and `generos`.
- Add a free-text search box that matches anime names.
- Add single-select filters for `estado`, `activo`, `tipo`, and `día`.
- Add a multi-select filter for `géneros`.
- Debounce the search query to avoid filtering on every keystroke.
- Memoize filtered results for perceived performance.
- Keep filter state inside the panel hook for the first iteration.
- Full TDD coverage for helpers, hook, and UI components.

### Out of scope
- Virtualization (deferred until profiling shows a need).
- URL query-string persistence of filters.
- Backend-side search or filtering (all filtering happens client-side against the loaded catalog).
- Fuzzy/full-text search libraries (use simple substring matching).
- Sorting controls beyond the existing name sort.

## Approach Summary

1. Extend `contracts.AnimeListItem` in Go with `Tipo`, `Dias []string`, and `Generos []string`.
2. Regenerate Wails JS bindings.
3. Extend the frontend `Anime` contract and Zod schema.
4. Add `AnimeFilterState` and `AnimeFilterBarProps` types.
5. Add pure filter helpers with JSDoc and colocated tests.
6. Add a `useDebounce` hook in `frontend/src/shared/hooks/`.
7. Generate an `AnimeFilterBar` sub-component and make it a controlled dumb UI.
8. Wire filter state, debounced query, and memoized filtered list into `use-anime-panel.ts`.
9. Render `AnimeFilterBar` above the list in `AnimePanel.tsx`.

## Acceptance Criteria

- Typing in the search box filters the list after a short debounce.
- Selecting filters updates the list immediately.
- Multiple filters combine with AND semantics.
- The list is empty only when no anime matches the active filters.
- Filter controls have human-readable labels.
- All helpers and hooks have colocated tests written first.
- Frontend lint, typecheck, and tests pass; Go tests pass; lefthook gate passes.

## Risks

1. **Backend contract change:** adding fields to `AnimeListItem` requires Wails binding regeneration.
2. **Unknown numeric labels:** `estado` and `tipo` codes need human labels. We will add reasonable defaults and document that they may need adjustment against the legacy app.
3. **Noisy fixture data:** `dias` contains encoding issues (`SA�bado`) and `generos` may be null/empty. Helpers must normalize these.
4. **Select key serialization:** HeroUI Select uses string keys; numeric codes need round-trip parsing.

## Dependencies

- SDD-26 (Anime catalog binding and panel) is committed.
- `@heroui/react` v3 Select and Input components.
