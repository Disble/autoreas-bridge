# Tasks: SDD-06 Sync SQLite Repositories

## Phase 1: Contract & Boundaries

- [x] 1.1 Definir en `internal/sync/sqlite_store.go` el contrato reusable de repositorios Sync (`SyncSQLiteProvider` + tipos Sync-only), sin importar `internal/anime`.
- [x] 1.2 Ajustar `internal/sync/changelog_store.go` y su constructor para depender de ese contrato compartido y dejar explícitos los límites con `sqlite_bootstrap.go` y SDD-07, sin reabrir responsabilidades de bootstrap base ni recorder más allá de ajustes mínimos de contrato/wiring si fueran necesarios.
- [x] 1.3 Crear/actualizar tests de contrato en `internal/sync/changelog_store_test.go` o `internal/sync/sqlite_store_test.go` para probar handle compartido reutilizable y firmas desacopladas del dominio Anime.

## Phase 2: Strict TDD — concurrent stress

- [x] 2.1 RED: escribir en `internal/sync/changelog_store_test.go` un test file-backed con 100 goroutines que llamen inserciones `pending` en paralelo y hoy exponga cualquier `SQLITE_BUSY`.
- [x] 2.2 RED: agregar assertions para exigir exactamente 100 filas insertadas y cero errores `database is locked`.
- [x] 2.3 GREEN: endurecer `internal/sync/sqlite_bootstrap.go` con el manejo mínimo de pool/conexiones necesario para que el estrés pase sin reabrir decisiones de path, driver o WAL.
- [x] 2.4 GREEN: ajustar `internal/sync/changelog_store.go` para que la inserción concurrente use el provider reusable y conserve semántica `pending`.
- [x] 2.5 REFACTOR: extraer helpers chicos de ejecución/tx en `internal/sync/sqlite_store.go` y eliminar duplicación sin cambiar la API observable.

## Phase 3: Minimal reusable repository hardening

- [x] 3.1 Crear en `internal/sync/sqlite_store_test.go` una integración que pruebe que el contrato reusable expone la misma `*sql.DB` bootstrapeada y evita duplicar setup.
- [x] 3.2 Aplicar el contrato reusable al store de changelog y dejar preparado el punto de extensión para futuros repos `conflicts`/`sync_state`, sin implementar sus tablas.
- [x] 3.3 Revisar `internal/sync/changelog_recorder.go` y `app.go` solo para adaptar wiring mínimo al nuevo constructor, sin cambiar comportamiento funcional.

## Phase 4: Verify & spec alignment

- [x] 4.1 Ejecutar `go test ./...` y registrar evidencia de los escenarios RED → GREEN → REFACTOR del estrés concurrente.
- [x] 4.2 Ejecutar `golangci-lint run`.
- [x] 4.3 Ejecutar `go vet ./...`.
- [x] 4.4 Revisar cumplimiento explícito contra `docs/sdd-tree.md`, `openspec/changes/sdd-06-sync-sqlite-repositories/specs/sync-sqlite-repositories/spec.md` y `proposal.md` antes de cerrar `verify-report.md`.
