# Delta for OpenAPI

## ADDED Requirements

### Requirement: SeasonAnimeDTO wire fields are announced

`docs/openapi.yaml` SHALL document the `folderPath` and `pageUrl` fields added
to the `SeasonAnimeDTO` wire shape as an additive, backward-compatible change.
This is a Wails-binding DTO, not a REST path, so no new REST endpoint or
`checkopenapi` path entry is required — the announcement SHALL take the form
of an updated schema/description for the existing season DTO documentation
already present in the OpenAPI doc set, or an explicit changelog-style note if
no prior `SeasonAnimeDTO` schema entry exists.

#### Scenario: new fields are discoverable in the doc
- **GIVEN** `docs/openapi.yaml` after this change
- **WHEN** it is inspected for `SeasonAnimeDTO`-related documentation
- **THEN** `folderPath` and `pageUrl` MUST be described as additive string
  fields, empty for non-created rows

#### Scenario: no REST path regression
- **GIVEN** `go run ./tools/checkopenapi` after this change
- **WHEN** the gate runs
- **THEN** it MUST still pass, because no REST path was added or removed
