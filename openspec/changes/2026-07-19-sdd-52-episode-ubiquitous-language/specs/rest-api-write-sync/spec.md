# Delta for REST API Write & Sync

## MODIFIED Requirements

### Requirement: PATCH /api/animes/:id Happy Path

The system MUST accept valid PATCH requests to update an anime, applying changes and stamping the server timestamp.

(Previously: the scenario below was titled "fractional chapter"; SDD-52 renames
the description to "fractional episode" for domain-vocabulary consistency. The
wire field name `nrocapvisto` is the ADR-007 legacy boundary and is NOT
renamed — this is a scenario-title wording change only, no API contract
change.)

#### Scenario: Valid update with fractional episode
- GIVEN a valid bearer token AND an active anime
- WHEN the client sends `PATCH /api/animes/:id` with `{"nrocapvisto": 0.5}`
- THEN the system updates `nrocapvisto` to 0.5
- AND the server MUST stamp its own timestamp
- AND returns 200/204

#### Scenario: Update inactive anime
- GIVEN a valid bearer token AND an inactive anime (`activo=false`) present in snapshots
- WHEN the client sends `PATCH /api/animes/:id` with valid data
- THEN the system applies the update
- AND returns 200/204
