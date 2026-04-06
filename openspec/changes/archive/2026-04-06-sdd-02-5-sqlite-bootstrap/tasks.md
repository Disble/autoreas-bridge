# Tasks: SDD-02.5 SQLite Bootstrap

## Phase 1: Foundation

- [x] 1.1 Crear el bootstrap SQLite mínimo en `internal/sync` o infraestructura equivalente.
- [x] 1.2 Crear/ajustar tests base del bootstrap con Strict TDD.
- [x] 1.3 Crear `verify-report.md` base para el cambio.

## Phase 2: Strict TDD — path UAC-safe

- [x] 2.1 RED: escribir test para resolver una ruta UAC-safe de `bridge.db` bajo `os.UserConfigDir()`.
- [x] 2.2 GREEN: implementar la resolución de path y creación de directorio `Autoreas/data`.
- [x] 2.3 REFACTOR: consolidar helpers de path sin acoplarlos al startup.

## Phase 3: Strict TDD — apertura y PRAGMAs

- [x] 3.1 RED: escribir test file-backed que abra SQLite con `modernc.org/sqlite` sin usar `:memory:` como único caso.
- [x] 3.2 GREEN: implementar apertura de `bridge.db` y `Ping()` exitoso.
- [x] 3.3 REFACTOR: encapsular la inicialización de conexión en una API reusable.
- [x] 3.4 RED: escribir tests para verificar `PRAGMA journal_mode=WAL` y `PRAGMA busy_timeout=5000`.
- [x] 3.5 GREEN: aplicar los PRAGMAs durante el bootstrap y dejar evidencia observable.
- [x] 3.6 REFACTOR: ordenar la secuencia open → pragmas → schema sin duplicación.

## Phase 4: Strict TDD — schema y wiring mínimo

- [x] 4.1 RED: escribir test para creación idempotente de `anime_snapshots`.
- [x] 4.2 GREEN: crear `anime_snapshots` con `CREATE TABLE IF NOT EXISTS`.
- [x] 4.3 REFACTOR: encapsular migración mínima para que SDD-03 la reutilice.
- [x] 4.4 RED: escribir test o smoke de wiring mínimo para asegurar que el bootstrap puede invocarse desde startup.
- [x] 4.5 GREEN: integrar el bootstrap al arranque sin adelantar scope de repositorios.
- [x] 4.6 REFACTOR: mantener el wiring chico y desacoplado.

## Phase 5: Verification

- [x] 5.1 Ejecutar `go test ./...` y confirmar que los escenarios de bootstrap quedan verdes.
- [x] 5.2 Ejecutar `golangci-lint run` y `go vet ./...`.
- [x] 5.3 Actualizar `verify-report.md` con evidencia TDD, coverage y verdict.
