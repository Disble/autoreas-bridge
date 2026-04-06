# Apply Progress: SDD-02A Anime Legacy Raw Model

## Scope Applied

Implementación del modelo raw legacy del dominio Anime para compatibilidad con `animes.dat`, incluyendo wrappers de fechas `$$date`, preservación de opcionales/nulos, tri-state de `activo`, progreso fraccional, variantes `dia`/`orden` versus `dias[]`, round-trip lossless del subset soportado y validación con fixture real.

## Safety Net Before Changes

- No existía todavía `internal/anime/domain/`; el safety net inicial fue abrir el cambio con tests nuevos aislados en `internal/anime/domain/anime_raw_test.go`.
- Se decidió usar `resources/autoreas-data/animes.dat` como fixture real de compatibilidad en copia temporal, siguiendo las reglas del repo y `bridge-testing`.

## TDD Cycle Evidence

| Slice / Task | RED | GREEN | TRIANGULATE | SAFETY NET | REFACTOR | Evidence |
|------|-----|-------|-------------|------------|----------|----------|
| 2.1-2.3 `$$date` wrapper | ✅ Written | ✅ Passed | ✅ 2 cases | N/A (new) | Helpers de fecha consolidados detrás de `LegacyDateField.Time()` | `TestLegacyAnimeRawParsesDateWrapperAndMarshalsItBack`; `TestLegacyAnimeRawPreservesDateNullAndAbsence`; `internal/anime/domain/anime_raw.go` |
| 2.4-2.6 Opcionales y `null` | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ 1/1 | `rawField` quedó como base común para wrappers opcionales | `TestLegacyAnimeRawPreservesOptionalNullableFields`; `LegacyStringField`; `LegacyNumberField`; `LegacyJSONArrayField` |
| 3.1-3.3 `activo` tri-state | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ 1/1 | Helper explícito `TriState()` sin colapsar ausente a `false` | `TestLegacyAnimeRawPreservesActivoTriState`; `LegacyBoolField.TriState()` |
| 3.4-3.6 progreso fraccional + variantes de días | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ 1/1 | `ToAnime()` normaliza sin destruir el raw model | `TestLegacyAnimeRawSupportsFractionalProgressAndDayVariants`; `TestLegacyAnimeRawToAnimeNormalizesSupportedFields`; `TestLegacyAnimeRawToAnimeFallsBackToLegacyDiaOrden` |
| 4.1-4.3 round-trip lossless | ✅ Written | ✅ Passed | ➖ Single | ✅ 1/1 | Se simplificaron `assignOptionalField`, `marshalJSONObject` y clonación de JSON | `TestLegacyAnimeRawRoundTripsMixedLegacyPayload`; `LegacyAnimeRaw.MarshalJSON`; `LegacyAnimeRaw.UnmarshalJSON` |
| 4.4-4.5 fixture real `animes.dat` | ✅ Written | ✅ Passed | ➖ Single | ✅ 1/1 | El test quedó orientado a compatibilidad real usando copia temporal del fixture | `TestLegacyAnimeRawParsesRealFixtureWithoutMutatingOriginal` |

Resumen verificable esperado por Strict TDD:
- RED: todas las slices reportadas como `✅ Written` tienen tests existentes en `internal/anime/domain/anime_raw_test.go`.
- GREEN: todas las slices reportadas como `✅ Passed` quedan respaldadas por los comandos de `go test` listados abajo y por el suite actual en verde.
- TRIANGULATE: los conteos de casos se basan en subtests/casos explícitos dentro del archivo de tests; cuando una slice protege un único escenario contractual se marca `➖ Single`.
- SAFETY NET: `N/A (new)` solo se usa para la primera slice porque el paquete/archivo aún no existía; en las restantes slices se reutilizó y reejecutó el mismo archivo de tests antes de ampliar comportamiento.

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/anime/domain/anime.go` | New | Modelo semántico `Anime` y `TriState` |
| `internal/anime/domain/anime_raw.go` | New | Raw model legacy, wrappers JSON, marshal/unmarshal y `ToAnime()` |
| `internal/anime/domain/anime_raw_test.go` | New | Safety net creciente para slices de compatibilidad legacy |
| `openspec/changes/sdd-02a-anime-legacy-raw-model/tasks.md` | Modified | Marcado completo tras aplicar el cambio |
| `openspec/changes/sdd-02a-anime-legacy-raw-model/verify-report.md` | Modified | Evidencia de verify y verdict del cambio |

## Commands Executed

```text
go test ./internal/anime/domain/... -run TestLegacyAnimeRawParsesDateWrapperAndMarshalsItBack
go test ./internal/anime/domain/...
go test ./internal/anime/domain/... -run "TestLegacyAnimeRawPreservesDateNullAndAbsence|TestLegacyAnimeRawPreservesOptionalNullableFields|TestLegacyAnimeRawPreservesActivoTriState|TestLegacyAnimeRawSupportsFractionalProgressAndDayVariants|TestLegacyAnimeRawRoundTripsMixedLegacyPayload|TestLegacyAnimeRawParsesRealFixtureWithoutMutatingOriginal"
go test ./internal/anime/domain/... -run TestLegacyAnimeRawParsesRealFixtureWithoutMutatingOriginal
gofmt -w internal/anime/domain/anime.go internal/anime/domain/anime_raw.go internal/anime/domain/anime_raw_test.go
go test ./internal/anime/domain/... -run "TestLegacyAnimeRawToAnimeNormalizesSupportedFields|TestLegacyAnimeRawToAnimeFallsBackToLegacyDiaOrden"
go test ./...
go vet ./...
golangci-lint run
```

## Outcome

- Se implementó el scope completo de SDD-02A.
- El suite quedó verde y el fixture real fue validado sin mutar `resources/autoreas-data/animes.dat`.
- La implementación dejó listo el borde raw para que SDD-03 reutilice `LegacyAnimeRaw` como frontera del parser.
