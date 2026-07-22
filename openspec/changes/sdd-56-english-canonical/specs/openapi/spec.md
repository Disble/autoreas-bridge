# Delta for OpenAPI

SDD-55 added English PATCH aliases (`status`, `episodesWatched`, `days`)
additively alongside the Spanish wire names, keeping GET responses, the
WebSocket payload, and the `/api/animes/changes` changelog feed entirely
Spanish. SDD-56 supersedes that additive approach with a **hard, breaking
cutover**: every consumer-facing surface — GET responses, WS payloads, the
changelog feed, and PATCH requests — speaks English only. The SDD-55
`firstPresentField` dual-key acceptance is deleted; Spanish is no longer
accepted or emitted anywhere on the wire.

## MODIFIED Requirements

### REQ-1: Static OpenAPI Document Uses English-Only Wire Field Names

`docs/openapi.yaml` MUST document `GET /api/animes`, `GET /api/animes/{id}`,
`GET /api/animes/changes`, the `/ws` anime-change payload, and the
`PATCH /api/animes/{id}` request body using **only** the English field
vocabulary (`id`, `name`, `episodesWatched`, `status`, `active`,
`firstCycle`, `days`, `day`, `order`, `createdAt`, `premieredAt`,
`lastWatchedAt`, `deletedAt`, `totalEpisodes`, `durationMinutes`, `kind`,
`sourceUrl`, `folder`, `origin`, `studios`, `genres`, `cover`, `repetitions`,
`numRepetitions`, `repeatedAt`). The document MUST NOT document the Legacy
Spanish names (`_id`, `nombre`, `estado`, `nrocapvisto`, `activo`,
`primeravez`, `dias`, `dia`, `orden`, `fechaCreacion`, `fechaEstreno`,
`fechaUltCapVisto`, `fechaEliminacion`, `totalcap`, `duracion`, `tipo`,
`pagina`, `carpeta`, `origen`, `estudios`, `generos`, `portada`, `repetir`,
`numrepeticion`, `fechaRepeticion`) as accepted or emitted fields on any
surface, including the SDD-55 additive English aliases' Spanish
counterparts. Date fields MUST be documented as plain epoch-millisecond
integers or `null`, not as a `{"$$date": ...}` wrapper object. The document
MUST also describe the `PATCH /api/animes/{id}` `400 Bad Request` response
for a body whose only recognized keys are superseded Spanish field names,
per REQ-1's fail-loud requirement below. The document MUST remain valid
OpenAPI 3.1.0 and MUST continue to document exactly `POST /api/devices/pair`,
`PATCH /api/animes/{id}`, and `POST /api/sync/reconcile`, plus the `/ws`
informational note.

(Previously: SDD-55 documented `PATCH /api/animes/{id}` accepting English
names additively alongside the Legacy-Spanish names `estado`, `nrocapvisto`,
and `dias`, and left GET/WS/changelog payloads Spanish. SDD-56 removes the
Spanish names entirely from every documented surface — this is a breaking
removal, not an additive rename.)

#### Scenario: PATCH body documents English-only fields

- **GIVEN** `docs/openapi.yaml` after this change
- **WHEN** a reader inspects the `PATCH /api/animes/{id}` request body schema
- **THEN** it documents only the English field names
- **AND** it does not document `estado`, `nrocapvisto`, or `dias` as
  accepted alternate/alias field names

#### Scenario: GET and changelog responses document English-only fields

- **GIVEN** `docs/openapi.yaml` after this change
- **WHEN** a reader inspects the `GET /api/animes`, `GET /api/animes/{id}`,
  and `GET /api/animes/changes` response schemas
- **THEN** every documented field name is English
- **AND** no Spanish field name (`_id`, `nombre`, `estado`, `nrocapvisto`,
  `activo`, `primeravez`, `dias`, `generos`, `fechaUltCapVisto`,
  `fechaCreacion`, `portada`, …) is documented as part of the response shape

#### Scenario: Date fields document as plain integers

- **GIVEN** `docs/openapi.yaml` after this change
- **WHEN** a reader inspects any nullable date field (e.g. `lastWatchedAt`,
  `deletedAt`)
- **THEN** it is documented as an integer epoch-millisecond value or `null`
- **AND** it is not documented as a `{"$$date": ...}` wrapper object

#### Scenario: PATCH request with only stale Spanish keys fails loud with 400

- **GIVEN** an authenticated `PATCH /api/animes/{id}` request whose body's
  only *recognized* keys are superseded Spanish field names (`estado`,
  `nrocapvisto`, `dias`, or any other name from the superseded vocabulary),
  with no recognized English field name present anywhere in the body
- **WHEN** the API processes the request
- **THEN** it returns `400 Bad Request` — a definitive "decommissioned wire
  format" signal, not a silent no-op — so an un-migrated mobile client
  fails loudly instead of appearing to succeed while updating nothing
- **AND** the same request using the English field names (`status`,
  `episodesWatched`, `days`) applies the update normally, returning
  `200 OK`

#### Scenario: PATCH request with a valid English field is processed normally

- **GIVEN** an authenticated `PATCH /api/animes/{id}` request whose body
  contains at least one recognized English field name (e.g. `status`),
  regardless of whether it also contains a stale Spanish key
- **WHEN** the API processes the request
- **THEN** the recognized English field is applied
- **AND** the request does NOT fail with 400 for containing a stale
  Spanish key alongside a valid English one

#### Scenario: Truly-unknown keys keep existing silent-ignore behavior

- **GIVEN** an authenticated `PATCH /api/animes/{id}` request whose body
  contains a key that was never part of either the Spanish or English wire
  vocabulary (e.g. a typo or a client-invented field)
- **WHEN** the API processes the request
- **THEN** that unrecognized key is silently ignored, exactly as before
  this change — the 400 fail-loud behavior applies only to bodies whose
  sole recognized keys are superseded Spanish field names

#### Scenario: checkopenapi gate still passes after the cutover

- **GIVEN** `internal/api/router.go` and the English-only
  `docs/openapi.yaml`
- **WHEN** `go run ./tools/checkopenapi` runs
- **THEN** the gate passes with `OpenAPI gate passed.`, using the
  English-only field documentation

### REQ-1b: Wire Cutover Is a Breaking Change, Announced and Lockstep-Coordinated

This wire vocabulary cutover MUST be recorded in `docs/openapi.yaml` and
MUST be announced as a **breaking change** to the `autoreas-mobile`
consumer, superseding SDD-55's additive/non-breaking coordination
requirement. Unlike an additive rename, Bridge MUST NOT continue accepting
or emitting the Spanish vocabulary after this change ships. The Bridge
deploy/flip to production MUST be gated on `autoreas-mobile` shipping its
English-only client build in lockstep — merging this change to Bridge's
`main` branch does not authorize deploying it before mobile is ready.

(Previously: SDD-55 required the rename be additive at the transport level,
with Bridge continuing to accept the Legacy-Spanish names so an
un-migrated mobile client would not break. SDD-56 removes that safety net
by design — the cutover is intentionally breaking.)

#### Scenario: Breaking-change notice exists before merge

- **GIVEN** the SDD-56 wire cutover is ready to merge
- **WHEN** the change is prepared for merge
- **THEN** `docs/openapi.yaml` reflects the English-only wire vocabulary
- **AND** `docs/sdd-55-mobile-impact.md` has been replaced with a
  breaking-change migration notice documenting the cutover for mobile
- **AND** the breaking change has been announced/coordinated with the
  `autoreas-mobile` repository before the merge

#### Scenario: Deploy is gated on mobile lockstep readiness

- **GIVEN** the SDD-56 code has merged to Bridge's `main` branch
- **WHEN** a maintainer considers deploying that build to production
- **THEN** the deploy MUST NOT proceed until `autoreas-mobile` has shipped
  an English-only client build capable of reading the new wire vocabulary

## ADDED Requirements

### Requirement: `docs/sdd-55-mobile-impact.md` Is Replaced With a Breaking-Change Notice

The system MUST replace `docs/sdd-55-mobile-impact.md` — which documented
SDD-55's additive, non-breaking English-alias rollout — with a document
describing the SDD-56 breaking cutover: the full English name map, the
`$$date`-flattening change, the `kind`/`sourceUrl` unification, and explicit
guidance that mobile MUST update its client to read English-only fields
before Bridge is deployed with this change.

#### Scenario: Reader finds the breaking-change notice

- **GIVEN** a mobile maintainer preparing for the SDD-56 cutover
- **WHEN** they open `docs/sdd-55-mobile-impact.md`
- **THEN** they find a breaking-change notice describing the full English
  name map, the `$$date` flattening, and the `kind`/`sourceUrl` unification
- **AND** the document no longer describes SDD-55's additive/non-breaking
  rollout as the current state
