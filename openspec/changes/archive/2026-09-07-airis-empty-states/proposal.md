# Proposal: Airis Empty States

## Intent

Make resolved empty results useful on Today, Editor Library, and Catalog by pairing clear, accessible next steps with surface-specific Airis artwork.

## Scope

### In Scope
- Add three distinct 512×512 transparent WebP Airis compositions from `.ignore/blank/airis.png`, imported through Vite.
- Add one shared presentation-only `AirisEmptyState`; features own predicates, copy, and actions.
- Render Airis only after resolved empty results. Preserve loading and error branches.
- Add `/editor/create` to select Create; retain Library behavior for `/editor` and `/editor/:id`.
- Provide Create actions for actual-empty states and reset/guidance actions for filter/search-empty Editor Library and Catalog states.
- Add TDD coverage for state selection, decorative imagery, CTA accessibility, and route behavior.

### Out of Scope
- Backend, Wails, API, storage, and persisted-state changes.
- Empty-state changes outside Today, Editor Library, and Catalog.
- Extra illustration variants for filter/search sub-states.

## Capabilities

### New Capabilities
- `airis-empty-states`: Shared accessible, asset-backed empty-state presentation and the three scoped resolved-empty experiences.

### Modified Capabilities
- `anime-editor`: Define actual-empty and filtered-empty Library behavior and the Create deep link.
- `catalog-lists-all`: Preserve collection truth while distinguishing a vacant catalog from zero filtered matches.
- `desktop-navigation`: Define static `/editor/create` selection while retaining existing editor deep links.

## Approach

Create a small shared UI module with typed readonly props for the image, visible text, and optional action. Each feature computes its own state and supplies copy/action. Use decorative image semantics (`alt=""`, `aria-hidden="true"`), 512 intrinsic dimensions, eager loading, and async decoding. Add a controlled route-composed Create tab selected by `/editor/create`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `frontend/src/shared/ui/` | New | Presentation-only Airis component and tests. |
| `frontend/src/assets/airis-empty-states/` | New | Three Vite-imported transparent WebP assets. |
| `frontend/src/features/episodes/ui/EpisodeSchedulePanel/` | Modified | Today empty composition and Create CTA. |
| `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/` | Modified | Library actual/filter-empty experiences. |
| `frontend/src/features/catalog/ui/CatalogPanel/` | Modified | Catalog actual/filter-empty experiences. |
| `frontend/src/App.tsx`, `frontend/src/app/routes/AnimeEditorRoute.tsx` | Modified | Static Create route and selected tab composition. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Filtered state is described as an empty collection | Medium | Derive actual-versus-filtered state from loaded source items and active filters. |
| Create route collides with `:id` | Medium | Register and test the static route before the dynamic route. |
| Artwork clips or becomes inaccessible | Low | Fix intrinsic attributes and semantics; run component and browser/layout checks. |

## Rollback Plan

Revert the shared component, assets, feature branches, and static route in one change; existing text-only empty branches and Library routing return without data migration.

## Dependencies

- Supplied `.ignore/blank/airis.png` master artwork.
- Existing HeroUI v3 and React Router packages.

## Success Criteria

- [ ] Each scoped resolved-empty state shows its own Airis composition with accurate copy and action.
- [ ] Loading and error states never show Airis.
- [ ] Actual-empty states can reach `/editor/create`; filter/search-empty states guide correction without false collection claims.
- [ ] `/editor/create` opens Create while `/editor` and `/editor/:id` remain Library-oriented.
- [ ] Images are decorative and every visible action has an accessible name.
