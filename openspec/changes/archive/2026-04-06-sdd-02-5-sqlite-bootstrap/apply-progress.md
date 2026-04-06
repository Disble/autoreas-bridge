# Apply Progress: SDD-02.5 SQLite Bootstrap

## Status

- Mode: Strict TDD
- Outcome: Implemented
- Scope: Completed bootstrap reusable de SQLite en `internal/sync` y wiring mínimo en startup.

## Completed Tasks

- [x] Bootstrap reusable con resolución de ruta UAC-safe usando `os.UserConfigDir()`.
- [x] Creación automática de `Autoreas/data` y apertura file-backed con `modernc.org/sqlite`.
- [x] Aplicación y verificación de `PRAGMA journal_mode=WAL` y `PRAGMA busy_timeout=5000`.
- [x] Creación idempotente de `anime_snapshots`.
- [x] Wiring mínimo en `App.startup` para dejar SQLite lista para SDD-03.
- [x] Evidencia Strict TDD y verificación final en artefactos del cambio.

## TDD Evidence

| Task Group | RED | GREEN | REFACTOR |
|---|---|---|---|
| Path UAC-safe | `go test ./internal/sync -run TestSQLiteBootstrapResolveBridgeDBPath` falló por símbolos inexistentes (`SQLiteBootstrap`, helper de asserts) | mismo comando quedó verde tras implementar `ResolveBridgeDBPath()` | extracción de constantes y defaults inyectables en `SQLiteBootstrap` |
| Open + PRAGMAs + schema | `go test ./internal/sync -run "Test(OpenBridgeDBOpensFileBackedSQLiteDatabase|BootstrapBridgeDBCreatesAnimeSnapshotsTableIdempotently|BootstrapBridgeDBReturnsPathInErrorContext)"` falló por API inexistente | mismo comando quedó verde tras implementar `OpenBridgeDB`, `BootstrapBridgeDB`, PRAGMAs y DDL | separación `initializeBridgeDB` / `applyBridgePragmas`, verificación explícita de WAL y busy timeout |
| Wiring startup | `go test . -run TestAppStartup` falló por campos inexistentes en `App` | mismo comando quedó verde tras inyectar bootstrap en startup | wiring mínimo desacoplado vía función inyectable `bootstrapBridgeDB` |

## Verification Snapshot

- `go test ./...` ✅
- `go vet ./...` ✅
- `golangci-lint run` ✅

## Notes

- `anime_snapshots` se dejó con shape mínimo (`anime_id`, `snapshot_json`, `snapshot_hash`) para destrabar SDD-03 sin adelantar repositorios completos de SDD-06.
- `app.go` conserva el handle `*sql.DB` y el error de arranque para wiring posterior.
