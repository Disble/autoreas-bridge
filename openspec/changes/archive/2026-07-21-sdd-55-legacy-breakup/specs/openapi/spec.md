# Delta for OpenAPI

SDD-55 English-ifies the remaining Legacy-Spanish wire field names left over
from the byte-compat boundary now that Bridge no longer talks to
`animes.dat`. Renames MUST be additive/coordinated: Bridge accepts and emits
the new English names, announces the change in `docs/openapi.yaml`, and
coordinates the rollout with the `autoreas-mobile` consumer before the wire
change ships, per the mandatory API-consumer doc-update convention.

## MODIFIED Requirements

### Requirement: Static OpenAPI Document Uses English Wire Field Names

`docs/openapi.yaml` MUST document the `PATCH /api/animes/{id}` request body
using English field names instead of the Legacy-Spanish names
`estado`, `nrocapvisto`, and `dias`. The document MUST remain valid OpenAPI
3.1.0 and MUST continue to document exactly `POST /api/devices/pair`,
`PATCH /api/animes/{id}`, and `POST /api/sync/reconcile`, plus the `/ws`
informational note.

(Previously: the document specified `estado`, `nrocapvisto`, and `dias` as
the literal wire field names for `PATCH /api/animes/{id}`. SDD-55 renames
these to their English equivalents as part of the full Legacy cold cut; the
underlying semantics — status enum range, fractional progress, and the
day-list shape — are unchanged.)

#### Scenario: Renamed fields are documented

- **GIVEN** `docs/openapi.yaml` after this change
- **WHEN** a reader inspects the `PATCH /api/animes/{id}` request body schema
- **THEN** it documents the English field names replacing `estado`,
  `nrocapvisto`, and `dias`
- **AND** it no longer documents those Legacy-Spanish names as the primary
  wire contract

#### Scenario: Unknown-field and validation behavior is unchanged

- **GIVEN** an authenticated `PATCH /api/animes/{id}` request with the
  renamed English fields
- **WHEN** the API processes the request
- **THEN** it applies the same validation ranges previously documented for
  `estado` and `nrocapvisto` (status enum range, fractional progress `>= 0`)
- **AND** unknown body fields are still silently ignored

### Requirement: Wire Rename Is Announced and Coordinated With Mobile

Any REST or WebSocket field rename introduced by this change MUST be recorded
in `docs/openapi.yaml` and MUST be coordinated with the `autoreas-mobile`
consumer before the rename merges, per the project's API-consumer
doc-announcement convention. The rename MUST be additive at the transport
level: Bridge MUST accept the renamed fields going forward, and the rollout
MUST NOT silently break an un-migrated mobile client without prior
announcement.

#### Scenario: Mobile coordination precedes the merge

- **GIVEN** the Slice C wire rename is ready to merge
- **WHEN** the change is prepared for merge
- **THEN** `docs/openapi.yaml` reflects the renamed fields
- **AND** the rename has been announced/coordinated with the
  `autoreas-mobile` repository before the merge, per the existing
  API-consumer doc-update convention

#### Scenario: checkopenapi gate still passes after the rename

- **GIVEN** `internal/api/router.go` and the renamed `docs/openapi.yaml`
- **WHEN** `go run ./tools/checkopenapi` runs
- **THEN** the gate passes with `OpenAPI gate passed.`, using the renamed
  field documentation
