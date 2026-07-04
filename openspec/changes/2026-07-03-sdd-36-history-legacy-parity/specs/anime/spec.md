# Delta for Anime (Catalog Reverts to Inventory-Only)

## ADDED Requirements

### Requirement: Catalog Is Inventory-Only After History Promotion
With History promoted to its own top-level section, the Catalog surface MUST contain no History
lens or segmented control, and its title/subtitle copy MUST describe the synchronized inventory
only. The `GetAnimes` binding, `AnimeListItem` DTO, and existing `search-filters`/`soft-delete`
behavior remain UNCHANGED by this delta.

#### Scenario: No lens switch on Catalog
- GIVEN the Catalog surface after this change
- WHEN it renders at `/catalog`
- THEN no Catalog/History segmented control MUST be present

#### Scenario: Catalog data contract untouched
- GIVEN the Catalog surface
- WHEN it fetches and filters its data
- THEN it MUST still use `GetAnimes`/`AnimeListItem` with `search-filters.md` and
  `soft-delete.md` behavior exactly as before
