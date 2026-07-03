# Delta for Anime (Catalog Rename)

## ADDED Requirements

### Requirement: Catalog Surface Naming and Navigation Entry
The section previously labeled "Animes" MUST be renamed to "Catalog" in UI copy and its
navigation entry, while preserving its existing route/binding semantics. This requirement covers
naming/labeling ONLY: `search-filters` (`openspec/specs/anime/search-filters.md`) and
`soft-delete` (`openspec/specs/anime/soft-delete.md`) behavior are UNCHANGED by this rename and
are not modified by this delta.

#### Scenario: Section label reads Catalog
- GIVEN the frontend renders the renamed anime section
- WHEN the navigation/page renders
- THEN the visible label MUST read "Catalog" (English), not "Animes"

#### Scenario: Existing filter and soft-delete behavior unaffected by rename
- GIVEN the Catalog surface after the rename
- WHEN a user applies search/filter controls, or a record is logically deleted
- THEN behavior MUST match `search-filters.md` and `soft-delete.md` exactly as before the
  rename — only the label/navigation entry changed

#### Scenario: GetAnimes/AnimeListItem contract intact under the new label
- GIVEN the renamed Catalog surface
- WHEN it fetches its data
- THEN it MUST still use the existing `GetAnimes` binding and `AnimeListItem` DTO, unchanged
