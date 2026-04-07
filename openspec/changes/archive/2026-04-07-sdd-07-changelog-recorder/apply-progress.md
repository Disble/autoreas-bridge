# Apply Progress: SDD-07 Changelog Recorder

## Scope Applied

Implementación del changelog recorder en `internal/sync`, con tabla `changelog` en SQLite, repositorio de inserción `pending`, suscripción a `AnimeChangedEvent` y wiring en `app.go`.

## Safety Net Before Changes

- SQLite bootstrap ya estaba cubierto por `sqlite_bootstrap_test.go` y los repos de snapshots tenían integración real.
- `app.go` ya estaba protegido por tests de startup/shutdown de Anime y tracer bullet.
- El bus de eventos ya tenía contratos y tests verdes.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1-2.2 insert pending en SQLite | `internal/sync/changelog_store_test.go` | Integration | ✅ bootstrap SQLite baseline | ✅ Written | ✅ Passed | ✅ table exists + insert row | ✅ schema explícito y repo mínimo |
| 3.1-3.2 recorder persiste AnimeChangedEvent | `internal/sync/changelog_recorder_test.go` | Unit | ✅ store baseline | ✅ Written | ✅ Passed | ➖ single event path | ✅ recorder pequeño sobre bus |
| 3.3-3.4 ignore unrelated events + error path | `internal/sync/changelog_recorder_test.go` | Unit | ✅ recorder baseline | ✅ Written | ✅ Passed | ✅ unrelated event + insert error | ✅ API `Start/Stop/Err` mínima |
| 4.1-4.2 app wiring del recorder | `app_test.go` | Unit | ✅ app startup/shutdown suite | ✅ Written | ✅ Passed | ✅ startup + shutdown stop path | ✅ seams `newChangelogStore` y `newChangelogRecorder` |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/sync/changelog_store.go` | New | Repo SQLite para filas pending |
| `internal/sync/changelog_store_test.go` | New | Integración SQLite para changelog |
| `internal/sync/changelog_recorder.go` | New | Recorder suscripto a `AnimeChangedEvent` |
| `internal/sync/changelog_recorder_test.go` | New | Tests unitarios del recorder |
| `internal/sync/sqlite_bootstrap.go` | Modified | Crea tabla `changelog` |
| `app.go` | Modified | Wiring/start/stop del recorder |
| `app_test.go` | Modified | Tests de startup/shutdown del recorder |
| `openspec/changes/sdd-07-changelog-recorder/tasks.md` | Modified | Checklist completo |
| `openspec/changes/sdd-07-changelog-recorder/verify-report.md` | Modified | Resultado final de verify |

## Commands Executed

```text
go test ./internal/sync/... -run TestSQLiteChangelogStoreInsertsPendingRow
go test ./internal/sync/... -run TestBootstrapBridgeDBCreatesChangelogTable
go test ./internal/sync/... -run TestChangelogRecorderPersistsAnimeChangedEvents
go test ./internal/sync/... -run TestChangelogRecorderIgnoresUnrelatedEvents
go test ./internal/sync/... -run TestChangelogRecorderStoresInsertErrors
go test ./... -run "Test(AppStartup|AppShutdown|Changelog)"
go test ./...
golangci-lint run
go vet ./...
go test ./... -cover
go run ./tools/checksdd
```

## Outcome

- El dominio Sync ahora persiste `AnimeChangedEvent` como filas `pending` en SQLite `changelog`.
- El bootstrap prepara `changelog` junto con `anime_snapshots`.
- La app integra el recorder en startup/shutdown sin romper Anime lifecycle.
