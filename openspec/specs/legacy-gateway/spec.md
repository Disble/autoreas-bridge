# Legacy Gateway Specification

Change: `2026-07-14-sdd-49-anime-repeat-restore-edit`
Capability: `legacy-gateway`

## Purpose

One mandatory anti-corruption gateway MUST own all `animes.dat` communication
without leaking or losing Legacy-only data.

## Requirements

### Requirement: Exclusive Legacy I/O

Exactly one Legacy gateway MUST open, parse, serialize, append, and validate
`animes.dat`. Other modules MUST use its English contracts and MUST NOT construct
Legacy JSON or use Spanish wire vocabulary.

#### Scenario: Feature persists through the gateway

- **GIVEN** Create, Repeat, Restore, reconcile, or a query needs Legacy data
- **WHEN** it reads or writes `animes.dat`
- **THEN** the operation crosses the shared gateway
- **AND** no parallel file or serialization path is used

### Requirement: Lossless three-layer mapping

The wire representation MUST preserve known nullable fields and unknown fields.
The mapper MUST extract Bridge domain state and MUST merge only changed,
gateway-owned fields into the original raw envelope. Domain operations MUST run
on the Bridge aggregate, not the wire DTO. An update MUST NOT require optional
metadata to be non-null.

#### Scenario: Older nullable record is updated without loss

- **GIVEN** a valid older record has null `totalcap` and `duracion` plus an unknown field
- **WHEN** Repeat or Restore changes owned domain fields
- **THEN** the write succeeds without blanket completeness rejection
- **AND** both nulls and the unknown field round-trip unchanged

### Requirement: Canonical outbound representation

Creates MUST include required structural fields and explicit nullable metadata.
Updates MUST validate the changed structural invariants while preserving the
original envelope. `portada` MUST retain Legacy's object shape, using the
documented empty-path sentinel only when a create has no cover.

#### Scenario: Update does not repair unrelated metadata destructively

- **GIVEN** an existing parseable record has historical metadata variants
- **WHEN** Restore changes activation fields
- **THEN** unrelated variants are emitted exactly as received

### Requirement: Honest read and write failures

Malformed inbound data, read failure, missing anime, append failure, and snapshot
persistence failure MUST return explicit errors. The gateway MUST NOT return a
success outcome or publish `anime.changed` for an unconfirmed write.

#### Scenario: Inbound record cannot be parsed

- **GIVEN** the requested anime's effective Legacy record is malformed
- **WHEN** the gateway loads it for an update
- **THEN** the update returns a parse error and performs no write

#### Scenario: Legacy source cannot be read

- **GIVEN** `animes.dat` cannot be read
- **WHEN** a gateway query or update starts
- **THEN** it returns a read error and does not synthesize a record

#### Scenario: Durable write fails

- **GIVEN** a valid merged envelope
- **WHEN** append or required SQLite persistence fails
- **THEN** the gateway returns an error and does not claim success

### Requirement: Gateway is independent of metadata sources

The gateway MUST accept already-enriched Create input and MUST NOT call or depend
on scraper or cover-source adapters.

#### Scenario: Metadata provider is unavailable

- **GIVEN** the application service has represented unknown metadata honestly
- **WHEN** it calls Create
- **THEN** the gateway serializes that input without invoking a scraper
