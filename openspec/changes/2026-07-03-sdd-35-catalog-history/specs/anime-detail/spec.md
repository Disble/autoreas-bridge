# Anime Detail Specification

## Purpose
Shared, read-only detail view of a single anime, combining legacy catalog fields already
normalized onto `MobileAnime` (studios, origin, premiere date, genres, page, folder, first-watch
flag) plus the newly-typed `repetir` (repetition count) field, exposed via a new
`GetAnimeDetail(id)` Wails binding. Consumed identically from both Catalog and History surfaces —
one DTO, one component.

## Requirements

### Requirement: Typed Repetir Field on Legacy Anime Raw
The domain MUST expose `repetir` as a typed field on `LegacyAnimeRaw` (following the existing
tri-state field-accessor pattern used by `Pagina`/`Carpeta`/`Origen`), rather than leaving it in
the untyped `extraFields` catch-all. The parser MUST tolerate `repetir` being absent, null, or
present across the full `resources/autoreas-data/animes.dat` fixture (795 records) without error.

#### Scenario: repetir present in fixture parses to a typed value
- GIVEN a legacy record from `animes.dat` with a `repetir` value
- WHEN the record is parsed into `LegacyAnimeRaw`
- THEN `Repetir` MUST be accessible as a typed field, not via `extraFields`
- AND every one of the 795 fixture records MUST parse without error

#### Scenario: repetir absent does not error
- GIVEN a legacy record with no `repetir` key
- WHEN the record is parsed
- THEN the parser MUST NOT error
- AND the typed accessor MUST report an absent state distinguishable from an explicit zero

### Requirement: AnimeDetail DTO and GetAnimeDetail Binding
The system MUST expose a new `contracts.AnimeDetail` DTO and a `GetAnimeDetail(id string)` Wails
binding returning the detail-rich fields already normalized on `MobileAnime` (studios, origin,
genres, premiere date, page, folder, first-watch flag) plus the typed repetition count, for a
single anime ID. This binding MUST be additive: it MUST NOT replace or alter `GetAnimes` /
`AnimeListItem`.

#### Scenario: Detail fetched for an existing anime
- GIVEN an anime ID that exists in the bridge's catalog
- WHEN the frontend calls `GetAnimeDetail(id)`
- THEN the binding MUST return an `AnimeDetail` populated with the detail fields and repetition count

#### Scenario: Detail requested for an unknown ID
- GIVEN an anime ID that does not exist
- WHEN `GetAnimeDetail(id)` is called
- THEN the binding MUST return a not-found error/result rather than a zero-value DTO silently

#### Scenario: GetAnimes/AnimeListItem remain unaffected
- GIVEN the existing `GetAnimes` binding and `AnimeListItem` DTO
- WHEN `GetAnimeDetail` is introduced
- THEN `GetAnimes`'s existing shape and behavior MUST be unchanged
- AND all existing `GetAnimes`/`ListAnimeItems` tests MUST remain green

### Requirement: Shared Detail Component Across Catalog and History
The frontend MUST expose one `AnimeDetail` component/route reachable by ID from both the Catalog
surface and the History surface, rendering the same data for the same anime regardless of entry
point.

#### Scenario: Same anime detail from either entry point
- GIVEN an anime visible in both Catalog and History
- WHEN the user opens its detail from Catalog, then separately from History
- THEN both paths MUST render the same `AnimeDetail` component with identical data for that ID
