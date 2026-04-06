# Design: SDD-02A Anime Legacy Raw Model

## Technical Approach

Crear dos modelos dentro de `internal/anime/domain`: un modelo semántico `Anime` para el dominio y un modelo de borde `LegacyAnimeRaw` para representar fielmente los documentos de `animes.dat`. El raw model será responsable de convivir con `$$date`, campos ausentes, `null`, `activo` tri-state, números fraccionales y variantes históricas del schema. La conversión a `Anime` queda explícita para evitar que el dominio dependa de detalles de NeDB.

## Architecture Decisions

### Decision: separar modelo raw del modelo de dominio

**Choice**: crear `internal/anime/domain/anime.go` para `Anime` y `internal/anime/domain/anime_raw.go` para `LegacyAnimeRaw` y helpers.
**Alternatives considered**: un único struct para raw + dominio; `map[string]any` sin tipos.
**Rationale**: un único struct mezcla semántica de negocio con compatibilidad legacy y vuelve frágil la evolución de SDD-03 y SDD-05. `map[string]any` preserva flexibilidad, pero destruye seguridad de tipos y hace opaco el round-trip.

### Decision: wrappers tipados para `$$date` y presencia/ausencia

**Choice**: usar tipos dedicados que implementen `json.Unmarshaler` y `json.Marshaler` para fechas legacy, y wrappers o punteros para diferenciar ausente, `null` y valor presente.
**Alternatives considered**: `time.Time` directo; `json.RawMessage` en todos los campos.
**Rationale**: `time.Time` directo no distingue ausencia ni preserva el shape `{"$$date": ...}`; `json.RawMessage` para todo sacrifica semántica y hace los tests menos expresivos.

### Decision: `activo` tri-state explícito

**Choice**: representar `activo` con un tipo explícito que distinga `true`, `false` y ausente.
**Alternatives considered**: `bool`; `*bool` sin helpers.
**Rationale**: la arquitectura del proyecto aclara que `activo=false` NO es tombstone y que la ausencia del campo también existe en el legacy. Un tipo dedicado hace esa diferencia visible y testeable.

### Decision: tolerar schema histórico sin normalización destructiva

**Choice**: aceptar tanto `dia`/`orden` como `dias[]` en el raw model y ofrecer una vista normalizada al dominio sin perder la forma de entrada al remarshaling.
**Alternatives considered**: soportar solo `dias[]`; convertir todo al schema nuevo al parsear.
**Rationale**: SDD-02A exige compatibilidad real y round-trip lossless. Normalizar destruyendo la forma original rompería ese contrato.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/anime/domain/anime.go` | Create | Modelo semántico `Anime` y tipos del dominio |
| `internal/anime/domain/anime_raw.go` | Create | `LegacyAnimeRaw`, wrappers legacy y conversión explícita |
| `internal/anime/domain/anime_raw_test.go` | Create | Tests TDD para fechas, opcionales, tri-state y round-trip |
| `openspec/changes/sdd-02a-anime-legacy-raw-model/*` | Create | Artefactos del cambio |

## Interfaces / Contracts

```go
package domain

type Anime struct {
	ID               string
	Nombre           string
	NroCapVisto      float64
	Dias             []AnimeDay
	ActivoState      TriState
	FechaEstreno     *time.Time
	FechaUltCapVisto *time.Time
}

type LegacyAnimeRaw struct {
	ID               string          `json:"_id"`
	Nombre           string          `json:"nombre"`
	NroCapVisto      float64         `json:"nrocapvisto"`
	Activo           LegacyTriState  `json:"activo,omitempty"`
	FechaEstreno     LegacyDateField `json:"fechaEstreno"`
	FechaUltCapVisto LegacyDateField `json:"fechaUltCapVisto"`
	Dia              *string         `json:"dia,omitempty"`
	Orden            *float64        `json:"orden,omitempty"`
	Dias             []LegacyAnimeDay `json:"dias,omitempty"`
}
```

Contrato clave:
- `LegacyAnimeRaw` MUST soportar unmarshal/marshal lossless del subset cubierto por SDD-02A.
- `Anime` MUST permanecer libre de detalles específicos de NeDB.
- La conversión raw → dominio MUST ser explícita.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `$$date` con valor, `null` y ausencia | Table-driven tests de unmarshal/marshal |
| Unit | Campos opcionales/nulos | Casos separados para ausente vs `null` vs valor |
| Unit | `activo` tri-state | Casos `true`, `false`, ausente |
| Unit | `nrocapvisto` fraccional | Casos `0.5`, `10.5`, entero |
| Unit | Compatibilidad `dia`/`orden` y `dias[]` | Inputs legacy y actuales en payloads sintéticos |
| Unit | Round-trip lossless | Unmarshal → Marshal y comparación semántica del payload |
| Integration | Compatibilidad con fixture real | Leer `resources/autoreas-data/animes.dat` en modo solo lectura/copia temporal |

## Migration / Rollout

No migration required.

## Resolved Notes

- La metadata de presencia/ausencia queda confinada a `LegacyAnimeRaw`; `Anime` conserva solo la semántica útil del dominio.
- El criterio de round-trip para SDD-02A se considera satisfecho por equivalencia estructural y semántica del JSON soportado; no se exige preservar el orden textual de claves.
