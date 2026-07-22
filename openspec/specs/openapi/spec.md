# Specification: OpenAPI Static Documentation & checkopenapi Gate

## 1. Requirements

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

### REQ-2: `checkopenapi` CLI tool
- Must be located at `tools/checkopenapi/main.go`.
- Must use `gopkg.in/yaml.v3` to parse `docs/openapi.yaml`.
- Must extract registered paths from `internal/api/router.go` via regex: `mux\.Handle(?:Func)?\("([^"]+)"`.
- Must apply the following normalization and exclusion rules to extracted paths:
  - `/api/animes/` normalizes to `/api/animes/{id}`.
  - `/api/animes` is excluded (always 405).
  - `/ws` is excluded.
- Must fail with an actionable error message naming the missing path if any required path is missing from the YAML.
- Must pass silently (printing a single short stdout pass message: `OpenAPI gate passed.`) if all paths are covered.
- If `docs/openapi.yaml` is truly missing, it must print `docs/openapi.yaml not found; skipping OpenAPI gate.` and pass (do not fail silently in normal operation).
- Must follow existing `tools/` conventions exactly:
  - `package main`
  - Use `os.Getwd()` for root directory detection.
  - Use `fail(context string, err error)` helper which prints to `stderr` and calls `os.Exit(1)`.
  - Invoked via `go run ./tools/checkopenapi`.

### REQ-3: Pre-commit gate integration
- `lefthook.yml` must be updated with a new job named `openapi` running `go run ./tools/checkopenapi`.
- The `openapi` job must run after the `sdd-gate` (in the last position).
- `go.mod` must be updated to include `gopkg.in/yaml.v3` as a direct dependency.

## 2. Scenarios

**Scenario 1: All paths documented**
- **Given** `router.go` registers paths and `openapi.yaml` documents them all.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate passes with message `OpenAPI gate passed.`.

**Scenario 2: Missing path in YAML**
- **Given** a new path `/api/health` is added to `router.go` but not to `openapi.yaml`.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails with an actionable message naming the missing path `/api/health`.

**Scenario 3: /ws is excluded**
- **Given** `/ws` is present in `router.go`.
- **When** the `checkopenapi` tool extracts paths.
- **Then** `/ws` is NOT flagged as missing from the REST paths in YAML.

**Scenario 4: /api/animes is excluded**
- **Given** `/api/animes` is present in `router.go`.
- **When** the `checkopenapi` tool extracts paths.
- **Then** `/api/animes` is NOT flagged as missing from the REST paths in YAML.

**Scenario 5: Malformed YAML**
- **Given** `docs/openapi.yaml` contains invalid YAML syntax.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails with a parse error message.

**Scenario 6: Missing OpenAPI version**
- **Given** `docs/openapi.yaml` is missing the required `openapi` version field.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails indicating the missing version.

**Scenario 7: PATCH /api/animes/{id} - Valid partial body**
- **Given** an authenticated request to `PATCH /api/animes/123` with body `{"estado": 1}`.
- **When** the API processes the request.
- **Then** the response is `200 OK` with `{"status": "ok"}`.

**Scenario 8: PATCH /api/animes/{id} - Invalid estado**
- **Given** an authenticated request to `PATCH /api/animes/123` with body `{"estado": 5}`.
- **When** the API processes the request.
- **Then** the response is `400 Bad Request`.

**Scenario 9: POST /api/devices/pair - Valid body**
- **Given** an unauthenticated request to `POST /api/devices/pair` with `{"pairing_token": "abc", "device_name": "test"}`.
- **When** the API processes the request.
- **Then** the response is `201 Created` containing `device_id`, `device_name`, and `auth_token`.

**Scenario 10: POST /api/devices/pair - No auth required**
- **Given** a request to `POST /api/devices/pair` without a Bearer token.
- **When** the API processes the request.
- **Then** the request is accepted (no 401 Unauthorized for missing auth).

**Scenario 11: POST /api/sync/reconcile - Missing auth**
- **Given** a request to `POST /api/sync/reconcile` without a Bearer token.
- **When** the API processes the request.
- **Then** the response is `401 Unauthorized`.
