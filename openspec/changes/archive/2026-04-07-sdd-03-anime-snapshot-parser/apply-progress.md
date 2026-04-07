# Apply Progress: SDD-03 Anime Snapshot Parser

## Scope Applied

Implementación completa del parser streaming de `animes.dat`, consolidación efectiva por `_id` con tombstones, snapshot store SQLite con pruning transaccional, diff retroactivo con `AnimeChangedEvent{Payload:nil}` para deletes, y wiring async/cancelable del startup catch-up desde la app.

## Safety Net Before Changes

- `go test ./... -run "TestAppStartup"` pasó en verde antes de tocar `app.go`.
- `go test ./internal/sync/... -run "Test(SQLiteBootstrap|OpenBridgeDB|BootstrapBridgeDB|ModerncSQLiteDriver)"` pasó en verde antes de extender `internal/sync`.
- `internal/anime/` todavía no existía como paquete productivo; las primeras slices arrancaron con tests nuevos aislados.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1-2.3 BOM + parser puro | `internal/anime/parser_test.go` | Unit | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ lectura BOM encapsulada en parser streaming |
| 2.4-2.5 línea corrupta warning+continue | `internal/anime/parser_test.go` | Unit | ✅ anime slice baseline | ✅ Written | ✅ Passed | ✅ corrupta + líneas sanas | ✅ warnings aislados en `ParseWarning` |
| 2.6-2.9 línea larga + canonicalización/hash + tombstone/inactivo | `internal/anime/parser_test.go` | Unit | ✅ anime slice baseline | ✅ Written | ✅ Passed | ✅ append-only, larga, tombstone, activo=false | ✅ `SnapshotRecord` y `HashSnapshot` extraídos |
| 3.1-3.3 replace baseline + pruning | `internal/sync/anime_snapshot_store_test.go` | Integration | ✅ sync baseline | ✅ Written | ✅ Passed | ✅ alta/update/delete | ✅ placeholders dinámicos y orden estable |
| 4.1-4.8 coordinador async/cancelable + diff + deletes | `internal/anime/startup_catchup_test.go` | Unit | ✅ anime slice baseline | ✅ Written | ✅ Passed | ✅ ghost file, file appears, cancel, delete nil | ✅ seams para ticker/fs/logger/publisher/store |
| 5.1-5.2 catch-up con SQLite real | `internal/anime/startup_catchup_integration_test.go` | Integration | ✅ anime+sync baseline | ✅ Written | ✅ Passed | ✅ update + create + prune delete | ✅ wiring real sobre SQLite temporal |
| 5.3-5.4 fixture real `animes.dat` | `internal/anime/parser_test.go` | Integration | ✅ anime slice baseline | ✅ Written | ✅ Passed | ➖ Single | ✅ parser quedó tolerante sin fatal warning |
| 5.5 startup/shutdown app wiring | `app_test.go` | Unit | ✅ app baseline | ✅ Written | ✅ Passed | ✅ startup async + shutdown cancel | ✅ App inyectable para parser/store/coordinator |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/anime/snapshot.go` | New | DTO canónico, hash `sha256` y diff de snapshots |
| `internal/anime/parser.go` | New | Parser streaming con BOM stripping, warnings y tombstones |
| `internal/anime/startup_catchup.go` | New | Coordinador async/cancelable con idle polling y publicación de deltas |
| `internal/anime/logger.go` | New | Logger mínimo para warnings del catch-up |
| `internal/anime/paths.go` | New | Resolución de `animes.dat` bajo `%APPDATA%\Autoreas\data` |
| `internal/anime/parser_test.go` | New | Unit/integration tests del parser, diff y fixture real |
| `internal/anime/startup_catchup_test.go` | New | Tests unitarios del coordinador con fakes |
| `internal/anime/startup_catchup_integration_test.go` | New | Integración con SQLite temporal real |
| `internal/sync/anime_snapshot_store.go` | New | Store SQLite para `anime_snapshots` con upsert+prune transaccional |
| `internal/sync/anime_snapshot_store_test.go` | New | Test del baseline replace/pruning |
| `app.go` | Modified | Wiring del coordinador y cancelación lifecycle |
| `app_test.go` | Modified | Tests de startup/shutdown async |
| `main.go` | Modified | Hook de `OnShutdown` para cancelar catch-up |
| `openspec/changes/sdd-03-anime-snapshot-parser/tasks.md` | Modified | Tareas marcadas como completas |
| `openspec/changes/sdd-03-anime-snapshot-parser/verify-report.md` | Modified | Matriz final de cumplimiento y quality gates |

## Commands Executed

```text
go test ./... -run "TestAppStartup"
go test ./internal/sync/... -run "Test(SQLiteBootstrap|OpenBridgeDB|BootstrapBridgeDB|ModerncSQLiteDriver)"
go test ./internal/anime/... -run "TestSnapshotParserStripsUTF8BOMFromFirstLine|TestStartupCoordinatorStartsAsyncAndWaitsForGhostFile"
go test ./internal/sync/... -run TestSQLiteAnimeSnapshotStoreReplaceBaselineUpsertsAndPrunes
go test ./internal/anime/... -run "TestSnapshotParserStripsUTF8BOMFromFirstLine|TestSnapshotParserWarnsAndContinuesAfterCorruptLine|TestSnapshotParserSupportsLongLinesAndCanonicalHashesPerID|TestSnapshotParserDistinguishesTombstonesFromInactiveRecords|TestStartupCoordinatorStartsAsyncAndWaitsForGhostFile|TestStartupCoordinatorProcessesAppearingFileDiffsAndPrunesDeletes|TestStartupCoordinatorRespectsCancellationWhileWaiting"
go test . -run "TestAppStartup|TestAppShutdownCancelsAnimeCatchUp"
go test ./internal/anime/... -run "TestSnapshotParser|TestStartupCoordinator"
go test ./internal/sync/... -run "Test(SQLiteAnimeSnapshotStoreReplaceBaselineUpsertsAndPrunes|SQLiteBootstrap|OpenBridgeDB|BootstrapBridgeDB|ModerncSQLiteDriver)"
go test ./internal/anime/... -run "TestSnapshotParser|TestDiffSnapshotsSkipsUnchangedEffectiveRecords|TestStartupCoordinator"
go test ./internal/anime/... -run "Test(StartupCoordinatorCatchUpIntegrationWithSQLiteBaseline|SnapshotParser|DiffSnapshotsSkipsUnchangedEffectiveRecords|StartupCoordinator)"
gofmt -w internal/anime/snapshot.go internal/anime/parser.go internal/anime/startup_catchup.go internal/anime/logger.go internal/anime/paths.go internal/anime/parser_test.go internal/anime/startup_catchup_test.go internal/anime/startup_catchup_integration_test.go internal/sync/anime_snapshot_store.go internal/sync/anime_snapshot_store_test.go app.go app_test.go main.go
go test ./...
go vet ./...
golangci-lint run
```

## Outcome

- SDD-03 quedó implementado dentro del scope: sin adelantar watcher SDD-04 ni writer SDD-05.
- El startup catch-up ya no bloquea `App.startup`; corre en background y se cancela en shutdown.
- El parser consolida estado efectivo por `_id`, tolera BOM/líneas corruptas, distingue tombstones de `activo=false`, y el baseline SQLite se reemplaza con pruning transaccional.
