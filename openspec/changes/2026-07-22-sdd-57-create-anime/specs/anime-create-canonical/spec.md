# Delta for Anime Create Canonical

## MODIFIED Requirements

### Requirement: Canonical structural state

A create MUST provide `_id`, `nombre`, `nrocapvisto`, `estado`, `activo`,
`primeravez`, `fechaCreacion`, at least one placement in `Dias []Placement`,
and `pagina`. `Dias` MUST be REQUIRED with at least one entry; each entry's
day MUST be either a weekday or a documented special queue (e.g. `Sin ver`).
`Section` and `Orden` MUST NOT exist as separate top-level fields — they fold
into each `Dias` entry. The bridge MUST reject the create before append when
those fields cannot be constructed or when `Dias` is empty.
(Previously: create validated a single `dias` entry via separate
`Section`/`Orden` fields rather than a required `Dias []Placement` list.)

#### Scenario: Structurally invalid create is rejected

- **GIVEN** a create request cannot produce a valid id or schedule entry
- **WHEN** canonical validation runs
- **THEN** the bridge returns an error and appends no `animes.dat` line

#### Scenario: Create without any placement is rejected

- **GIVEN** a create request has an empty `Dias` list
- **WHEN** canonical validation runs
- **THEN** the bridge returns an error and appends no `animes.dat` line

#### Scenario: Season intake adapts with a default placement

- **GIVEN** season intake creates an anime without an explicit placement
- **WHEN** the create request is built
- **THEN** the request includes a default `Sin ver` placement
- **AND** canonical validation passes using that default

### Requirement: Honest nullable metadata

`totalcap` and `duracion` MUST be explicitly serialized and MAY be null when an
authoritative value is unknown. `portada` MUST be a Legacy `{type,path}` object;
when unavailable it MUST equal `{ "type": "url", "path": "" }`. The bridge
MUST NOT infer announced `totalcap` from the latest aired episode.

#### Scenario: Authoritative announced count is written

- **GIVEN** metadata provides an authoritative announced total of 24
- **WHEN** the anime is created
- **THEN** `totalcap` is serialized as 24

#### Scenario: Unknown metadata stays honest

- **GIVEN** announced total and duration are unavailable
- **WHEN** the anime is created
- **THEN** `totalcap` and `duracion` are serialized as null
- **AND** `portada` uses the documented empty-path sentinel
- **AND** no latest-aired value is substituted

### Requirement: Enrichment failure is explicit

Metadata lookup MAY degrade to documented null/sentinel values. A source,
gateway, ownership-registration, or persistence failure MUST return an error and
MUST NOT claim the create succeeded.

#### Scenario: Persistence fails

- **GIVEN** a canonical record has been built
- **WHEN** the gateway cannot persist it
- **THEN** the caller receives an error and no success result

### Requirement: Register-first ownership and result

The bridge MUST register the id as Bridge-native before append and MUST fail
closed if registration fails. A successful create MUST return the id and its
current `modified_at` token.

#### Scenario: Ownership registration fails

- **GIVEN** a valid create request
- **WHEN** Bridge-native registration fails
- **THEN** no Legacy write occurs and the create returns an error

#### Scenario: Create completes

- **GIVEN** registration and persistence succeed
- **WHEN** the create returns
- **THEN** the result contains the id and current `modified_at`
- **AND** reconcile recognizes the id as Bridge-native
