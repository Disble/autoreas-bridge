# Tasks: SDD-02A Anime Legacy Raw Model

## Phase 1: Foundation

- [x] 1.1 Crear `internal/anime/domain/anime.go` y `internal/anime/domain/anime_raw.go` con separación explícita entre modelo de dominio y raw legacy.
- [x] 1.2 Crear `internal/anime/domain/anime_raw_test.go` con el primer tracer bullet de unmarshal/marshal legacy.
- [x] 1.3 Crear `openspec/changes/sdd-02a-anime-legacy-raw-model/verify-report.md` con la estructura base de verificación Strict TDD.

## Phase 2: Strict TDD — fechas y opcionales

- [x] 2.1 RED: escribir tests para `$$date` en `fechaEstreno` y `fechaUltCapVisto` exigiendo extracción a `time.Time` y remarshaling compatible.
- [x] 2.2 GREEN: implementar el wrapper mínimo de fecha legacy en `internal/anime/domain/anime_raw.go`.
- [x] 2.3 REFACTOR: consolidar helpers de fecha para evitar duplicación.
- [x] 2.4 RED: escribir tests para campos opcionales/nulos (`duracion`, `tipo`, `pagina`, `carpeta`, `estudios`, `generos`) cubriendo ausente, `null` y valor presente.
- [x] 2.5 GREEN: implementar el manejo mínimo de opcionales/nulos preservando ausencia vs `null`.
- [x] 2.6 REFACTOR: ordenar nombres y helpers sin esconder semántica legacy.

## Phase 3: Strict TDD — compatibilidad legacy real

- [x] 3.1 RED: escribir tests para `activo` tri-state diferenciando `true`, `false` y ausente.
- [x] 3.2 GREEN: implementar el tipo mínimo para `activo` tri-state sin colapsar ausente a `false`.
- [x] 3.3 REFACTOR: extraer helpers de presencia si reducen ruido sin perder claridad.
- [x] 3.4 RED: escribir tests para `nrocapvisto` fraccional y compatibilidad `dia`/`orden` versus `dias[]`.
- [x] 3.5 GREEN: implementar soporte mínimo para progreso fraccional y variantes históricas de días.
- [x] 3.6 REFACTOR: asegurar convivencia de ambas variantes sin normalización destructiva.

## Phase 4: Round-trip, fixture real y verify

- [x] 4.1 RED: escribir tests de round-trip lossless con payloads sintéticos mixtos (`$$date`, `0.5`, `activo` ausente, schema legacy).
- [x] 4.2 GREEN: ajustar marshal/unmarshal para preservar wrappers, nulabilidad y variantes legacy.
- [x] 4.3 REFACTOR: simplificar fixtures inline y assertions manteniendo legibilidad.
- [x] 4.4 RED: agregar test contra `resources/autoreas-data/animes.dat` en modo solo lectura o copia temporal.
- [x] 4.5 GREEN: completar el modelo raw mínimo hasta dejar en verde casos unitarios y fixture real.
- [x] 4.6 REFACTOR/VERIFY: ejecutar `go test ./...`, `golangci-lint run` y `go vet ./...`; documentar evidencia y verdict en `verify-report.md`.
