# Anime Legacy Raw Model Specification

## Purpose

Definir el contrato de compatibilidad raw para `animes.dat` de modo que el dominio Anime pueda absorber las variaciones reales del schema legacy sin corromper datos al parsear ni al reserializar.

## Requirements

### Requirement: Legacy `$$date` compatibility

The system MUST deserialize NeDB date wrappers of the form `{"$$date": <unix-millis>}` into a native Go time representation and MUST serialize them back in the same legacy shape.

#### Scenario: Date wrapper is parsed and preserved
- GIVEN a raw anime payload that contains `{"$$date": 1609459200000}` in a date field
- WHEN the payload is unmarshaled into `LegacyAnimeRaw`
- THEN the field SHALL expose the native timestamp value to Go code
- AND marshaling the same struct SHALL emit the legacy `$$date` object again

#### Scenario: Null date remains null
- GIVEN a raw anime payload that contains `"fechaEstreno": null`
- WHEN the payload is unmarshaled and marshaled again
- THEN the field MUST remain explicit `null`

### Requirement: Optional and nullable fields are preserved losslessly

The system MUST preserve the difference between absent fields, explicit `null` fields, and concrete values for legacy optional properties.

#### Scenario: Missing optional field is not replaced by zero-value
- GIVEN a raw anime payload where an optional field such as `pagina` is absent
- WHEN the payload is unmarshaled and marshaled again
- THEN the resulting JSON MUST keep that field absent
- AND it MUST NOT inject a Go zero-value such as `""`

#### Scenario: Explicit null remains explicit null
- GIVEN a raw anime payload where an optional field such as `duracion` is explicitly `null`
- WHEN the payload is unmarshaled and marshaled again
- THEN the resulting JSON MUST keep `duracion` as `null`

### Requirement: `activo` is tri-state, not binary tombstone logic

The system MUST distinguish between `activo=true`, `activo=false`, and an omitted `activo` field.

#### Scenario: False is preserved as an explicit inactive state
- GIVEN a raw anime payload with `"activo": false`
- WHEN the payload is unmarshaled into `LegacyAnimeRaw`
- THEN the model SHALL preserve an explicit false state
- AND it SHALL NOT interpret that record as deleted

#### Scenario: Omitted `activo` stays omitted
- GIVEN a raw anime payload where `activo` is not present
- WHEN the payload is unmarshaled and marshaled again
- THEN the resulting JSON MUST keep `activo` absent

### Requirement: Fractional progress is supported

The system MUST accept `nrocapvisto` as a fractional number.

#### Scenario: Half episode progress is parsed without truncation
- GIVEN a raw anime payload with `"nrocapvisto": 0.5`
- WHEN the payload is unmarshaled into `LegacyAnimeRaw`
- THEN the progress value SHALL remain `0.5`
- AND it SHALL marshal back without truncating to `0`

### Requirement: Legacy day variants are tolerated

The system MUST tolerate both the legacy scalar variant `dia`/`orden` and the current `dias[]` variant.

#### Scenario: Current `dias[]` schema is parsed
- GIVEN a raw anime payload that uses `dias` as an array of objects
- WHEN the payload is unmarshaled into `LegacyAnimeRaw`
- THEN the model SHALL keep the `dias[]` representation available for round-trip serialization

#### Scenario: Historical `dia` and `orden` schema is parsed
- GIVEN a raw anime payload that uses legacy `dia` and `orden` scalar fields
- WHEN the payload is unmarshaled into `LegacyAnimeRaw`
- THEN the model SHALL accept that payload without error
- AND it SHALL preserve the legacy form when marshaled back

### Requirement: Round-trip is lossless for supported legacy records

The system MUST support lossless unmarshal → marshal round-trip for the subset of legacy anime records covered by SDD-02A.

#### Scenario: Mixed legacy payload round-trips without semantic loss
- GIVEN a raw anime payload that mixes `$$date`, fractional progress, omitted `activo`, and historical day fields
- WHEN the payload is unmarshaled into `LegacyAnimeRaw` and marshaled again
- THEN the resulting JSON SHALL preserve the same legacy semantics
- AND no supported field SHALL be dropped or rewritten with incompatible defaults

### Requirement: Real fixture compatibility is validated

The system MUST be validated against the real fixture `resources/autoreas-data/animes.dat` and MUST complement it with synthetic tests for schema variants not present in that file.

#### Scenario: Real fixture parses under the raw model
- GIVEN the repository fixture `resources/autoreas-data/animes.dat`
- WHEN the change verification runs its compatibility test
- THEN the covered records SHALL parse without errors under `LegacyAnimeRaw`

#### Scenario: Synthetic tests cover missing legacy edges
- GIVEN the real fixture does not expose every schema edge such as omitted `activo` or legacy `dia`/`orden`
- WHEN the unit suite runs
- THEN synthetic payloads MUST cover those missing edges explicitly
