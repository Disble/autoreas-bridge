# Delta for Legacy Gateway

## MODIFIED Requirements

### Requirement: Lossless three-layer mapping

The wire representation MUST preserve known nullable fields, unknown fields, the complete Legacy `estudios` structure, and the complete Legacy `portada` object. The mapper MUST extract Bridge domain state and MUST merge only changed, gateway-owned fields into the original raw envelope. Domain operations MUST run on the Bridge aggregate, not the wire DTO. Editor saves and schedule updates MUST NOT require optional metadata to be non-null, and they MUST replace ordered `dias[]` only through the canonical merged envelope.

(Previously: The mapping preserved nullable and unknown fields, but it did not explicitly require full-fidelity `estudios` and `portada` round-trips for editor writes.)

#### Scenario: Older nullable record is updated without loss

- **GIVEN** a valid older record has null `totalcap` and `duracion` plus an unknown field
- **WHEN** Repeat or Restore changes owned domain fields
- **THEN** the write succeeds without blanket completeness rejection
- **AND** both nulls and the unknown field round-trip unchanged

#### Scenario: Editor save preserves full-fidelity legacy metadata

- **GIVEN** an editable anime has structured `estudios`, a structured `portada`, and unknown legacy fields
- **WHEN** a valid general save changes only user-editable fields
- **THEN** unchanged `estudios`, `portada`, and unknown fields round-trip without flattening or loss
- **AND** only the editor-owned field changes are merged into the raw envelope

### Requirement: Canonical outbound representation

Creates MUST include required structural fields and explicit nullable metadata. Updates, including general editor saves and schedule bulk applies, MUST validate changed structural invariants before append while preserving the original envelope. `portada` MUST retain Legacy's object shape, using the documented empty-path sentinel only when a create has no cover. General editor writes MUST stamp explicit `modified_at`, MUST exclude `_id`, `modified_at`, `repetir`, and `primeravez` from editable ownership, and MUST treat `activo=false` as deactivation rather than deletion.

(Previously: Updates preserved the original envelope and `portada` shape, but the editor-specific ownership, token, and deactivation rules were not stated.)

#### Scenario: Update does not repair unrelated metadata destructively

- **GIVEN** an existing parseable record has historical metadata variants
- **WHEN** Restore changes activation fields
- **THEN** unrelated variants are emitted exactly as received

#### Scenario: General editor rejects excluded ownership

- **GIVEN** a general editor request attempts to change `_id`, `modified_at`, `repetir`, or `primeravez`
- **WHEN** the gateway validates the merged update
- **THEN** the request is rejected
- **AND** no append is emitted for the excluded-field attempt

### Requirement: Honest read and write failures

Malformed inbound data, read failure, missing anime, validation failure, append failure, and snapshot persistence failure MUST return explicit errors. The gateway MUST NOT return a success outcome or publish `anime.changed` for an unconfirmed write. Failed editor saves and failed schedule bulk applies MUST append nothing, and a rejected schedule draft MUST NOT partially publish any changed record.

(Previously: The requirement covered malformed, read, missing, append, and persistence failures, but it did not explicitly state editor validation failures or whole-draft schedule rejection.)

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

#### Scenario: Invalid schedule draft emits nothing

- **GIVEN** a bulk schedule apply fails validation or authoritative conflict checks before commit
- **WHEN** the gateway handles the draft
- **THEN** the whole draft is rejected
- **AND** no partial append or publication is emitted for any anime in that draft
