# Tasks: SDD-04 Windows-Resilient File Watcher

## Phase 1: Architecture Setup

- [x] 1.1 Diseñar el servicio watcher runtime en `internal/anime` separado del catch-up de startup.
- [x] 1.2 Definir seams para backend filesystem, debounce/timer y publicación de eventos.
- [x] 1.3 Elegir cómo sostener el baseline runtime sin duplicar ni contradecir la lógica efectiva de `SDD-03`.

## Phase 2: Strict TDD — filtro, debounce y retry

- [x] 2.1 RED: escribir test que pruebe que solo eventos del basename `animes.dat` disparan trabajo.
- [x] 2.2 GREEN: implementar filtrado mínimo por directorio padre + basename.
- [x] 2.3 RED: escribir test que pruebe coalescing de bursts mediante debouncer.
- [x] 2.4 GREEN: implementar debounce sin parseos redundantes.
- [x] 2.5 RED: escribir test que pruebe recuperación/retry ante error del watcher backend.
- [x] 2.6 GREEN/REFACTOR: implementar retry loop manteniendo la API pequeña.

## Phase 3: Strict TDD — parseo runtime y publication

- [x] 3.1 RED: escribir test que pruebe publicación de `AnimeChangedEvent` usando parser/diff efectivos ante cambio runtime.
- [x] 3.2 GREEN: integrar parser/diff de `SDD-03` al watcher runtime.
- [x] 3.3 RED: escribir test de rename/remove/create atómico que garantice no-detachment.
- [x] 3.4 GREEN: cerrar integración con backend real y filesystem temporal.
- [x] 3.5 REFACTOR: mantener boundaries claros entre startup catch-up y watcher runtime.

## Phase 4: Wiring & Verification

- [x] 4.1 RED: extender `app_test.go` para verificar startup/shutdown del watcher sin romper `SDD-03`.
- [x] 4.2 GREEN: integrar watcher runtime en `app.go` con cancelación/espera limpias.
- [x] 4.3 Ejecutar `go test ./...`.
- [x] 4.4 Ejecutar `golangci-lint run`.
- [x] 4.5 Ejecutar `go vet ./...`.
- [x] 4.6 Revisar cumplimiento explícito contra `docs/sdd-tree.md` y esta spec antes de cerrar verify.
